import test from 'node:test'
import assert from 'node:assert/strict'
import { validateAmount, isValidPaymentStatus } from '../src/lib/payments/types.ts'
test('exact two-decimal values remain exact through payment providers', () => {
  assert.equal(validateAmount(1, 1, 10000), '1.00')
  assert.equal(validateAmount(15.25, 1, 10000), '15.25')
  assert.equal(validateAmount(0.3, 0.1, 50000), '0.30')
})
test('amounts cannot silently round or go outside bounds', () => {
  assert.throws(() => validateAmount(1.005, 1, 50000), /duas casas/)
  assert.throws(() => validateAmount(0.99, 1, 50000))
  assert.throws(() => validateAmount(50000.01, 1, 50000))
  assert.throws(() => validateAmount(Infinity, 1, 50000))
})
test('valid state enumeration prevents unrecognized payment status', () => {
  assert.ok(isValidPaymentStatus('paid'))
  assert.equal(isValidPaymentStatus('secretly_paid'), false)
})
