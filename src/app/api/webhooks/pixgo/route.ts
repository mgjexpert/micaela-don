import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPixGoSignature, isTimestampWithinTolerance, hashPayload } from '@/lib/payments/webhook'
import { audit } from '@/lib/audit'
import { fulfillPayment } from '@/lib/notifications/fulfillment'
import { synchronizeDonationIntent } from '@/lib/payments/intent'

/**
 * PixGo webhook — validates HMAC-SHA256 signature, processes events idempotently.
 *
 * Headers validated:
 * - X-Webhook-Timestamp: Unix timestamp (seconds)
 * - X-Webhook-Signature: HMAC-SHA256 of '{timestamp}.{rawBody}' using PIXGO_WEBHOOK_SECRET
 * - X-Webhook-Event: event type
 *
 * Anti-replay: timestamps older than 5 minutes are rejected.
 * Idempotency: PaymentEvent.externalEventId is unique → duplicate events rejected.
 *
 * Events handled:
 * - payment.completed → mark order as 'paid'
 * - payment.expired → mark order as 'expired'
 * - payment.refunded → mark order as 'refunded'
 *
 * IMPORTANT: confirm the signature calculation with current PixGo docs before
 * going live. The method is DISABLED for end-users until approval.
 */
export async function POST(req: NextRequest) {
  // 1) Get raw body
  const rawBody = await req.text()
  const timestamp = req.headers.get('x-webhook-timestamp') ?? ''
  const signature = req.headers.get('x-webhook-signature') ?? ''
  const eventType = req.headers.get('x-webhook-event') ?? req.headers.get('X-Webhook-Event') ?? ''

  if (!timestamp || !signature) {
    return NextResponse.json({ error: 'Cabeçalhos de assinatura em falta.' }, { status: 400 })
  }

  // 2) Anti-replay: check timestamp tolerance (5 minutes)
  if (!isTimestampWithinTolerance(timestamp, 300)) {
    return NextResponse.json({ error: 'Timestamp fora da tolerância.' }, { status: 400 })
  }

  // 3) Verify HMAC-SHA256 signature
  const secret = process.env.PIXGO_WEBHOOK_SECRET
  if (!secret) {
    console.error('[pixgo webhook] PIXGO_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Configuração em falta.' }, { status: 500 })
  }

  if (!verifyPixGoSignature(rawBody, timestamp, signature, secret)) {
    return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 400 })
  }

  // 4) Parse the payload
  let payload: { payment_id?: string; external_id?: string; status?: string; amount?: number; event_id?: string }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
  }

  // 5) Idempotency: use event_id if provided, else derive from payment_id + eventType + timestamp
  const externalEventId = payload.event_id ?? `pixgo_${payload.payment_id ?? 'unknown'}_${eventType}_${timestamp}`
  const payloadHash = hashPayload(rawBody)

  const existing = await db.paymentEvent.findUnique({
    where: { externalEventId },
  })
  if (existing && existing.status === 'processed') {
    return NextResponse.json({ received: true, duplicate: true })
  }

  // Record the event
  let paymentEvent
  if (existing) {
    paymentEvent = existing
  } else {
    try {
      paymentEvent = await db.paymentEvent.create({
        data: {
          provider: 'pixgo',
          eventType,
          externalEventId,
          payloadHash,
          status: 'pending',
        },
      })
    } catch {
      return NextResponse.json({ received: true, duplicate: true })
    }
  }

  // 6) Find the order by external_id (our internalReference) or payment_id
  const order = await findOrder(payload)
  if (!order) {
    await audit({
      actor: 'pixgo_webhook',
      action: 'pixgo_event_no_order',
      entity: 'PaymentEvent',
      entityId: paymentEvent.id,
      detail: `type=${eventType} payment_id=${payload.payment_id ?? 'none'}`,
    })
    await db.paymentEvent.update({
      where: { id: paymentEvent.id },
      data: { status: 'processed', processedAt: new Date() },
    })
    return NextResponse.json({ received: true, no_order: true })
  }

  // 7) Process the event
  try {
    await processPixGoEvent(eventType, payload, order.id, paymentEvent.id)
    await db.paymentEvent.update({
      where: { id: paymentEvent.id },
      data: { status: 'processed', processedAt: new Date(), orderId: order.id },
    })
    return NextResponse.json({ received: true, processed: true })
  } catch (e) {
    await db.paymentEvent.update({
      where: { id: paymentEvent.id },
      data: { status: 'failed', orderId: order.id },
    })
    const msg = e instanceof Error ? e.message : 'Erro ao processar evento.'
    console.error('[pixgo webhook] process error:', msg)
    return NextResponse.json({ error: 'Erro ao processar.' }, { status: 500 })
  }
}

async function findOrder(payload: { payment_id?: string; external_id?: string }) {
  // Prefer external_id (our internalReference)
  if (payload.external_id) {
    const byRef = await db.paymentOrder.findUnique({
      where: { internalReference: payload.external_id },
    })
    if (byRef?.provider === 'pixgo') return byRef
  }
  // Fallback: payment_id (PixGo's id stored as externalId)
  if (payload.payment_id) {
    const byExt = await db.paymentOrder.findFirst({
      where: { provider: 'pixgo', externalId: payload.payment_id },
    })
    if (byExt) return byExt
  }
  return null
}

async function processPixGoEvent(
  eventType: string,
  payload: { payment_id?: string; status?: string; amount?: number },
  orderId: string,
  eventId: string,
): Promise<void> {
  switch (eventType) {
    case 'payment.completed': {
      // Verify: status matches, amount matches (defence-in-depth)
      const order = await db.paymentOrder.findUnique({ where: { id: orderId } })
      if (!order) return
      const validAmount = typeof payload.amount === 'number' && Number.isFinite(payload.amount)
        && Math.round(payload.amount * 100) === Math.round(Number(order.amount) * 100)
      if (!validAmount || payload.status?.toLowerCase() !== 'completed' || order.currency !== 'BRL') {
        throw new Error('PixGo payment amount or status mismatched')
      }
      if (order.status === 'refunded') return
      // Only transition to paid if not already paid (idempotency)
      if (order.status !== 'paid') {
        await db.paymentOrder.update({
          where: { id: orderId },
          data: { status: 'paid', confirmedAt: new Date() },
        })
        await audit({
          actor: 'pixgo_webhook',
          action: 'payment_confirmed',
          entity: 'PaymentOrder',
          entityId: orderId,
          detail: `provider=pixgo method=pix_automatic amount=${order.amount}`,
        })
        await synchronizeDonationIntent(orderId, 'paid')
        // Trigger email + delivery (idempotent)
        await fulfillPayment(orderId)
      }
      break
    }
    case 'payment.expired': {
      const order = await db.paymentOrder.findUnique({ where: { id: orderId } })
      if (order?.status === 'paid' || order?.status === 'refunded') return
      await db.paymentOrder.update({
        where: { id: orderId },
        data: { status: 'expired' },
      })
      await synchronizeDonationIntent(orderId, 'expired')
      break
    }
    case 'payment.refunded': {
      await db.paymentOrder.update({
        where: { id: orderId },
        data: { status: 'refunded', refundedAt: new Date() },
      })
      await synchronizeDonationIntent(orderId, 'refunded')
      break
    }
    default:
      await audit({
        actor: 'pixgo_webhook',
        action: 'pixgo_event_unhandled',
        entity: 'PaymentEvent',
        entityId: eventId,
        detail: `type=${eventType}`,
      })
  }
}
