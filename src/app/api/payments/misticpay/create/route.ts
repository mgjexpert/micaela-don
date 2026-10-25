import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { json, badRequest } from '@/lib/api'
import { clientIp } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { createMisticPayPayment } from '@/lib/providers/misticpay'
import { generateInternalReference, validateAmount } from '@/lib/payments/types'

const schema = z.object({
  campaignId: z.string().trim().max(60).default('micaela'),
  amount: z.number().positive(),
  currency: z.enum(['BRL']).default('BRL'),
  customerEmail: z.string().trim().email().max(160),
  customerName: z.string().trim().max(120),
  customerCpf: z.string().trim().min(11).max(14),
  description: z.string().trim().max(200).optional(),
})

/**
 * Creates a PIX payment via MisticPay.
 * Flow:
 * 1. Validate campaign + amount + CPF/CNPJ.
 * 2. Create internal PaymentOrder (pending).
 * 3. Call MisticPay API to create the charge.
 * 4. Save transactionId as externalId.
 * 5. Return QR code + Copia e Cola.
 *
 * The CPF/CNPJ is sent to MisticPay but NEVER persisted in our database.
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

  // CPF/CNPJ validation: 11 or 14 digits
  const cpfClean = d.customerCpf.replace(/\D/g, '')
  if (cpfClean.length !== 11 && cpfClean.length !== 14) {
    return badRequest('CPF deve ter 11 dígitos ou CNPJ 14 dígitos.')
  }

  // Validate campaign
  const campaign = await db.campaign.findUnique({ where: { id: d.campaignId } })
  if (!campaign || campaign.status !== 'published') {
    return badRequest('Campanha não disponível.')
  }

  // Validate amount (BRL 1–50000)
  let amountStr: string
  try {
    amountStr = validateAmount(d.amount, 1, 50000)
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : 'Valor inválido.')
  }

  // Create internal PaymentOrder
  const internalReference = generateInternalReference()
  const order = await db.paymentOrder.create({
    data: {
      campaignId: campaign.id,
      provider: 'misticpay',
      method: 'pix_automatic',
      internalReference,
      currency: d.currency,
      amount: amountStr,
      status: 'pending',
      customerEmail: d.customerEmail,
      customerName: d.customerName,
      metadata: JSON.stringify({ provider: 'misticpay', method: 'pix_automatic' }),
    },
  })

  await audit({
    actor: 'public',
    action: 'payment_order_created',
    entity: 'PaymentOrder',
    entityId: order.id,
    detail: `provider=misticpay method=pix_automatic amount=${amountStr} BRL`,
    ip,
  })

  // Call MisticPay API
  try {
    // Never derive a payment webhook destination from a visitor-controlled Origin header.
    const baseUrl = (process.env.APP_BASE_URL ?? 'https://ajudar.charity').replace(/\/$/, '')
    const webhookUrl = `${baseUrl}/api/webhooks/misticpay`

    const misticpayResponse = await createMisticPayPayment({
      amount: d.amount,
      payerName: d.customerName,
      payerDocument: cpfClean, // sent to MisticPay, NOT persisted
      description: d.description ?? `Apoio — ${campaign.name}`,
      transactionId: internalReference,
      webhookUrl,
    })

    // Save transactionId as externalId
    await db.paymentOrder.update({
      where: { id: order.id },
      data: {
        externalId: misticpayResponse.transactionId ?? internalReference,
        status: 'processing',
      },
    })

    return json({
      reference: internalReference,
      paymentId: misticpayResponse.transactionId ?? null,
      qrCodeImage: misticpayResponse.pixQrCode ?? null,
      qrCode: misticpayResponse.pixCopyPaste ?? null,
      status: misticpayResponse.status ?? 'pending',
    })
  } catch (e) {
    await db.paymentOrder.update({
      where: { id: order.id },
      data: { status: 'failed' },
    })
    const msg = e instanceof Error ? e.message : 'Erro desconhecido'
    // Don't expose internal error details, but give useful feedback
    if (msg.includes('INVALID_API_CREDENTIAL') || msg.includes('API_CREDENTIAL_REQUIRED')) {
      return badRequest('Credenciais MisticPay inválidas. Contacte o administrador.')
    }
    return badRequest('Não foi possível criar o pagamento PIX. Tente novamente.')
  }
}
