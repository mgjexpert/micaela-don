import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { misticPayCredentials } from '@/lib/providers/misticpay'
import { getCanonicalAppBaseUrl } from '@/lib/payments/urls'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Configuration-only preflight. Does not create any charge or read any donor records. */
export async function GET() {
  const misticpay = misticPayCredentials()
  let database = false
  let campaign = false
  try {
    // Selecting new-schema columns also checks whether the production DB was migrated.
    const [record] = await Promise.all([
      db.campaign.findUnique({ where: { id: 'micaela' }, select: { status: true } }),
      db.donationIntent.findFirst({ select: { id: true, amountMinor: true, wantPackMedia: true, paymentMethod: true } }),
      db.paymentOrder.findFirst({ select: { id: true, customerPhone: true } }),
      db.paymentEvent.findFirst({ select: { id: true } }),
    ])
    database = true
    campaign = record?.status === 'published'
  } catch {
    database = false
  }

  let baseUrl = false
  try { baseUrl = Boolean(getCanonicalAppBaseUrl()) } catch { /* invalid app URL */ }
  const stripeSecret = Boolean(process.env.STRIPE_SECRET_KEY)
  const stripeWebhook = Boolean(process.env.STRIPE_WEBHOOK_SECRET)
  const stripeReady = database && campaign && baseUrl && stripeSecret && stripeWebhook
  const pixReady = database && campaign && baseUrl && misticpay.ready

  function reason(provider: 'pix' | 'stripe'): string | null {
    if (!database) return 'A base de dados dos pagamentos precisa de verificação ou migração.'
    if (!campaign) return 'Campanha Micaela não publicada na base de dados.'
    if (!baseUrl) return 'Endereço APP_BASE_URL não configurado corretamente na Vercel.'
    if (provider === 'pix' && misticpay.legacy) return 'A MisticPay requer novas chaves pk_/sk_; as ci_/cs_ foram desativadas.'
    if (provider === 'pix' && !misticpay.configured) return 'Chaves da MisticPay ausentes na Vercel.'
    if (provider === 'stripe' && !stripeSecret) return 'STRIPE_SECRET_KEY ausente na Vercel.'
    if (provider === 'stripe' && !stripeWebhook) return 'STRIPE_WEBHOOK_SECRET ausente na Vercel.'
    return null
  }

  return NextResponse.json({
    database, campaign, baseUrl,
    pix: { ready: pixReady, reason: reason('pix') },
    stripe: { ready: stripeReady, reason: reason('stripe'),
      checkout: stripeReady ? 'embedded_or_hosted_fallback' : 'unavailable' },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
