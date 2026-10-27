import { db } from '@/lib/db'

export type PublicSite = {
  campaign: {
    id: string
    slug: string
    name: string
    currency: string
    country: string
    seoTitle: string | null
    seoDescription: string | null
    canonicalUrl: string | null
  } | null
  settings: Record<string, string>
  hero: {
    layout: string
    bannerImage: string | null
    bannerAlt: string | null
    portraitImage: string | null
    portraitAlt: string | null
    storyImage: string | null
    storyAlt: string | null
  }
  payment: {
    currency: string
    holder: string
    bank: string
    iban: string
    bic: string | null
    method: string
  } | null
  paymentStatus: { approved: boolean; published: boolean; exists: boolean }
  pix: {
    available: boolean
    beneficiaryName: string | null
    qrUrl: string | null
  }
  materials: {
    id: string
    name: string
    category: string
    type: string
    url: string
    source: string
    coverImage: string | null
    coverAlt: string | null
    description: string | null
  }[]
  contactChannels: { type: string; label: string; value: string }[]
}

function resolveImageRef(ref: string | null | undefined): string | null {
  if (!ref) return null
  if (ref.startsWith('asset:')) {
    return `/api/public/asset/${ref.slice(6)}`
  }
  return ref
}

type RawRow = Record<string, unknown>

function field(row: RawRow, camel: string, snake: string): unknown {
  return row[camel] ?? row[snake]
}

/**
 * Try Prisma query; if it fails (missing columns), fall back to raw SQL selecting
 * only the columns that exist in the ORIGINAL (pre-migration) schema.
 */
async function resilientQuery<T>(
  prismaQuery: () => Promise<T>,
  rawFallback: () => Promise<T>,
): Promise<T> {
  try {
    return await prismaQuery()
  } catch (err) {
    const code = (err as { code?: string })?.code
    // P2022 = column missing, P2021 = table missing
    if (code === 'P2022' || code === 'P2021') {
      return await rawFallback()
    }
    throw err
  }
}

/**
 * The single source of truth for what a visitor may see.
 * Returns ONLY published + approved data. Private data never leaves here.
 *
 * Resilient: if the multi-campanha / V2 migration hasn't been applied to the
 * production DB, falls back to raw SQL selecting only original-schema columns.
 */
export async function getPublicSite(_campaignId: string = 'micaela'): Promise<PublicSite> {
  try {
    const campaign = await db.campaign.findUnique({
      where: { id: _campaignId },
      select: {
        id: true, slug: true, name: true, currency: true, country: true,
        seoTitle: true, seoDescription: true, canonicalUrl: true, status: true,
      },
    })
    if (!campaign || campaign.status !== 'published') return EMPTY_PUBLIC_SITE

    // Legacy SQL fallbacks are only permitted for the original Micaela campaign.
    // Never read another campaign's settings, bank details, or materials on schema errors.
    const scopedQuery = <T,>(
      primary: () => Promise<T>,
      fallback: () => Promise<T>,
    ): Promise<T> => resilientQuery(primary, () => {
      if (_campaignId !== 'micaela') throw new Error('Esquema multicampanha incompleto.')
      return fallback()
    })

    // Try Prisma (typed); fallback to raw SQL (original schema columns only).
    const settings = await scopedQuery(
      () => db.siteSetting.findMany({ where: { campaignId: _campaignId } }),
      () => db.siteSetting.findMany().catch(async () =>
        db.$queryRawUnsafe('SELECT key, value FROM site_setting') as Promise<RawRow[]>,
      ),
    )
    const payment = await scopedQuery(
      () => db.paymentConfig.findFirst({ where: { campaignId: _campaignId }, orderBy: { updatedAt: 'desc' } }),
      () => db.paymentConfig.findFirst({ orderBy: { updatedAt: 'desc' } }).catch(async () => {
        const rows = await db.$queryRawUnsafe(
          'SELECT id, currency, holder, bank, iban, bic, method, published, approved FROM payment_config ORDER BY updated_at DESC LIMIT 1',
        ) as RawRow[]
        return rows[0] ?? null
      }),
    )
    const pix = await scopedQuery(
      () => db.pixConfig.findFirst({ where: { campaignId: _campaignId }, orderBy: { updatedAt: 'desc' } }),
      () => db.pixConfig.findFirst({ orderBy: { updatedAt: 'desc' } }).catch(async () => {
        const rows = await db.$queryRawUnsafe(
          'SELECT id, qr_image_data, qr_image_mime, beneficiary_name, approved, published FROM pix_config ORDER BY updated_at DESC LIMIT 1',
        ) as RawRow[]
        return rows[0] ?? null
      }),
    )
    const materials = await scopedQuery(
      () => db.campaignMaterial.findMany({ where: { campaignId: _campaignId, approved: true, published: true }, orderBy: { createdAt: 'desc' } }),
      () => db.campaignMaterial.findMany({ where: { approved: true, published: true }, orderBy: { createdAt: 'desc' } }).catch(async () =>
        db.$queryRawUnsafe(
          'SELECT id, name, category, type, url, source, cover_image_ref, cover_alt, description FROM campaign_material WHERE approved = true AND published = true ORDER BY created_at DESC',
        ) as Promise<RawRow[]>,
      ),
    )
    const channels = await scopedQuery(
      () => db.contactChannel.findMany({ where: { campaignId: _campaignId, enabled: true, published: true } }),
      () => db.contactChannel.findMany({ where: { enabled: true, published: true } }).catch(async () =>
        db.$queryRawUnsafe(
          'SELECT id, type, label, value FROM contact_channel WHERE enabled = true AND published = true',
        ) as Promise<RawRow[]>,
      ),
    )

    const settingsArr = (settings as RawRow[]).map((r) => ({
      key: String(r.key ?? r.k ?? ''),
      value: String(r.value ?? r.v ?? ''),
    }))
    const settingsMap = settingsArr.reduce<Record<string, string>>((acc, s) => {
      acc[s.key] = s.value
      return acc
    }, {})

    const paymentRow = payment as RawRow | null
    const showPayment = !!paymentRow && paymentRow.published === true && paymentRow.approved === true

    const pixRow = pix as RawRow | null
    const showPix = !!pixRow && pixRow.published === true && pixRow.approved === true && !!field(pixRow, 'qrImageData', 'qr_image_data')

    const hero = {
      layout: settingsMap['hero.layout'] ?? 'none',
      bannerImage: resolveImageRef(settingsMap['hero.bannerImage'] ?? null),
      bannerAlt: settingsMap['hero.bannerAlt'] ?? null,
      portraitImage: resolveImageRef(settingsMap['hero.portraitImage'] ?? null),
      portraitAlt: settingsMap['hero.portraitAlt'] ?? null,
      storyImage: resolveImageRef(settingsMap['hero.storyImage'] ?? null),
      storyAlt: settingsMap['hero.storyAlt'] ?? null,
    }

    return {
      campaign: { id: campaign.id, slug: campaign.slug, name: campaign.name, currency: campaign.currency, country: campaign.country, seoTitle: campaign.seoTitle, seoDescription: campaign.seoDescription, canonicalUrl: campaign.canonicalUrl },
      settings: settingsMap,
      hero,
      payment: showPayment
        ? {
            currency: String(paymentRow!.currency ?? 'EUR'),
            holder: String(paymentRow!.holder ?? ''),
            bank: String(paymentRow!.bank ?? ''),
            iban: String(paymentRow!.iban ?? ''),
            bic: (paymentRow!.bic as string | null) ?? null,
            method: String(paymentRow!.method ?? 'SEPA transfer'),
          }
        : null,
      paymentStatus: paymentRow
        ? { approved: paymentRow.approved === true, published: paymentRow.published === true, exists: true }
        : { approved: false, published: false, exists: false },
      pix: {
        available: showPix,
        beneficiaryName: showPix ? (field(pixRow!, 'beneficiaryName', 'beneficiary_name') as string | null) ?? null : null,
        qrUrl: showPix ? '/api/public/pix-qr' : null,
      },
      materials: (materials as RawRow[]).map((m) => ({
        id: String(m.id),
        name: String(m.name ?? ''),
        category: String(m.category ?? ''),
        type: String(m.type ?? ''),
        url: String(m.url ?? ''),
        source: String(m.source ?? 'google_drive'),
        coverImage: resolveImageRef(field(m, 'coverImageRef', 'cover_image_ref') as string | null),
        coverAlt: (field(m, 'coverAlt', 'cover_alt') as string | null) ?? null,
        description: (m.description as string | null) ?? null,
      })),
      contactChannels: (channels as RawRow[]).map((c) => ({
        type: String(c.type ?? ''),
        label: String(c.label ?? ''),
        value: String(c.value ?? ''),
      })),
    }
  } catch (err) {
    const code = (err as { code?: string })?.code ?? 'UNKNOWN'
    const name = (err as { name?: string })?.name ?? 'Error'
    const msg = (err as { message?: string })?.message ?? ''
    const safeMsg = msg.replace(/(?:postgres(?:ql)?|file):\/\/[^\s]+/gi, '[REDACTED_URL]')
    console.error('[getPublicSite] DB error:', { code, name, message: safeMsg })
    return EMPTY_PUBLIC_SITE
  }
}

export async function getCampaignIdBySlug(slug: string): Promise<string | null> {
  try {
    const campaign = await db.campaign.findUnique({
      where: { slug },
      select: { id: true, status: true },
    })
    if (!campaign || campaign.status !== 'published') return null
    return campaign.id
  } catch {
    return null
  }
}

const EMPTY_PUBLIC_SITE: PublicSite = {
  campaign: null,
  settings: {},
  hero: { layout: 'none', bannerImage: null, bannerAlt: null, portraitImage: null, portraitAlt: null, storyImage: null, storyAlt: null },
  payment: null,
  paymentStatus: { approved: false, published: false, exists: false },
  pix: { available: false, beneficiaryName: null, qrUrl: null },
  materials: [],
  contactChannels: [],
}
