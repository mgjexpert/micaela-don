import { db } from '@/lib/db'

export type IntentExpectation = {
  campaignId: string
  currency: string
  amount: string
  paymentMethod: string
  customerEmail?: string | null
}

/** A public intent identifier is only a lookup hint. The server must verify ownership and price. */
export async function resolveDonationIntentId(
  donationIntentId: string | undefined,
  expected: IntentExpectation,
): Promise<string | null> {
  if (!donationIntentId) return null // legacy/back-office integrations
  const intent = await db.donationIntent.findUnique({ where: { id: donationIntentId } })
  if (!intent) throw new Error('Intenção de donativo não encontrada.')
  const cents = Math.round(Number(expected.amount) * 100)
  const originalCents = intent.amountMinor ?? Math.round(Number(intent.amount ?? 0) * 100)
  if (intent.campaignId !== expected.campaignId || intent.currency !== expected.currency ||
      intent.paymentMethod !== expected.paymentMethod || originalCents !== cents ||
      (expected.customerEmail && intent.donorEmail?.toLowerCase() !== expected.customerEmail.toLowerCase())) {
    throw new Error('A intenção não corresponde ao pagamento solicitado.')
  }
  if (!['pending', 'received', 'awaiting_manual_confirmation'].includes(intent.status)) {
    throw new Error('Esta intenção já foi finalizada.')
  }
  return intent.id
}

export async function synchronizeDonationIntent(orderId: string, status: 'paid' | 'refunded' | 'failed' | 'expired'): Promise<void> {
  const order = await db.paymentOrder.findUnique({ where: { id: orderId }, select: { donationIntentId: true } })
  if (!order?.donationIntentId) return
  if (status === 'paid') {
    await db.donationIntent.updateMany({
      where: { id: order.donationIntentId, status: { not: 'refunded' } },
      data: { status: 'paid', confirmed: true, confirmedAt: new Date() },
    })
  } else if (status === 'refunded') {
    await db.donationIntent.updateMany({
      where: { id: order.donationIntentId },
      data: { status: 'refunded', confirmed: false },
    })
  } else {
    await db.donationIntent.updateMany({
      where: { id: order.donationIntentId, confirmed: false, status: { not: 'refunded' } },
      data: { status },
    })
  }
}
