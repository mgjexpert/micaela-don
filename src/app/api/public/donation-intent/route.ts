import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { json, badRequest } from '@/lib/api'
import { clientIp } from '@/lib/auth'
import { audit } from '@/lib/audit'

// Server-side limits per currency (in minor units = cents).
const LIMITS: Record<string, { minMinor: number; maxMinor: number }> = {
  EUR: { minMinor: 100, maxMinor: 1000000 }, // €1.00 – €10,000.00
  BRL: { minMinor: 100, maxMinor: 5000000 }, // R$1.00 – R$50,000.00
}

// Suggested amounts per currency (in major units, for display).
export const SUGGESTED_AMOUNTS: Record<string, number[]> = {
  EUR: [5, 10, 20, 50],
  BRL: [20, 50, 100, 200],
}

const schema = z.object({
  campaignId: z.string().trim().max(60).default('micaela'),
  currency: z.enum(['EUR', 'BRL']),
  /// Amount in MINOR units (cents). This is the canonical value — validated server-side.
  amountMinor: z.number().int().nonnegative(),
  donorName: z.string().trim().min(1).max(120),
  donorEmail: z.string().trim().email().max(160).optional().or(z.literal('')),
  donorWhatsapp: z.string().trim().max(40).optional().or(z.literal('')),
  donorCountry: z.string().trim().length(2).optional(), // ISO code PT, BR, ...
  paymentMethod: z.enum(['mbway', 'pix_automatic', 'pix_manual', 'bank_transfer']),
  wantPackMedia: z.boolean().default(false),
  message: z.string().trim().max(1000).optional(),
  // Consent channels: which channels the donor wants to receive thank-yous on.
  consentChannels: z.array(z.enum(['email', 'whatsapp'])).default([]),
})

const validateWhatsapp = (v: string): boolean => {
  const cleaned = v.replace(/[\s\-()]/g, '')
  return /^\+\d{8,15}$/.test(cleaned)
}

/**
 * Creates a donation INTENT. Submitting this form is NOT proof of payment.
 * Confirmation is administrative or via a validated payment integration.
 *
 * The amount is validated server-side using minor units (cents) to avoid
 * floating-point issues. The client never controls the final amount.
 */
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('JSON inválido.')
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? 'Dados inválidos.')
  }
  const d = parsed.data
  const ip = clientIp(req)

  // Server-side amount validation
  const limits = LIMITS[d.currency]
  if (!limits) {
    return badRequest('Moeda não suportada.')
  }
  if (d.amountMinor < limits.minMinor) {
    return badRequest(`O valor mínimo é ${(limits.minMinor / 100).toFixed(2)} ${d.currency}.`)
  }
  if (d.amountMinor > limits.maxMinor) {
    return badRequest(`O valor máximo é ${(limits.maxMinor / 100).toFixed(2)} ${d.currency}.`)
  }

  // Validate: email consent requires email (already required, but double-check)
  if (d.consentChannels.includes('email') && !d.donorEmail) {
    return badRequest('Para consentir em receber agradecimento por e-mail, precisa de indicar o seu endereço.')
  }
  if (d.consentChannels.includes('whatsapp') && (!d.donorWhatsapp || !validateWhatsapp(d.donorWhatsapp))) {
    return badRequest('Para consentir em receber agradecimento por WhatsApp, indique um número válido com indicativo internacional (ex: +351 912 345 678).')
  }

  const campaign = await db.campaign.findUnique({ where: { id: d.campaignId }, select: { status: true } })
  if (!campaign || campaign.status !== 'published') return badRequest('Campanha não disponível.')

  // Validate: payment method compatibility with currency
  const methodCurrencyOk =
    (d.paymentMethod === 'mbway' && d.currency === 'EUR') ||
    (d.paymentMethod === 'pix_automatic' && d.currency === 'BRL') ||
    (d.paymentMethod === 'pix_manual' && d.currency === 'BRL') ||
    (d.paymentMethod === 'bank_transfer' && d.currency === 'EUR')
  if (!methodCurrencyOk) {
    return badRequest('O método de pagamento selecionado não é compatível com a moeda escolhida.')
  }

  // Determine initial status based on payment method
  // Manual methods (pix_manual, bank_transfer) start as 'awaiting_manual_confirmation'
  // Automatic methods (mbway, pix_automatic) start as 'pending' (will be confirmed by webhook)
  const initialStatus = (d.paymentMethod === 'pix_manual' || d.paymentMethod === 'bank_transfer')
    ? 'awaiting_manual_confirmation'
    : 'pending'

  // Create intent + explicit channel consents atomically.
  // No silent legacy-SQL fallback: database migrations are a release prerequisite.
  const intent = await db.$transaction(async (tx) => {
    const created = await tx.donationIntent.create({
      data: {
        campaignId: d.campaignId,
        currency: d.currency,
        amount: d.amountMinor / 100,
        amountMinor: d.amountMinor,
        donorName: d.donorName,
        donorEmail: d.donorEmail || null,
        donorWhatsapp: d.donorWhatsapp || null,
        donorCountry: d.donorCountry || null,
        paymentMethod: d.paymentMethod,
        wantPackMedia: d.wantPackMedia,
        message: d.message || null,
        status: initialStatus,
        ip,
      },
    })
    if (d.consentChannels.length) {
      await tx.consentRecord.createMany({
        data: d.consentChannels.map(channel => ({
          campaignId: d.campaignId,
          donorEmail: d.donorEmail || null,
          donorName: d.donorName,
          channel,
          consent: true,
          ip,
        })),
      })
    }
    return created
  })

  await audit({
    actor: 'public',
    action: 'donation_intent_created',
    entity: 'DonationIntent',
    entityId: intent.id,
    detail: `currency=${d.currency} amount=${d.amountMinor}(${d.amountMinor / 100}) method=${d.paymentMethod} pack=${d.wantPackMedia} consent=${d.consentChannels.join(',') || 'none'}`,
    ip,
  })

  return json(
    {
      id: intent.id,
      status: intent.status,
      paymentMethod: d.paymentMethod,
      currency: d.currency,
      amountMinor: d.amountMinor,
      wantPackMedia: d.wantPackMedia,
      message:
        'Recebemos a sua intenção. A confirmação do donativo é administrativa ou via webhook validado. Este formulário não comprova pagamento.',
    },
    { status: 201 },
  )
}
