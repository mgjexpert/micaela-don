import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { json, badRequest, unauthorized, notFound } from '@/lib/api'
import { requireAdmin, clientIp } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { fulfillPayment } from '@/lib/notifications/fulfillment'

const patchSchema = z.object({
  // Administrative confirmation. A submitted form is NOT proof of payment.
  status: z.enum(['received', 'under_review', 'confirmed', 'rejected']).optional(),
  confirmed: z.boolean().optional(),
})

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const email = await requireAdmin(req)
  if (!email) return unauthorized()
  const { id } = await params
  const existing = await db.donationIntent.findUnique({ where: { id } })
  if (!existing) return notFound('Donativo não encontrado.')
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('JSON inválido.')
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Dados inválidos.')
  const d = parsed.data

  // Automated and manual PIX must be verified through their PaymentOrder.
  // A donation form record is never independent proof of such a payment.
  if ((d.confirmed === true || d.status === 'confirmed')
    && existing.paymentMethod !== 'bank_transfer'
    && existing.paymentMethod !== null) {
    return badRequest('Confirme este pagamento pela respetiva ordem e fornecedor.')
  }

  const confirmed = d.confirmed ?? (d.status === 'confirmed' ? true : existing.confirmed)
  const status = d.status ?? (confirmed ? 'confirmed' : existing.status)

  const updated = await db.donationIntent.update({
    where: { id },
    data: {
      status,
      confirmed,
      confirmedAt: confirmed ? (existing.confirmedAt ?? new Date()) : existing.confirmedAt,
      confirmedById: confirmed ? email : existing.confirmedById,
    },
  })

  await audit({
    actor: email,
    action: 'donation_updated',
    entity: 'DonationIntent',
    entityId: id,
    detail: `status=${updated.status} confirmed=${updated.confirmed}`,
    ip: clientIp(req),
  })
  if (confirmed && existing.paymentMethod === 'bank_transfer' && updated.donorEmail) {
    // SEPA is confirmed only by an authenticated admin after independent bank verification.
    // Store a PaymentOrder so Pack Media follows the same secure settlement rules.
    let order = await db.paymentOrder.findFirst({
      where: { donationIntentId: updated.id, provider: 'manual_bank' },
    })
    if (!order) {
      const amount = updated.amountMinor !== null && updated.amountMinor !== undefined
        ? updated.amountMinor / 100 : updated.amount
      if (amount !== null && amount !== undefined && amount > 0) {
        order = await db.paymentOrder.create({
          data: {
            campaignId: updated.campaignId,
            donationIntentId: updated.id,
            provider: 'manual_bank',
            method: 'bank_transfer',
            internalReference: 'BANK-' + updated.id,
            currency: updated.currency,
            amount: amount.toFixed(2),
            status: 'paid',
            confirmedAt: updated.confirmedAt ?? new Date(),
            confirmedById: email,
            customerEmail: updated.donorEmail,
            customerName: updated.donorName,
            metadata: JSON.stringify({ provider: 'manual_bank', method: 'bank_transfer' }),
          },
        })
      }
    } else if (order.status !== 'paid') {
      order = await db.paymentOrder.update({
        where: { id: order.id },
        data: { status: 'paid', confirmedAt: new Date(), confirmedById: email },
      })
    }
    if (order) await fulfillPayment(order.id)
  }
  return json({ donation: updated })
}
