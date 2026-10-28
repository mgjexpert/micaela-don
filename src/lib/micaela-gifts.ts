export type GiftLevel = 1 | 2 | 3 | 4

/** Suggested levels only; donations remain entirely voluntary. */
export function giftLevel(amount: number, currency: string): GiftLevel {
  const thresholds = currency === 'BRL' ? [20, 50, 100, 500] : [5, 10, 20, 100]
  if (amount >= thresholds[3]) return 4
  if (amount >= thresholds[2]) return 3
  if (amount >= thresholds[1]) return 2
  return 1
}

export const GIFT_DESCRIPTIONS = [
  'Seleção de 30 fotografias e 5 vídeos',
  'Seleção de 50 fotografias e 10 vídeos',
  'Seleção de 100 fotografias e 20 vídeos',
  'Coleção alargada: até 500 fotografias e 20 vídeos',
] as const

/** A gift Drive URL is server-only and is never returned before a paid order and opt-in. */
export function giftDriveUrl(amount: number, currency: string): string | null {
  const level = giftLevel(amount, currency)
  const url = process.env['MICAELA_GIFT_DRIVE_' + level] || ''
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null
    return parsed.toString()
  } catch { return null }
}
