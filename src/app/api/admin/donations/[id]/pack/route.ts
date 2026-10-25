import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { json, unauthorized, notFound, badRequest } from '@/lib/api'
import { ensurePackDeliveryLink } from '@/lib/notifications/delivery'
import { getCanonicalAppBaseUrl } from '@/lib/payments/urls'

type Context = { params: Promise<{ id: string }> }
/** Recover a private delivery link from the donation record visible to admins. */
export async function GET(req: NextRequest, { params }: Context) {
  if (!await requireAdmin(req)) return unauthorized()
  const { id } = await params
  const intent = await db.donationIntent.findUnique({
    where: { id },
    select: { id: true, campaignId: true, confirmed: true, wantPackMedia: true },
  })
  if (!intent) return notFound('Donativo não encontrado.')
  if (!intent.confirmed || !intent.wantPackMedia) {
    return badRequest('O Pack Media exige confirmação e seleção explícita pelo doador.')
  }
  const order = await db.paymentOrder.findFirst({
    where: { donationIntentId: intent.id, campaignId: intent.campaignId, status: 'paid' },
    orderBy: { confirmedAt: 'desc' },
    select: { id: true },
  })
  if (!order) return badRequest('A ordem de pagamento confirmada não foi encontrada.')
  const { token, expiresAt } = await ensurePackDeliveryLink(order.id, intent.campaignId)
  return json(
    { url: getCanonicalAppBaseUrl() + '/pack/' + token, expiresAt },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
