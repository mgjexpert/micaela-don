import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyMisticPayOrder } from '@/lib/payments/misticpay-verify'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function publicStatus(status: string): 'pending' | 'paid' | 'failed' | 'refunded' {
  if (status === 'paid') return 'paid'
  if (status === 'refunded') return 'refunded'
  if (['failed', 'expired', 'cancelled'].includes(status)) return 'failed'
  return 'pending'
}

/**
 * Public, read-only status; recovery polls MisticPay server-side with a DB-backed
 * per-order throttle (at most once per 30s). Never exposes PII or payment amounts.
 */
export async function GET(req: NextRequest) {
  const ref = new URL(req.url).searchParams.get('ref') ?? ''
  if (ref.length < 12 || ref.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(ref)) {
    return NextResponse.json({ error: 'Referência inválida.' }, { status: 400 })
  }
  let status = 'pending'
  let verificationDelayed = false

  if (ref.startsWith('PAY-')) {
    const order = await db.paymentOrder.findUnique({
      where: { internalReference: ref },
      select: { id: true, status: true, provider: true },
    })
    if (!order) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })
    status = order.status

    if (order.provider === 'misticpay' && ['pending', 'processing', 'failed'].includes(order.status)) {
      const windowId = Math.floor(Date.now() / 30000)
      const externalEventId = 'misticpay_poll_' + order.id + '_' + windowId
      // A single DB insert is an atomic cross-instance throttle for serverless deployments.
      const lock = await db.paymentEvent.create({
        data: {
          orderId: order.id,
          provider: 'misticpay',
          eventType: 'status_poll',
          externalEventId,
          status: 'pending',
        },
      }).catch(() => null)
      if (lock) {
        try {
          await verifyMisticPayOrder(order.id)
          await db.paymentEvent.update({
            where: { id: lock.id }, data: { status: 'processed', processedAt: new Date() },
          })
        } catch (error) {
          verificationDelayed = true
          await db.paymentEvent.update({
            where: { id: lock.id }, data: { status: 'failed' },
          }).catch(() => {})
          console.warn('[misticpay] recovery verification unavailable:',
            error instanceof Error ? error.message : 'unknown')
        }
      }
      const refreshed = await db.paymentOrder.findUnique({
        where: { id: order.id }, select: { status: true },
      })
      status = refreshed?.status ?? status
    }
  } else {
    const intent = await db.donationIntent.findUnique({
      where: { id: ref },
      select: { confirmed: true, status: true },
    })
    if (!intent) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })
    status = intent.confirmed ? 'paid' : intent.status
  }
  return NextResponse.json({
    status: publicStatus(status),
    verificationDelayed,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
