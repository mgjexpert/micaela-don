import { db } from '@/lib/db'
import { sendThankYouEmail, buildThankYouHtml } from '@/lib/notifications/email'
import { ensurePackDeliveryLink } from '@/lib/notifications/delivery'
import { getCanonicalAppBaseUrl } from '@/lib/payments/urls'
import { audit } from '@/lib/audit'

export type FulfillmentResult = {
  emailSent: boolean
  deliveryLink?: string
  error?: string
}

/**
 * Called only after verified settlement. The Pack Media is granted only to the
 * matching intent with explicit opt-in; all links require an active paid order.
 */
export async function fulfillPayment(orderId: string): Promise<FulfillmentResult> {
  const order = await db.paymentOrder.findUnique({ where: { id: orderId } })
  if (!order) return { emailSent: false, error: 'Order not found' }
  if (order.status !== 'paid') return { emailSent: false, error: 'Order not paid' }

  if (!order.customerEmail) {
    await audit({
      actor: 'system', action: 'fulfillment_no_email',
      entity: 'PaymentOrder', entityId: orderId, detail: 'No customer email on order',
    })
    return { emailSent: false, error: 'No customer email' }
  }

  const campaign = await db.campaign.findUnique({
    where: { id: order.campaignId },
    select: { name: true },
  })
  const campaignName = campaign?.name ?? 'Um Gesto de Apoio'
  let html = buildThankYouHtml(campaignName, order.amount.toString(), order.currency, order.internalReference)
  let deliveryLink: string | undefined

  if (order.donationIntentId) {
    const intent = await db.donationIntent.findUnique({
      where: { id: order.donationIntentId },
      select: { campaignId: true, wantPackMedia: true },
    })
    if (intent?.wantPackMedia && intent.campaignId === order.campaignId) {
      const { token } = await ensurePackDeliveryLink(order.id, order.campaignId)
      deliveryLink = '/pack/' + token
      const publicUrl = getCanonicalAppBaseUrl() + deliveryLink
      html += '<div style="margin:20px 0;padding:18px;background:#fff1f2;border-radius:12px">'
        + '<h2 style="color:#9f1239">O seu Pack Media está pronto</h2>'
        + '<p>Aceda ao cartão de agradecimento, à mensagem de partilha e aos materiais aprovados desta campanha.</p>'
        + '<p><a href="' + publicUrl
        + '" style="background:#be123c;color:#fff;padding:12px 20px;display:inline-block;border-radius:8px">'
        + 'Abrir o Pack Media</a></p>'
        + '<p style="font-size:12px;color:#78716c">Acesso pessoal válido durante 7 dias. Guarde este e-mail.</p></div>'
    }
  }

  const result = await sendThankYouEmail({
    to: order.customerEmail,
    subject: 'Obrigado pelo seu apoio — ' + campaignName,
    html, campaignId: order.campaignId,
    orderId: order.id, donationIntentId: order.donationIntentId ?? undefined,
  })

  if (result.sent) {
    await db.paymentOrder.update({
      where: { id: order.id },
      data: { deliveryStatus: 'delivered' },
    })
  } else if (result.error) {
    await db.paymentOrder.update({
      where: { id: order.id },
      data: { deliveryStatus: 'failed' },
    })
  }
  return { emailSent: result.sent, deliveryLink, error: result.error }
}
