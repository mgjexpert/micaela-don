import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { hashPayload } from '@/lib/payments/webhook'
import { getMisticPayPaymentStatus, reconcileMisticPay } from '@/lib/providers/misticpay'
import { fulfillPayment } from '@/lib/notifications/fulfillment'
import { synchronizeDonationIntent } from '@/lib/payments/intent'

/**
 * MisticPay webhook = untrusted notification. Never trust a posted "COMPLETO".
 * Authenticate the actual transaction using the server's MisticPay API keys,
 * then reconcile ID, method, value, currency and state before any payment action.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  if (rawBody.length > 8192) {
    return NextResponse.json({ error: 'Payload demasiado grande.' }, { status: 413 })
  }
  let payload: unknown
  try { payload = JSON.parse(rawBody) }
  catch { return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }) }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
  }

  const rawId = (payload as Record<string, unknown>).transactionId
  const webhookId = typeof rawId === 'string' || (typeof rawId === 'number' && Number.isFinite(rawId))
    ? String(rawId).trim() : ''
  if (!webhookId || webhookId.length > 128) {
    return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 })
  }

  // An order reference is NOT proof of payment. This is only a lookup hint.
  const order = await db.paymentOrder.findFirst({
    where: { provider: 'misticpay', OR: [{ externalId: webhookId }, { internalReference: webhookId }] },
  })
  if (!order) return NextResponse.json({ received: true, matched: false })

  let verified
  try {
    // Prefer our identifier sent to MisticPay on charge creation.
    try { verified = await getMisticPayPaymentStatus(order.internalReference) }
    catch (firstError) {
      if (!order.externalId || order.externalId === order.internalReference) throw firstError
      verified = await getMisticPayPaymentStatus(order.externalId)
    }
  } catch {
    // Fail closed and let the provider retry.
    return NextResponse.json({ error: 'Estado do fornecedor indisponível.' }, { status: 503 })
  }

  const reconciliation = reconcileMisticPay(verified, {
    internalReference: order.internalReference,
    externalId: order.externalId,
    currency: order.currency,
    amount: Number(order.amount),
  })
  if (!reconciliation.ok) {
    console.warn('[misticpay] rejected provider reconciliation:', reconciliation.reason)
    return NextResponse.json({ error: 'Confirmação não validada.' }, { status: 409 })
  }
  const state = reconciliation.state
  const externalEventId = `misticpay_${order.id}_${state}`
  const existing = await db.paymentEvent.findUnique({ where: { externalEventId } })
  if (existing?.status === 'processed') return NextResponse.json({ received: true, duplicate: true })

  let event = existing
  if (!event) {
    try {
      event = await db.paymentEvent.create({
        data: {
          provider: 'misticpay',
          eventType: state,
          externalEventId,
          payloadHash: hashPayload(rawBody),
          status: 'pending',
          orderId: order.id,
        },
      })
    } catch {
      // A concurrent worker is already processing this exact event.
      return NextResponse.json({ received: true, duplicate: true })
    }
  }

  try {
    if (state === 'COMPLETO') {
      // A refunded order must never be restored to paid from a late event.
      if (order.status !== 'paid' && order.status !== 'refunded') {
        await db.paymentOrder.update({
          where: { id: order.id },
          data: { status: 'paid', confirmedAt: new Date() },
        })
        await audit({
          actor: 'misticpay_verified',
          action: 'payment_confirmed',
          entity: 'PaymentOrder',
          entityId: order.id,
          detail: 'Confirmed using authenticated transaction status',
        })
      }
      if (order.status !== 'refunded') {
        await synchronizeDonationIntent(order.id, 'paid')
        await fulfillPayment(order.id)
      }
    } else if (state === 'DEVOLVIDO') {
      await db.paymentOrder.update({
        where: { id: order.id },
        data: { status: 'refunded', refundedAt: new Date() },
      })
      await synchronizeDonationIntent(order.id, 'refunded')
    } else if (state === 'DEVOLVIDO_PARCIAL') {
      await db.paymentOrder.update({
        where: { id: order.id },
        data: { status: 'requires_manual_review' },
      })
    } else if (state === 'FALHA' || state === 'CANCELADO') {
      if (order.status !== 'paid' && order.status !== 'refunded') {
        await db.paymentOrder.update({ where: { id: order.id }, data: { status: 'failed' } })
        await synchronizeDonationIntent(order.id, 'failed')
      }
    }
    // PENDENTE: retain current state. The webhook is only a notification.
    await db.paymentEvent.update({
      where: { id: event.id },
      data: { status: 'processed', processedAt: new Date(), orderId: order.id },
    })
    return NextResponse.json({ received: true, status: state })
  } catch (error) {
    await db.paymentEvent.update({ where: { id: event.id }, data: { status: 'failed', orderId: order.id } })
    console.error('[misticpay] verified event processing failed:', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
