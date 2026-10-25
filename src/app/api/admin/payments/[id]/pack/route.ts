import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { json, unauthorized, notFound, badRequest } from '@/lib/api'
import { ensurePackDeliveryLink } from '@/lib/notifications/delivery'
import { getCanonicalAppBaseUrl } from '@/lib/payments/urls'

type Context = { params: Promise<{ id: string }> }
/**
 * Support fallback: retrieve a private Pack Media URL if email delivery failed.
 * No public endpoint can mint delivery tokens. Only an authenticated admin.
 */
export async function GET(req: NextRequest, { params }: Context) {
  if (!await requireAdmin(req)) return unauthorized()
  const { id } = await params
  const order = await db.paymentOrder.findUnique({
    where: { id },
    select: { id: true, status: true, campaignId: true, donationIntentId: true },
  })
  if (!order) return notFound('Pagamento não encontrado.')
  if (order.status !== 'paid' || !order.donationIntentId) {
    return badRequest('O Pack Media exige um donativo confirmado.')
  }
  const intent = await db.donationIntent.findUnique({
    where: { id: order.donationIntentId },
    select: { wantPackMedia: true, campaignId: true },
  })
  if (!intent?.wantPackMedia || intent.campaignId !== order.campaignId) {
    return badRequest('O doador não selecionou o Pack Media.')
  }
  const { token, expiresAt } = await ensurePackDeliveryLink(order.id, order.campaignId)
  return json({ url: getCanonicalAppBaseUrl() + '/pack/' + token, expiresAt },
    { headers: { 'Cache-Control': 'private, no-store' } })
}
