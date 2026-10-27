import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, unauthorized } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'

/**
 * Lists all payment orders (admin only). Supports optional filtering by
 * campaignId, provider, method, status via query params.
 */
export async function GET(req: NextRequest) {
  const email = await requireAdmin(req)
  if (!email) return unauthorized()

  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get('campaignId') ?? undefined
  const provider = searchParams.get('provider') ?? undefined
  const method = searchParams.get('method') ?? undefined
  const status = searchParams.get('status') ?? undefined
  const reference = searchParams.get('reference')?.trim() || undefined

  const where: Record<string, string | undefined> = {}
  if (campaignId) where.campaignId = campaignId
  if (provider) where.provider = provider
  if (method) where.method = method
  if (status) where.status = status
  if (reference) where.internalReference = reference

  const orders = await db.paymentOrder.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      campaignId: true,
      provider: true,
      method: true,
      internalReference: true,
      currency: true,
      amount: true,
      status: true,
      externalId: true,
      customerEmail: true,
      customerName: true,
      deliveryStatus: true,
      createdAt: true,
      confirmedAt: true,
      refundedAt: true,
    },
  })

  return json({ orders })
}
