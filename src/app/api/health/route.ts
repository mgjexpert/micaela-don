import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Read-only, secret-free release check. Returns 503 until runtime and campaign are ready. */
export async function GET() {
  try {
    const campaign = await db.campaign.findUnique({
      where: { id: 'micaela' }, select: { status: true },
    })
    const stripe = !!process.env.STRIPE_SECRET_KEY
      && !!process.env.STRIPE_WEBHOOK_SECRET
      && !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    const misticpay = !!process.env.MISTICPAY_CLIENT_ID
      && !!process.env.MISTICPAY_CLIENT_SECRET
    const manual = !!(await db.pixConfig.findFirst({
      where: { campaignId: 'micaela', approved: true, published: true },
      select: { id: true },
    })) || !!(await db.paymentConfig.findFirst({
      where: { campaignId: 'micaela', approved: true, published: true },
      select: { id: true },
    }))
    const auth = !!process.env.ADMIN_EMAIL
      && !!process.env.ADMIN_PASSWORD_HASH
      && !!process.env.SESSION_SECRET
      && process.env.SESSION_SECRET.length >= 32
    const base = process.env.APP_BASE_URL ?? ''
    const canonical = /^https:\/\/[^/]+(?:\/)?$/.test(base)
    const ready = campaign?.status === 'published' && auth && canonical && (stripe || misticpay || manual)
    return NextResponse.json({
      status: ready ? 'ready' : 'configuration_required',
      database: 'ok', campaign: campaign?.status ?? 'missing',
      paymentsEnabled: stripe || misticpay || manual,
      adminConfigured: auth, canonicalUrlConfigured: canonical,
    }, { status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ status: 'unavailable', database: 'error' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
