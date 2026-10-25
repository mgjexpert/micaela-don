import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { notFound } from '@/lib/api'

/**
 * Streams the PIX QR image. Returns 404 unless approved && published && qrImageData present.
 * This is the single public surface for the QR; the raw image bytes never live in /public.
 */
export async function GET(req: NextRequest) {
  const campaignId = new URL(req.url).searchParams.get('campaignId') ?? 'micaela'
  const pix = await db.pixConfig.findFirst({
    where: { campaignId, approved: true, published: true },
    orderBy: { updatedAt: 'desc' },
  })
  if (!pix || !pix.approved || !pix.published || !pix.qrImageData || !pix.qrImageMime) {
    return notFound('QR não disponível.')
  }
  const buf = Buffer.from(pix.qrImageData, 'base64')
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': pix.qrImageMime,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
