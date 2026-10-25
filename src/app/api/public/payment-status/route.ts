import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
/** Only the payment state is public; no personal details, names or amounts. */
export async function GET(req: NextRequest) {
  const ref = new URL(req.url).searchParams.get('ref') ?? ''
  if (ref.length < 12 || ref.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(ref)) {
    return NextResponse.json({ error: 'Referência inválida.' }, { status: 400 })
  }
  if (ref.startsWith('PAY-')) {
    const order = await db.paymentOrder.findUnique({
      where: { internalReference: ref }, select: { status: true },
    })
    if (!order) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })
    const status = order.status === 'paid' ? 'paid' : order.status === 'refunded' ? 'refunded'
      : ['failed','expired','cancelled'].includes(order.status) ? 'failed' : 'pending'
    return NextResponse.json({ status }, { headers: { 'Cache-Control': 'no-store' } })
  }
  const intent = await db.donationIntent.findUnique({
    where: { id: ref }, select: { confirmed: true, status: true },
  })
  if (!intent) return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 })
  const status = intent.confirmed ? 'paid' : intent.status === 'refunded' ? 'refunded'
    : ['failed','expired','cancelled','rejected'].includes(intent.status) ? 'failed' : 'pending'
  return NextResponse.json({ status }, { headers: { 'Cache-Control': 'no-store' } })
}
