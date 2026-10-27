import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { badRequest, json, notFound, unauthorized } from '@/lib/api'
import { verifyMisticPayOrder } from '@/lib/payments/misticpay-verify'

type Context = { params: Promise<{ id: string }> }

/**
 * Explicit recovery of an existing MisticPay payment, initiated by an admin.
 * Never trusts the browser's status. The provider is consulted with server-side
 * credentials, and identity, amount, currency and payment method are reconciled.
 * This does NOT create a new payment or trigger a charge.
 */
export async function POST(req: NextRequest, { params }: Context) {
  const actor = await requireAdmin(req)
  if (!actor) return unauthorized()

  const { id } = await params
  const order = await db.paymentOrder.findUnique({
    where: { id },
    select: { id: true, provider: true, status: true },
  })
  if (!order) return notFound('Pagamento não encontrado.')
  if (order.provider !== 'misticpay') return badRequest('A recuperação automática é exclusiva da MisticPay.')
  if (order.status === 'refunded') return badRequest('Pagamento devolvido: requer revisão manual.')

  try {
    const providerState = await verifyMisticPayOrder(order.id)
    const latest = await db.paymentOrder.findUnique({
      where: { id: order.id },
      select: { internalReference: true, status: true, deliveryStatus: true },
    })
    await audit({
      actor,
      action: 'misticpay_admin_reconciliation',
      entity: 'PaymentOrder',
      entityId: order.id,
      detail: `providerState=${providerState} status=${latest?.status ?? 'missing'}`,
    })
    return json({
      providerState,
      reference: latest?.internalReference,
      status: latest?.status,
      deliveryStatus: latest?.deliveryStatus,
    })
  } catch (error) {
    await audit({
      actor,
      action: 'misticpay_admin_reconciliation_failed',
      entity: 'PaymentOrder',
      entityId: order.id,
      detail: error instanceof Error ? error.message.slice(0, 150) : 'provider_unavailable',
    })
    // Do not expose provider credentials, private identifiers or raw gateway responses.
    return json({ error: 'Não foi possível validar a transação na MisticPay.' }, { status: 503 })
  }
}
