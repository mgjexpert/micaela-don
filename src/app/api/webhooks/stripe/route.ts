import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyStripeWebhook } from '@/lib/providers/stripe'
import { hashPayload } from '@/lib/payments/webhook'
import { audit } from '@/lib/audit'
import { fulfillPayment } from '@/lib/notifications/fulfillment'

/**
 * Stripe webhook — validates signature over raw body, processes events idempotently.
 *
 * Config in Stripe Dashboard:
 * - Endpoint URL: https://ajudar.charity/api/webhooks/stripe
 * - Events: checkout.session.completed, payment_intent.succeeded,
 *           payment_intent.payment_failed, charge.refunded
 * - Copy signing secret → STRIPE_WEBHOOK_SECRET
 *
 * Idempotency: PaymentEvent.externalEventId is unique → duplicate events rejected.
 *
 * The page of success does NOT confirm payment. Only this webhook does.
 */
export async function POST(req: NextRequest) {
  // 1) Get raw body (required for signature verification)
  const rawBody = await req.text()
  const signature = req.headers.get('stripe-signature') ?? ''
  if (!signature) {
    return NextResponse.json({ error: 'Assinatura em falta.' }, { status: 400 })
  }

  // 2) Verify signature
  let event
  try {
    event = verifyStripeWebhook(rawBody, signature)
  } catch {
    return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 400 })
  }

  // 3) Idempotency: check if event already processed
  const externalEventId = event.id
  const payloadHash = hashPayload(rawBody)
  const existing = await db.paymentEvent.findUnique({
    where: { externalEventId },
  })
  if (existing && existing.status === 'processed') {
    // Already processed — acknowledge but don't re-process
    return NextResponse.json({ received: true, duplicate: true })
  }

  // Record the event (or update if pending)
  let paymentEvent
  if (existing) {
    paymentEvent = existing
  } else {
    try {
      paymentEvent = await db.paymentEvent.create({
        data: {
          provider: 'stripe',
          eventType: event.type,
          externalEventId,
          payloadHash,
          status: 'pending',
        },
      })
    } catch {
      // Race condition: another worker created it first. Acknowledge.
      return NextResponse.json({ received: true, duplicate: true })
    }
  }

  // 4) Process the event
  try {
    await processStripeEvent(event, paymentEvent.id)
    await db.paymentEvent.update({
      where: { id: paymentEvent.id },
      data: { status: 'processed', processedAt: new Date() },
    })
    return NextResponse.json({ received: true, processed: true })
  } catch (e) {
    await db.paymentEvent.update({
      where: { id: paymentEvent.id },
      data: { status: 'failed' },
    })
    const msg = e instanceof Error ? e.message : 'Erro ao processar evento.'
    console.error('[stripe webhook] process error:', msg)
    // Return 500 so Stripe retries
    return NextResponse.json({ error: 'Erro ao processar.' }, { status: 500 })
  }
}

/**
 * Processes a Stripe event and updates the corresponding PaymentOrder.
 * Only transitions to 'paid' after validated confirmation.
 */
async function processStripeEvent(event: { type: string; data: { object: Record<string, unknown> } }, eventId: string): Promise<void> {
  const obj = event.data.object as Record<string, unknown>
  const clientReferenceId = obj.client_reference_id as string | undefined
  const sessionId = obj.id as string | undefined

  // Find the order by internal reference (preferred) or external id
  type OrderType = Awaited<ReturnType<typeof db.paymentOrder.findUnique>>
  let order: OrderType = null
  if (clientReferenceId) {
    order = await db.paymentOrder.findUnique({
      where: { internalReference: clientReferenceId },
    })
  }
  if (!order && sessionId) {
    order = await db.paymentOrder.findFirst({
      where: { provider: 'stripe', externalId: sessionId },
    })
  }
  if (!order) {
    // Order not found — log but don't fail (might be from a different system)
    await audit({
      actor: 'stripe_webhook',
      action: 'stripe_event_no_order',
      entity: 'PaymentEvent',
      entityId: eventId,
      detail: `type=${event.type} ref=${clientReferenceId ?? 'none'}`,
    })
    return
  }

  switch (event.type) {
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.completed': {
      // Checkout completed ≠ paid. Check payment_status.
      const paymentStatus = obj.payment_status as string
      if (paymentStatus === 'paid') {
        await db.paymentOrder.update({
          where: { id: order.id },
          data: {
            status: 'paid',
            confirmedAt: new Date(),
            externalId: sessionId ?? order.externalId,
          },
        })
        await audit({
          actor: 'stripe_webhook',
          action: 'payment_confirmed',
          entity: 'PaymentOrder',
          entityId: order.id,
          detail: `provider=stripe method=mbway amount=${order.amount}`,
        })
        // Trigger email + delivery (idempotent)
        await fulfillPayment(order.id)
      } else {
        // Still pending payment (e.g. MB WAY pending confirmation)
        await db.paymentOrder.update({
          where: { id: order.id },
          data: { status: 'processing' },
        })
      }
      break
    }
    case 'payment_intent.succeeded': {
      // Confirm paid (if not already)
      const current = await db.paymentOrder.findUnique({ where: { id: order.id } })
      if (current && current.status !== 'paid') {
        await db.paymentOrder.update({
          where: { id: order.id },
          data: { status: 'paid', confirmedAt: new Date() },
        })
        await audit({
          actor: 'stripe_webhook',
          action: 'payment_confirmed',
          entity: 'PaymentOrder',
          entityId: order.id,
          detail: `event=payment_intent.succeeded`,
        })
        // Trigger email + delivery (idempotent)
        await fulfillPayment(order.id)
      }
      break
    }
    case 'checkout.session.async_payment_failed':
    case 'payment_intent.payment_failed': {
      await db.paymentOrder.update({
        where: { id: order.id },
        data: { status: 'failed' },
      })
      break
    }
    case 'charge.refunded': {
      await db.paymentOrder.update({
        where: { id: order.id },
        data: { status: 'refunded', refundedAt: new Date() },
      })
      break
    }
    default:
      // Unhandled event type — log but don't fail
      await audit({
        actor: 'stripe_webhook',
        action: 'stripe_event_unhandled',
        entity: 'PaymentEvent',
        entityId: eventId,
        detail: `type=${event.type}`,
      })
  }
}
