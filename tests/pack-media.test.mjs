import test from 'node:test'
import assert from 'node:assert/strict'
import { createPackCardSvg, createPackShareText, isSafePackUrl, escapeXml } from '../src/lib/pack-media/assets.ts'

test('Pack Media generates downloadable branded SVG with safe escaping', () => {
  const svg = createPackCardSvg('Micaela <script>alert("x")</script> & amigos')
  assert.ok(svg.startsWith('<svg '))
  assert.match(svg, /Micaela &lt;script&gt;/)
  assert.doesNotMatch(svg, /Micaela <script>/)
  assert.match(svg, /Um Gesto de Apoio/)
  assert.equal(escapeXml('"&\''), '&quot;&amp;&apos;')
})
test('share text uses a public URL and never a delivery token', () => {
  const text = createPackShareText('Micaela', 'https://ajudar.charity/')
  assert.match(text, /Micaela/)
  assert.match(text, /https:\/\/ajudar.charity\//)
  assert.doesNotMatch(text, /\/pack\//)
})
test('only proper HTTPS material URLs are shown as trusted campaign media', () => {
  assert.ok(isSafePackUrl('https://drive.google.com/file/d/example/view'))
  assert.ok(isSafePackUrl('https://youtube.com/watch?v=demo'))
  for (const value of [
    'javascript:alert(1)', 'http://example.com', 'file:///private',
    'https://user:password@example.com', '//example.com',
  ]) assert.equal(isSafePackUrl(value), false)
})
