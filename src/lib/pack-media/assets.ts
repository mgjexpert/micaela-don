/**
 * Generated, immediately usable Pack Media assets.
 * Curated published materials appear alongside these defaults.
 */
export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] ?? char)
}
export function isSafePackUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password
  } catch { return false }
}
export function createPackCardSvg(campaignName: string): string {
  const name = escapeXml(campaignName.slice(0, 100))
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">',
    '<defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#fff1f2"/>',
    '<stop offset="1" stop-color="#ffe4e6"/></linearGradient></defs>',
    '<rect width="1200" height="630" fill="url(#g)"/>',
    '<rect x="55" y="55" width="1090" height="520" rx="32" fill="#fff" stroke="#fecdd3" stroke-width="3"/>',
    '<circle cx="600" cy="173" r="59" fill="#e11d48"/>',
    '<path d="M600 205l-34-31c-23-21 9-51 34-22 25-29 57 1 34 22z" fill="#fff"/>',
    '<text x="600" y="290" text-anchor="middle" fill="#881337" font-family="Arial,sans-serif" font-size="53" font-weight="bold">Obrigado pelo seu gesto!</text>',
    '<text x="600" y="362" text-anchor="middle" fill="#44403c" font-family="Arial,sans-serif" font-size="30">Juntos, fazemos a diferença.</text>',
    '<text x="600" y="465" text-anchor="middle" fill="#9f1239" font-family="Arial,sans-serif" font-size="26">',
    name,
    '</text><text x="600" y="525" text-anchor="middle" fill="#78716c" font-family="Arial,sans-serif" font-size="20">Um Gesto de Apoio</text>',
    '</svg>',
  ].join('')
}
export function createPackShareText(campaignName: string, campaignUrl: string): string {
  return [
    'UM GESTO DE APOIO',
    '',
    'Quero partilhar uma causa que merece ser conhecida:',
    campaignName,
    '',
    'Conheça a história e, se puder, participe:',
    campaignUrl,
    '',
    'Qualquer partilha pode ajudar. Obrigado!',
    '',
    'Não divulgue dados pessoais ou comprovativos bancários.',
  ].join('\n')
}

/** Pure access rule shared by the delivery handler and unit tests. */
export function isAuthorizedPackAccess(flags: {
  paid: boolean
  optedIn: boolean
  sameCampaign: boolean
  notExpired: boolean
  notConsumed: boolean
}): boolean {
  return flags.paid && flags.optedIn && flags.sameCampaign && flags.notExpired && flags.notConsumed
}
