import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { json, badRequest, unauthorized, notFound } from '@/lib/api'
import { requireAdmin, clientIp } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { fulfillPayment } from '@/lib/notifications/fulfillment'
import { synchronizeDonationIntent } from '@/lib/payments/intent'

const schema = z.object({
  reason: z.string().trim().max(500).optional(),
})

type Params = { params: Promise<{ id: string }> }

/**
 * Manually confirms a manual_pix payment.
 *
 * Only the admin can confirm a manual payment. This is the ONLY way a
 * manual PIX payment transitions to 'paid' — the form submission and the
 * Telegram alert do NOT confirm payment.
 *
 * After confirmation, the fulfillment layer triggers (email + delivery).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const email = await requireAdmin(req)
  if (!email) return unauthorized()
  const { id } = await params

  const order = await db.paymentOrder.findUnique({ where: { id } })
  if (!order) return notFound('Pagamento não encontrado.')

  // Only manual_pix orders can be manually confirmed
  if (order.provider !== 'manual_pix') {
    return badRequest('Apenas pagamentos manuais podem ser confirmados manualmente.')
  }

  if (order.status !== 'pending' && order.status !== 'processing') {
    return badRequest('Apenas pagamentos pendentes podem ser confirmados.')
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return badRequest('Dados inválidos.')

  // Confirm the payment
  await db.paymentOrder.update({
    where: { id },
    data: {
      status: 'paid',
      confirmedAt: new Date(),
      confirmedById: email,
    },
  })

  await audit({
    actor: email,
    action: 'payment_manually_confirmed',
    entity: 'PaymentOrder',
    entityId: id,
    detail: `provider=manual_pix ref=${order.internalReference} amount=${order.amount} reason=${parsed.data.reason ?? 'none'}`,
    ip: clientIp(req),
  })

  await synchronizeDonationIntent(id, 'paid')
  // Trigger fulfillment (email + delivery) — idempotent
  const fulfillment = await fulfillPayment(id)

  return json({
    ok: true,
    orderId: id,
    status: 'paid',
    emailSent: fulfillment.emailSent,
    deliveryLink: fulfillment.deliveryLink,
  })
}
