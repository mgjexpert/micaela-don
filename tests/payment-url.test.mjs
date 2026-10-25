import test from 'node:test'
import assert from 'node:assert/strict'
import { getCanonicalAppBaseUrl } from '../src/lib/payments/urls.ts'
test('only a server-configured HTTPS origin may receive a payment callback', () => {
  assert.equal(getCanonicalAppBaseUrl('https://ajudar.charity'), 'https://ajudar.charity')
  assert.equal(getCanonicalAppBaseUrl('https://preview.example.com/'), 'https://preview.example.com')
  for (const base of ['', 'http://ajudar.charity', 'https://ajudar.charity/redirect',
    'https://user:pass@ajudar.charity', 'javascript:alert(1)', 'https://ajudar.charity?x=1']) {
    assert.throws(() => getCanonicalAppBaseUrl(base))
  }
})
