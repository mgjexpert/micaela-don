/**
 * Server-only MisticPay adapter. Webhooks are untrusted notifications:
 * payment authorization requires a verified /transactions/check response.
 * Docs: https://docs.misticpay.com/
 */
const API_BASE = 'https://api.misticpay.com/api'

export type CreateMisticPayPaymentParams = {
  amount: number
  payerName: string
  payerDocument: string
  description: string
  transactionId: string
  webhookUrl: string
}
export type MisticPayPaymentResponse = {
  transactionId?: string
  pixQrCode: string | null
  pixCopyPaste: string | null
  status?: string
  amount?: number
}
export type MisticPayStatusResponse = {
  transactionId?: string
  clientTransactionId?: string
  status?: string
  amount?: number
  transactionType?: string
  transactionMethod?: string
}
type ObjectValue = Record<string, unknown>
function record(value: unknown): ObjectValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as ObjectValue : null
}
function identifier(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}
function stringField(obj: ObjectValue, fields: string[]): string | null {
  for (const field of fields) {
    const value = obj[field]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}
function numberField(obj: ObjectValue, fields: string[]): number | undefined {
  for (const field of fields) {
    const value = obj[field]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return undefined
}
/** Supports the current pk_/sk_ key pair without breaking existing env names. */
export function misticPayCredentials(): { configured: boolean; legacy: boolean; ready: boolean } {
  const id = process.env.MISTICPAY_ACCESS_KEY_ID || process.env.MISTICPAY_CLIENT_ID
  const secret = process.env.MISTICPAY_ACCESS_KEY_SECRET || process.env.MISTICPAY_CLIENT_SECRET
  const configured = Boolean(id && secret)
  const legacy = Boolean(id?.startsWith('ci_') || secret?.startsWith('cs_'))
  return { configured, legacy, ready: configured && !legacy }
}
function authHeader(): string {
  const id = process.env.MISTICPAY_ACCESS_KEY_ID || process.env.MISTICPAY_CLIENT_ID
  const secret = process.env.MISTICPAY_ACCESS_KEY_SECRET || process.env.MISTICPAY_CLIENT_SECRET
  if (!id || !secret) throw new Error('MISTICPAY_MISSING_CREDENTIALS')
  if (id.startsWith('ci_') || secret.startsWith('cs_')) {
    throw new Error('MISTICPAY_LEGACY_CREDENTIALS')
  }
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`
}
async function post(path: string, payload: ObjectValue): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
    body: JSON.stringify(payload),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) {
    let code = ''
    try {
      const body = await response.json() as { code?: unknown }
      code = typeof body.code === 'string' ? body.code : ''
    } catch { /* generic fallback */ }
    // Only expose stable, documented provider codes; never error bodies or credentials.
    const safeCode = /^[A-Z][A-Z0-9_]{2,64}$/.test(code) ? code : 'GATEWAY_ERROR'
    throw new Error(`MISTICPAY_${safeCode}_HTTP_${response.status}`)
  }
  return response.json()
}

/** The create endpoint responds with {message, data:{...}}. */
export function normalizeMisticPayCreate(raw: unknown): MisticPayPaymentResponse {
  const outer = record(raw) ?? {}
  const data = record(outer.data) ?? outer
  const qr = stringField(data, ['qrCodeBase64', 'pixQrCode', 'qrCode', 'qr_code', 'qrcode'])
  return {
    transactionId: identifier(data.transactionId) ?? identifier(data.id) ?? identifier(data.transaction_id),
    pixQrCode: qr && !qr.startsWith('data:') && !qr.startsWith('https://')
      ? `data:image/png;base64,${qr}` : qr,
    pixCopyPaste: stringField(data, ['copyPaste', 'pixCopyPaste', 'copy_paste', 'pixCode', 'brCode', 'payload']),
    status: stringField(data, ['transactionState', 'status', 'state']) ?? undefined,
    amount: numberField(data, ['transactionAmount', 'value', 'amount']),
  }
}

/** The status endpoint responds with {message, transaction:{...}}. */
export function normalizeMisticPayStatus(raw: unknown): MisticPayStatusResponse {
  const outer = record(raw) ?? {}
  const data = record(outer.transaction) ?? record(outer.data) ?? outer
  return {
    transactionId: identifier(data.transactionId),
    clientTransactionId: identifier(data.clientTransactionId),
    status: stringField(data, ['transactionState', 'status', 'state']) ?? undefined,
    amount: numberField(data, ['value', 'transactionAmount', 'amount']),
    transactionType: stringField(data, ['transactionType']) ?? undefined,
    transactionMethod: stringField(data, ['transactionMethod']) ?? undefined,
  }
}

export type MisticPayState =
  | 'PENDENTE' | 'COMPLETO' | 'FALHA' | 'CANCELADO' | 'DEVOLVIDO' | 'DEVOLVIDO_PARCIAL'

/**
 * Pure reconciliation, so a spoofed webhook can never authorize payment.
 * Requires provider identity, PIX deposit, exact cent amount and known state.
 */
export function reconcileMisticPay(
  verified: MisticPayStatusResponse,
  expected: { internalReference: string; externalId: string | null; currency: string; amount: number },
): { ok: true; state: MisticPayState } | { ok: false; reason: string } {
  const known = [expected.internalReference, expected.externalId].filter((id): id is string => !!id)
  const received = [verified.transactionId, verified.clientTransactionId].filter((id): id is string => !!id)
  if (!received.length || !received.some(id => known.includes(id))) {
    return { ok: false, reason: 'transaction_identity_mismatch' }
  }
  if (verified.transactionType?.toUpperCase() !== 'DEPOSITO'
    || verified.transactionMethod?.toUpperCase() !== 'PIX') {
    return { ok: false, reason: 'payment_type_mismatch' }
  }
  if (expected.currency !== 'BRL' || verified.amount === undefined
    || !Number.isFinite(verified.amount)
    || Math.round(verified.amount * 100) !== Math.round(expected.amount * 100)) {
    return { ok: false, reason: 'amount_mismatch' }
  }
  const state = verified.status?.toUpperCase()
  if (!state || !(['PENDENTE', 'COMPLETO', 'FALHA', 'CANCELADO', 'DEVOLVIDO', 'DEVOLVIDO_PARCIAL'] as string[]).includes(state)) {
    return { ok: false, reason: 'unknown_provider_state' }
  }
  return { ok: true, state: state as MisticPayState }
}

export async function createMisticPayPayment(params: CreateMisticPayPaymentParams): Promise<MisticPayPaymentResponse> {
  return normalizeMisticPayCreate(await post('/transactions/create', {
    amount: params.amount,
    payerName: params.payerName,
    payerDocument: params.payerDocument,
    description: params.description,
    transactionId: params.transactionId,
    projectWebhook: params.webhookUrl,
  }))
}
export async function getMisticPayPaymentStatus(transactionId: string): Promise<MisticPayStatusResponse> {
  return normalizeMisticPayStatus(await post('/transactions/check', { transactionId }))
}
export const isMisticPayConfigured = () => misticPayCredentials().ready
