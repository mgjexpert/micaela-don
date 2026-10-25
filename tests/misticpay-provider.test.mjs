import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeMisticPayCreate, normalizeMisticPayStatus, reconcileMisticPay,
} from '../src/lib/providers/misticpay.ts'

const expected = { internalReference: 'PAY-001', externalId: '31484480', currency: 'BRL', amount: 15.25 }
const valid = {
  transactionId: '31484480',
  clientTransactionId: 'PAY-001',
  status: 'COMPLETO',
  amount: 15.25,
  transactionType: 'DEPOSITO',
  transactionMethod: 'PIX',
}

test('create response: nested data and QR code already prefixed', () => {
  const actual = normalizeMisticPayCreate({ message: 'ok', data: {
    transactionId: 31484480, qrCodeBase64: 'data:image/png;base64,aGVsbG8=',
    copyPaste: '000201', transactionState: 'PENDENTE', transactionAmount: 15.25,
  } })
  assert.equal(actual.transactionId, '31484480')
  assert.equal(actual.pixQrCode, 'data:image/png;base64,aGVsbG8=')
  assert.equal(actual.pixCopyPaste, '000201')
  assert.equal(actual.status, 'PENDENTE')
})

test('create response: raw base64 is prefixed once', () => {
  const actual = normalizeMisticPayCreate({ data: { qrCodeBase64: 'aGVsbG8=' } })
  assert.equal(actual.pixQrCode, 'data:image/png;base64,aGVsbG8=')
})

test('check response: nested transaction and numeric ID', () => {
  const actual = normalizeMisticPayStatus({ message: 'ok', transaction: {
    transactionId: 31484480, transactionState: 'COMPLETO', value: 15.25,
    transactionType: 'DEPOSITO', transactionMethod: 'PIX',
  } })
  assert.equal(actual.transactionId, '31484480')
  assert.equal(actual.status, 'COMPLETO')
  assert.equal(actual.amount, 15.25)
})

test('valid verified payment is accepted', () => {
  assert.deepEqual(reconcileMisticPay(valid, expected), { ok: true, state: 'COMPLETO' })
})

for (const [name, change] of [
  ['spoofed ID', { transactionId: 'not-this-order', clientTransactionId: 'not-this-order' }],
  ['wrong value', { amount: 10 }],
  ['missing amount', { amount: undefined }],
  ['wrong transaction type', { transactionType: 'RETIRADA' }],
  ['wrong method', { transactionMethod: 'CRYPTO' }],
  ['missing state', { status: undefined }],
  ['unknown state', { status: 'PAID_BUT_UNDOCUMENTED' }],
]) {
  test(`rejects ${name} even if webhook says COMPLETO`, () => {
    const actual = reconcileMisticPay({ ...valid, ...change }, expected)
    assert.equal(actual.ok, false)
  })
}

test('a pending provider state never authorizes a settled payment', () => {
  assert.deepEqual(reconcileMisticPay({ ...valid, status: 'PENDENTE' }, expected), {
    ok: true, state: 'PENDENTE',
  })
})

test('malformed provider response fails closed', () => {
  const actual = normalizeMisticPayStatus({ data: { bogus: true } })
  assert.equal(reconcileMisticPay(actual, expected).ok, false)
})
