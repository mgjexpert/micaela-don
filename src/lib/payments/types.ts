/**
 * Payment domain types — shared across providers (Stripe, PixGo, manual_pix).
 * Status/type fields are strings (not enums) validated server-side with zod.
 */

export type PaymentProvider = 'stripe' | 'pixgo' | 'manual_pix'
export type PaymentMethod = 'mbway' | 'pix_automatic' | 'pix_manual'

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'refunded'
  | 'requires_manual_review'

export type DeliveryStatus = 'pending' | 'delivered' | 'failed'

export type PaymentEventStatus = 'pending' | 'processed' | 'failed'

export const PAYMENT_STATUSES: PaymentStatus[] = [
  'pending',
  'processing',
  'paid',
  'failed',
  'expired',
  'cancelled',
  'refunded',
  'requires_manual_review',
]

export const DELIVERY_STATUSES: DeliveryStatus[] = ['pending', 'delivered', 'failed']

/**
 * Validates that a status string is a known payment status.
 */
export function isValidPaymentStatus(s: string): s is PaymentStatus {
  return (PAYMENT_STATUSES as string[]).includes(s)
}

/**
 * Generates an internal reference for a payment order.
 * Format: PAY-{timestamp}-{random}. Used as client_reference_id / external_id.
 */
export function generateInternalReference(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 10)
  return `PAY-${ts}-${rand}`
}

/**
 * Validates monetary amount for a payment.
 * Returns the amount as a string with 2 decimal places, or throws.
 */
export function validateAmount(amount: number, min: number, max: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('O valor deve ser um número positivo.')
  }
  if (amount < min) {
    throw new Error(`O valor mínimo é ${min.toFixed(2)}.`)
  }
  if (amount > max) {
    throw new Error(`O valor máximo é ${max.toFixed(2)}.`)
  }
  // Providers and persisted orders must always agree on exact cents.
  const cents = Math.round(amount * 100)
  if (!Number.isSafeInteger(cents) || Math.abs(amount * 100 - cents) > 0.000001) {
    throw new Error('Use um valor com no máximo duas casas decimais.')
  }
  return (cents / 100).toFixed(2)
}
