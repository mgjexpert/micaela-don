import { db } from '@/lib/db'
import { getMisticPayPaymentStatus, reconcileMisticPay, type MisticPayState } from '@/lib/providers/misticpay'
import { fulfillPayment } from '@/lib/notifications/fulfillment'
import { synchronizeDonationIntent } from '@/lib/payments/intent'

/**
 * Server-side recovery when the provider webhook does not reach the application.
 * Never grant payment/delivery access from a browser-provided flag or webhook body.
 */
export async function verifyMisticPayOrder(orderId: string): Promise<MisticPayState> {
  const order = await db.paymentOrder.findUnique({ where: { id: orderId } })
  if (!order || order.provider !== 'misticpay') throw new Error('MisticPay order not found')
  // Refunds are terminal for public reconciliation. Staff should investigate reversals.
  if (order.status === 'refunded') return 'DEVOLVIDO'

  const ids = [...new Set([order.externalId, order.internalReference].filter((v): v is string => !!v))]
  let lastReason = 'provider_unavailable'
  let state: MisticPayState | null = null
  for (const candidate of ids) {
    try {
      const status = await getMisticPayPaymentStatus(candidate)
      const verdict = reconcileMisticPay(status, {
        internalReference: order.internalReference,
        externalId: order.externalId,
        amount: Number(order.amount),
        currency: order.currency,
      })
      if (verdict.ok) {
        state = verdict.state
        break
      }
      lastReason = verdict.reason
    } catch {
      lastReason = 'provider_unavailable'
    }
  }
  if (!state) throw new Error('MisticPay reconciliation failed: ' + lastReason)

  if (state === 'COMPLETO') {
    // A late settlement must never restore a refunded or disputed order to paid.
    await db.paymentOrder.updateMany({
      where: {
        id: order.id,
        status: { in: ['pending', 'processing', 'failed', 'expired'] },
      },
      data: { status: 'paid', confirmedAt: new Date() },
    })
    const latest = await db.paymentOrder.findUnique({ where: { id: order.id }, select: { status: true } })
    if (latest?.status === 'paid') {
      await synchronizeDonationIntent(order.id, 'paid')
      // Email errors must not undo the paid status; a failed send is retryable.
      try { await fulfillPayment(order.id) }
      catch (error) {
        console.error('[misticpay] payment confirmed but fulfillment failed',
          error instanceof Error ? error.message : 'unknown')
      }
    }
  } else if (state === 'DEVOLVIDO') {
    await db.paymentOrder.update({
      where: { id: order.id },
      data: { status: 'refunded', refundedAt: new Date() },
    })
    await synchronizeDonationIntent(order.id, 'refunded')
  } else if (state === 'DEVOLVIDO_PARCIAL') {
    await db.paymentOrder.updateMany({
      where: { id: order.id, status: { not: 'refunded' } },
      data: { status: 'requires_manual_review' },
    })
  } else if (state === 'FALHA' || state === 'CANCELADO') {
    await db.paymentOrder.updateMany({
      where: { id: order.id, status: { in: ['pending', 'processing'] } },
      data: { status: 'failed' },
    })
    await synchronizeDonationIntent(order.id, 'failed')
  }
  return state
}
