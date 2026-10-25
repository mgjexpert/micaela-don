import { NextResponse } from 'next/server'
import { getPackDelivery } from '@/lib/notifications/delivery'
import { createPackCardSvg, createPackShareText } from '@/lib/pack-media/assets'
import { getCanonicalAppBaseUrl } from '@/lib/payments/urls'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
type Args = { params: Promise<{ token: string; kind: string }> }

export async function GET(_req: Request, { params }: Args) {
  const { token, kind } = await params
  if (kind !== 'card' && kind !== 'share') {
    return NextResponse.json({ error: 'Ficheiro não encontrado.' }, { status: 404 })
  }
  const pack = await getPackDelivery(token)
  if (!pack) return NextResponse.json({ error: 'Acesso indisponível ou expirado.' }, { status: 404 })

  const isCard = kind === 'card'
  const campaignUrl = getCanonicalAppBaseUrl()
    + (pack.campaignSlug === 'micaela' ? '/' : '/' + encodeURIComponent(pack.campaignSlug))
  const bytes = isCard
    ? createPackCardSvg(pack.campaignName)
    : createPackShareText(pack.campaignName, campaignUrl)
  return new NextResponse(bytes, {
    headers: {
      'Content-Type': isCard ? 'image/svg+xml; charset=utf-8' : 'text/plain; charset=utf-8',
      'Content-Disposition': isCard
        ? 'attachment; filename="cartao-de-agradecimento.svg"'
        : 'attachment; filename="mensagem-de-partilha.txt"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Referrer-Policy': 'no-referrer',
    },
  })
}
