/**
 * Simple media setup for the Micaela + Elisa fundraiser.
 * Set Vercel environment variables or paste the links below.
 * Google Drive images must be shared publicly ("anyone with the link").
 * A folder link is NOT a direct image; use each photo's file/share URL.
 */
const FALLBACK = {
  banner: '',
  upper: [] as string[],
  lower: [] as string[],
}
function imageUrl(input: string): string {
  const link = input.trim()
  if (!link) return ''
  try {
    const url = new URL(link)
    if (url.protocol !== 'https:') return ''
    if (url.hostname === 'drive.google.com' || url.hostname === 'docs.google.com') {
      const id = url.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/)?.[1]
        ?? url.searchParams.get('id')
      if (id && /^[A-Za-z0-9_-]{12,}$/.test(id)) {
        return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w1600'
      }
      return ''
    }
    return url.toString()
  } catch { return '' }
}
function gallery(key: string, fallback: string[]): string[] {
  const fromEnv = process.env[key]
  return (fromEnv ? fromEnv.split(/[\n,;]+/) : fallback).map(imageUrl).filter(Boolean).slice(0, 12)
}
export function micaelaLandingConfig() {
  return {
    title: process.env.MICAELA_TITLE || 'Micaela & Elisa — juntas por um sonho',
    subtitle: process.env.MICAELA_SUBTITLE
      || 'Duas amigas, um projeto pessoal e uma comunidade que pode ajudar a torná-lo possível. Qualquer contribuição voluntária faz a diferença.',
    banner: imageUrl(process.env.MICAELA_BANNER_URL || FALLBACK.banner),
    upper: gallery('MICAELA_GALLERY_TOP', FALLBACK.upper),
    lower: gallery('MICAELA_GALLERY_BOTTOM', FALLBACK.lower),
  }
}
