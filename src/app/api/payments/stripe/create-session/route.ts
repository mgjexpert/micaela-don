import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { json, badRequest } from '@/lib/api'
import { clientIp } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { createCheckoutSession } from '@/lib/providers/stripe'
import { resolveDonationIntentId } from '@/lib/payments/intent'
import {
  generateInternalReference,
  validateAmount,
} from '@/lib/payments/types'

const schema = z.object({
  campaignId: z.string().trim().max(60).default('micaela'),
  amount: z.number().positive(),
  donationIntentId: z.string().trim().min(8).max(128).optional(),
  currency: z.enum(['EUR']).default('EUR'), // MB WAY is EUR only
  customerEmail: z.string().trim().email().max(160),
  customerName: z.string().trim().max(120).optional(),
})

/**
 * Creates a Stripe Checkout Session for MB WAY.
 *
 * Flow:
 * 1. Validate campaign exists and is published.
 * 2. Validate amount within server-defined limits (1–10000 EUR).
 * 3. Create internal PaymentOrder (status=pending).
 * 4. Create Stripe Checkout Session (server-side, secret key).
 * 5. Return the checkout URL; client redirects.
 *
 * The payment is NOT confirmed here. Only the webhook confirms it.
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

  // 1) Validate campaign
  const campaign = await db.campaign.findUnique({ where: { id: d.campaignId } })
  if (!campaign || campaign.status !== 'published') {
    return badRequest('Campanha não disponível.')
  }

  // 2) Validate amount (server-side limits; MB WAY EUR 1–10000)
  let amountStr: string
  try {
    amountStr = validateAmount(d.amount, 1, 10000)
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : 'Valor inválido.')
  }

  let donationIntentId: string | null
  try {
    donationIntentId = await resolveDonationIntentId(d.donationIntentId, {
      campaignId: campaign.id, currency: d.currency, amount: amountStr,
      paymentMethod: 'mbway', customerEmail: d.customerEmail,
    })
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : 'Intenção inválida.')
  }

  // 3) Create internal PaymentOrder
  const internalReference = generateInternalReference()
  const order = await db.paymentOrder.create({
    data: {
      campaignId: campaign.id,
      donationIntentId,
      provider: 'stripe',
      method: 'mbway',
      internalReference,
      currency: d.currency,
      amount: amountStr,
      status: 'pending',
      customerEmail: d.customerEmail,
      customerName: d.customerName ?? null,
      metadata: JSON.stringify({ provider: 'stripe', method: 'mbway' }),
    },
  })

  await audit({
    actor: 'public',
    action: 'payment_order_created',
    entity: 'PaymentOrder',
    entityId: order.id,
    detail: `provider=stripe method=mbway amount=${amountStr} ${d.currency}`,
    ip,
  })

  // 4) Create Stripe Checkout Session (embedded mode)
  try {
    // Canonical server-configured origin, not the request's Origin header.
    const baseUrl = (process.env.APP_BASE_URL ?? 'https://ajudar.charity').replace(/\/$/, '')
    const { sessionId, clientSecret } = await createCheckoutSession({
      internalReference,
      amount: d.amount,
      currency: d.currency,
      campaignName: campaign.name,
      customerEmail: d.customerEmail,
      returnUrl: `${baseUrl}/pagamento/sucesso?ref=${encodeURIComponent(internalReference)}`,
      metadata: {
        campaign_id: campaign.id,
        order_id: order.id,
      },
    })

    // Save the Stripe session id as externalId
    await db.paymentOrder.update({
      where: { id: order.id },
      data: { externalId: sessionId, status: 'processing' },
    })

    return json({ clientSecret, reference: internalReference, orderId: order.id })
  } catch (e) {
    // Mark order as failed
    await db.paymentOrder.update({
      where: { id: order.id },
      data: { status: 'failed' },
    })
    const msg = e instanceof Error ? e.message : 'Erro ao criar sessão de pagamento.'
    // Don't expose internal details
    return badRequest('Não foi possível iniciar o pagamento. Tente novamente.')
  }
}
