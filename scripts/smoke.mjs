#!/usr/bin/env node
/** Non-destructive post-deployment smoke check. Requires only BASE_URL (public HTTPS). */
const base = process.env.BASE_URL
if (!base || !/^https:\/\//.test(base)) {
  console.error('BASE_URL must be an https URL.')
  process.exit(2)
}
for (const [path, expected] of [['/api/health', 200], ['/', 200], ['/api/public/payment-methods?campaignId=micaela', 200]]) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(15000) })
  if (response.status !== expected) {
    console.error(path, 'returned', response.status, 'expected', expected)
    process.exit(1)
  }
  console.log('OK', path, response.status)
}
