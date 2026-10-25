import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { json, badRequest } from '@/lib/api'
import { clientIp } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { sendTelegramAlert, isTelegramConfigured } from '@/lib/notifications/telegram'
import { resolveDonationIntentId } from '@/lib/payments/intent'
import { getCanonicalAppBaseUrl } from '@/lib/payments/urls'
import {
  generateInternalReference,
  validateAmount,
} from '@/lib/payments/types'

const schema = z.object({
  campaignId: z.string().trim().max(60).default('micaela'),
  amount: z.number().positive(),
  donationIntentId: z.string().trim().min(8).max(128).optional(),
  currency: z.enum(['BRL']).default('BRL'),
  customerName: z.string().trim().max(120).optional(),
  customerEmail: z.string().trim().email().max(160).optional(),
  // WhatsApp is optional; used for thank-you consent only. NOT sent to Telegram.
  customerWhatsapp: z.string().trim().max(40).optional(),
  message: z.string().trim().max(500).optional(),
})

/**
 * Creates a manual PIX payment intention.
 *
 * This preserves the existing manual PIX flow:
 * 1. Customer chooses PIX manual on the campaign page.
 * 2. The site shows the configured QR/código PIX for the campaign.
 * 3. Customer submits this form to register the intention.
 * 4. Server creates a PaymentOrder (manual_pix, status=pending).
 * 5. Sends a private Telegram alert (if configured) with ONLY:
 *    order id, campaign name, amount, reference, admin link.
 *    NO CPF, NO email, NO phone.
 * 6. The admin verifies receipt externally and confirms manually.
 * 7. Only manual confirmation authorizes delivery.
 *
 * The form submission does NOT prove payment. The alert does NOT prove payment.
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

  // Do not advertise or accept a manual charge without a verified beneficiary QR.
  const manualPix = await db.pixConfig.findFirst({
    where: { campaignId: campaign.id, approved: true, published: true,
      qrImageData: { not: null } }, select: { id: true },
  })
  if (!manualPix) return badRequest('PIX manual indisponível nesta campanha.')

  // 2) Validate amount (BRL 1–50000)
  let amountStr: string
  try {
    amountStr = validateAmount(d.amount, 1, 50000)
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : 'Valor inválido.')
  }

  let donationIntentId: string | null
  try {
    donationIntentId = await resolveDonationIntentId(d.donationIntentId, {
      campaignId: campaign.id, currency: d.currency, amount: amountStr,
      paymentMethod: 'pix_manual', customerEmail: d.customerEmail,
    })
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : 'Intenção inválida.')
  }

  // 3) Create PaymentOrder (manual_pix, pending)
  const internalReference = generateInternalReference()
  const order = await db.paymentOrder.create({
    data: {
      campaignId: campaign.id,
      donationIntentId,
      provider: 'manual_pix',
      method: 'pix_manual',
      internalReference,
      currency: d.currency,
      amount: amountStr,
      status: 'pending',
      customerEmail: d.customerEmail ?? null,
      customerName: d.customerName ?? null,
      // customerWhatsapp is NOT stored on PaymentOrder (only on DonationIntent
      // for thank-you consent). Telegram alert NEVER includes it.
      metadata: JSON.stringify({
        provider: 'manual_pix',
        method: 'pix_manual',
        customerWhatsapp: d.customerWhatsapp ? 'provided' : null, // boolean only, not the value
      }),
    },
  })

  await audit({
    actor: 'public',
    action: 'manual_pix_intent_created',
    entity: 'PaymentOrder',
    entityId: order.id,
    detail: `campaign=${campaign.id} amount=${amountStr} ${d.currency}`,
    ip,
  })

  // 4) Send Telegram alert (private, no personal data)
  const baseUrl = getCanonicalAppBaseUrl()
  const adminLink = `${baseUrl}/#admin` // the admin panel opens via the footer button
  const telegramResult = await sendTelegramAlert({
    orderId: order.id,
    campaignName: campaign.name,
    amount: amountStr,
    currency: d.currency,
    reference: internalReference,
    adminLink,
  })

  // Log the Telegram outcome — NEVER pretend it was sent if it wasn't
  if (isTelegramConfigured()) {
    if (telegramResult.sent) {
      await audit({
        actor: 'system',
        action: 'telegram_alert_sent',
        entity: 'PaymentOrder',
        entityId: order.id,
        detail: `ref=${internalReference}`,
        ip,
      })
    } else {
      await audit({
        actor: 'system',
        action: 'telegram_alert_failed',
        entity: 'PaymentOrder',
        entityId: order.id,
        detail: `ref=${internalReference} error=${telegramResult.error ?? 'unknown'}`,
        ip,
      })
    }
  } else {
    await audit({
      actor: 'system',
      action: 'telegram_not_configured',
      entity: 'PaymentOrder',
      entityId: order.id,
      detail: `ref=${internalReference} (no alert sent)`,
      ip,
    })
  }

  return json(
    {
      id: order.id,
      reference: internalReference,
      status: order.status,
      telegramAlerted: telegramResult.sent,
      message:
        'Recebemos a sua intenção de pagamento. A confirmação é administrativa — este formulário não comprova pagamento.',
    },
    { status: 201 },
  )
}
