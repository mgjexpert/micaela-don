import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json } from '@/lib/api'

/**
 * Returns which payment methods are available.
 * Methods are NOT locked to the campaign's currency — donors can choose any
 * available method regardless of campaign default.
 * No secrets are exposed — only boolean availability flags.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get('campaignId') ?? 'micaela'

  const stripeConfigured = !!process.env.STRIPE_SECRET_KEY
  const pixgoConfigured = !!process.env.PIXGO_API_KEY && process.env.ENABLE_PIXGO === 'true'
  const misticpayConfigured = !!(process.env.MISTICPAY_CLIENT_ID && process.env.MISTICPAY_CLIENT_SECRET)

  let pixManualAvailable = false
  let bankTransferAvailable = false
  let pixBeneficiaryName: string | null = null
  let bankHolder: string | null = null
  let bankIban: string | null = null
  let bankName: string | null = null
  let bankBic: string | null = null

  try {
    const pix = await db.pixConfig.findFirst({
      where: { campaignId },
      orderBy: { updatedAt: 'desc' },
    }).catch(() =>
      db.pixConfig.findFirst({ orderBy: { updatedAt: 'desc' } }).catch(() => null),
    ) as { approved?: boolean; published?: boolean; beneficiaryName?: string } | null

    if (pix && pix.approved && pix.published) {
      pixManualAvailable = true
      pixBeneficiaryName = pix.beneficiaryName ?? null
    }
  } catch {
    // non-critical
  }

  try {
    const payment = await db.paymentConfig.findFirst({
      where: { campaignId },
      orderBy: { updatedAt: 'desc' },
    }).catch(() =>
      db.paymentConfig.findFirst({ orderBy: { updatedAt: 'desc' } }).catch(() => null),
    ) as { approved?: boolean; published?: boolean; holder?: string; iban?: string; bank?: string; bic?: string | null } | null

    if (payment && payment.approved && payment.published) {
      bankTransferAvailable = true
      bankHolder = payment.holder ?? null
      bankIban = payment.iban ?? null
      bankName = payment.bank ?? null
      bankBic = payment.bic ?? null
    }
  } catch {
    // non-critical
  }

  return json({
    methods: {
      mbway: {
        available: stripeConfigured,
        currencies: ['EUR'],
        reason: stripeConfigured ? null : 'Stripe não configurado',
      },
      pix_automatic: {
        available: misticpayConfigured || pixgoConfigured,
        currencies: ['BRL'],
        reason: (misticpayConfigured || pixgoConfigured) ? null : 'PIX automático não configurado',
        provider: misticpayConfigured ? 'misticpay' : (pixgoConfigured ? 'pixgo' : null),
      },
      pix_manual: {
        available: pixManualAvailable,
        currencies: ['BRL'],
        beneficiaryName: pixBeneficiaryName,
      },
      bank_transfer: {
        available: bankTransferAvailable,
        currencies: ['EUR'],
        holder: bankHolder,
        bank: bankName,
        iban: bankIban,
        bic: bankBic,
      },
    },
    suggestedAmounts: {
      EUR: [5, 10, 20, 50],
      BRL: [20, 50, 100, 200],
    },
    limits: {
      EUR: { minMinor: 100, maxMinor: 1000000 },
      BRL: { minMinor: 100, maxMinor: 5000000 },
    },
  })
}
