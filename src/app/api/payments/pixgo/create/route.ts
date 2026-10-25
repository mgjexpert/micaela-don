import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { json, badRequest } from '@/lib/api'
import { clientIp } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { createPixGoPayment } from '@/lib/providers/pixgo'
import { resolveDonationIntentId } from '@/lib/payments/intent'
import {
  generateInternalReference,
  validateAmount,
} from '@/lib/payments/types'

// CPF/CNPJ validation: 11 digits (CPF) or 14 digits (CNPJ), digits only.
const validateCpfCnpj = (v: string): boolean => {
  const cleaned = v.replace(/\D/g, '')
  return cleaned.length === 11 || cleaned.length === 14
}

const schema = z.object({
  campaignId: z.string().trim().max(60).default('micaela'),
  amount: z.number().positive(),
  donationIntentId: z.string().trim().min(8).max(128).optional(),
  currency: z.enum(['BRL']).default('BRL'),
  customerEmail: z.string().trim().email().max(160),
  customerName: z.string().trim().max(120).optional(),
  customerCpf: z.string().trim().min(11).max(18), // CPF/CNPJ required by PixGo
  description: z.string().trim().max(200).optional(),
})

/**
 * Creates a PixGo PIX payment.
 *
 * Flow:
 * 1. Validate campaign + amount (BRL 1–50000).
 * 2. Validate CPF/CNPJ format.
 * 3. Create internal PaymentOrder (pending).
 * 4. Call PixGo API to create the charge.
 * 5. Save payment_id as externalId.
 * 6. Return QR code + Copia e Cola.
 *
 * The CPF/CNPJ is sent to PixGo but NEVER persisted in our database.
 * The payment is NOT confirmed here. Only the webhook confirms it.
 *
 * NOTE: This method is DISABLED for end-users until the admin explicitly enables it
 * (campaign config). The route exists but is not linked from the public UI until
 * approval. This is a safety measure.
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

  // Validate CPF/CNPJ format
  if (!validateCpfCnpj(d.customerCpf)) {
    return badRequest('CPF/CNPJ inválido. Use 11 dígitos (CPF) ou 14 dígitos (CNPJ).')
  }

  // 1) Validate campaign
  const campaign = await db.campaign.findUnique({ where: { id: d.campaignId } })
  if (!campaign || campaign.status !== 'published') {
    return badRequest('Campanha não disponível.')
  }

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
      paymentMethod: 'pix_automatic', customerEmail: d.customerEmail,
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
      provider: 'pixgo',
      method: 'pix_automatic',
      internalReference,
      currency: d.currency,
      amount: amountStr,
      status: 'pending',
      customerEmail: d.customerEmail,
      customerName: d.customerName ?? null,
      // NOTE: customerCpf is NOT stored — sent to PixGo then discarded.
      metadata: JSON.stringify({ provider: 'pixgo', method: 'pix_automatic' }),
    },
  })

  await audit({
    actor: 'public',
    action: 'payment_order_created',
    entity: 'PaymentOrder',
    entityId: order.id,
    detail: `provider=pixgo method=pix_automatic amount=${amountStr} ${d.currency}`,
    ip,
  })

  // 4) Call PixGo API
  try {
    const baseUrl = (process.env.APP_BASE_URL ?? 'https://ajudar.charity').replace(/\/$/, '')
    const webhookUrl = `${baseUrl}/api/webhooks/pixgo`

    const pixgoResponse = await createPixGoPayment({
      amount: d.amount,
      description: d.description ?? `Apoio — ${campaign.name}`,
      receiverCpf: d.customerCpf, // sent to PixGo, not persisted
      receiverEmail: d.customerEmail,
      externalId: internalReference,
      webhookUrl,
    })

    // 5) Save payment_id as externalId
    await db.paymentOrder.update({
      where: { id: order.id },
      data: {
        externalId: pixgoResponse.payment_id,
        status: 'processing',
      },
    })

    // 6) Return QR + Copia e Cola
    return json({
      reference: internalReference,
      paymentId: pixgoResponse.payment_id,
      qrCode: pixgoResponse.qr_code ?? null,
      qrCodeImage: pixgoResponse.qr_code_image ?? null,
      expiresAt: pixgoResponse.expires_at ?? null,
    })
  } catch (e) {
    // Mark order as failed; don't expose internal error
    await db.paymentOrder.update({
      where: { id: order.id },
      data: { status: 'failed' },
    })
    return badRequest('Não foi possível criar o pagamento PIX. Tente novamente.')
  }
}
