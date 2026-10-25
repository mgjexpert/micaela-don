import { Resend } from 'resend'
import { createHash } from 'node:crypto'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'

/**
 * Email layer — server-only. Uses Resend with RESEND_API_KEY.
 *
 * Integration is NEW (no prior Resend integration existed in the codebase).
 * Uses Resend's official SDK. The API key and from address are env-only.
 *
 * Idempotency: an OutboundMessage is created before sending. If the webhook
 * fires again, the duplicate is rejected by the unique constraint
 * (channel, toAddress, donationIntentId) — so emails are not sent twice.
 *
 * This is NOT a fiscal receipt. It's a thank-you / informational email.
 */

let resendInstance: Resend | null = null

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    throw new Error('RESEND_API_KEY não configurada no servidor.')
  }
  if (!resendInstance) {
    resendInstance = new Resend(key)
  }
  return resendInstance
}

function getFrom(): string {
  return process.env.EMAIL_FROM ?? 'onboarding@resend.dev'
}

export type SendEmailParams = {
  to: string
  subject: string
  html: string
  campaignId?: string
  orderId?: string
  donationIntentId?: string
}

/**
 * Sends a thank-you email via Resend and records the outcome in OutboundMessage.
 * Idempotent: if an email was already sent for this (orderId, channel=email),
 * it is NOT re-sent.
 *
 * Returns { sent: boolean, messageId?: string, error?: string }
 */
export async function sendThankYouEmail(params: SendEmailParams): Promise<{
  sent: boolean
  messageId?: string
  error?: string
}> {
  const { to, subject, html, campaignId = 'micaela', orderId, donationIntentId } = params

  // Idempotency: check if an email was already sent OR is being processed for this
  // (channel=email, toAddress, donationIntentId) pair. If a message already exists
  // (any status), don't create a duplicate — retry the existing one if it failed.
  if (!orderId && !donationIntentId) {
    return { sent: false, error: 'É necessária uma referência de doação ou ordem.' }
  }
  // Stable primary key is unique at DB level even with nullable donationIntentId.
  // A second donation from the same email gets a different id.
  const scope = orderId ? `order:${orderId}` : `intent:${donationIntentId}`
  const messageKey = 'thankyou-' + createHash('sha256').update(scope).digest('hex').slice(0, 32)
  const existing = await db.outboundMessage.findUnique({ where: { id: messageKey } })
  if (existing) {
    if (existing.status === 'pending') return { sent: false, messageId: existing.id }
    if (existing.status === 'failed') {
      const claimed = await db.outboundMessage.updateMany({
        where: { id: existing.id, status: 'failed' },
        data: { status: 'pending' },
      })
      if (claimed.count !== 1) return { sent: false, messageId: existing.id }
    }
    // If already sent, don't resend (idempotency)
    if (existing.status === 'sent') {
      return { sent: false, messageId: existing.id }
    }
    // If failed, retry the existing message (increment attempts)
    try {
      const resend = getResend()
      const { data, error } = await resend.emails.send({
        from: getFrom(),
        to,
        subject,
        html,
        tags: orderId ? [{ name: 'order_id', value: orderId }] : [],
      })
      if (error) {
        await db.outboundMessage.update({
          where: { id: existing.id },
          data: {
            status: 'failed',
            attempts: { increment: 1 },
            lastError: error.message?.slice(0, 300) ?? 'Unknown error',
          },
        })
        return { sent: false, error: error.message }
      }
      await db.outboundMessage.update({
        where: { id: existing.id },
        data: {
          status: 'sent',
          attempts: { increment: 1 },
          sentAt: new Date(),
        },
      })
      return { sent: true, messageId: data?.id }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Unknown error'
      await db.outboundMessage.update({
        where: { id: existing.id },
        data: {
          status: 'failed',
          attempts: { increment: 1 },
          lastError: errMsg.slice(0, 300),
        },
      })
      return { sent: false, error: errMsg }
    }
  }

  // Create a new OutboundMessage (pending)
  const msg = await db.outboundMessage.create({
    data: {
      id: messageKey,
      campaignId,
      toAddress: to,
      channel: 'email',
      status: 'pending',
      attempts: 0,
      donationIntentId: donationIntentId ?? null,
    },
  }).catch(() => null)

  // If duplicate insert failed (unique constraint), email was already queued
  if (!msg) {
    return { sent: false }
  }

  try {
    const resend = getResend()
    const { data, error } = await resend.emails.send({
      from: getFrom(),
      to,
      subject,
      html,
      // Tag for Resend dashboard filtering
      tags: orderId ? [{ name: 'order_id', value: orderId }] : [],
    })

    if (error) {
      await db.outboundMessage.update({
        where: { id: msg.id },
        data: {
          status: 'failed',
          attempts: { increment: 1 },
          lastError: error.message?.slice(0, 300) ?? 'Unknown error',
        },
      })
      return { sent: false, error: error.message }
    }

    await db.outboundMessage.update({
      where: { id: msg.id },
      data: {
        status: 'sent',
        attempts: { increment: 1 },
        sentAt: new Date(),
      },
    })

    await audit({
      actor: 'system',
      action: 'email_sent',
      entity: 'OutboundMessage',
      entityId: msg.id,
      detail: `to=${to} order=${orderId ?? 'n/a'}`,
    })

    return { sent: true, messageId: data?.id }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Unknown error'
    await db.outboundMessage.update({
      where: { id: msg.id },
      data: {
        status: 'failed',
        attempts: { increment: 1 },
        lastError: errMsg.slice(0, 300),
      },
    })
    return { sent: false, error: errMsg }
  }
}

/**
 * Builds the thank-you email HTML for a confirmed payment.
 * This is informational, NOT a fiscal receipt.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c] ?? c))
}

export function buildThankYouHtml(campaignName: string, amount: string, currency: string, reference: string): string {
  campaignName = escapeHtml(campaignName)
  amount = escapeHtml(amount)
  currency = escapeHtml(currency)
  reference = escapeHtml(reference)
  return `
<!DOCTYPE html>
<html lang="pt">
<body style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1c1917;">
  <h1 style="color: #e11d48; margin-bottom: 8px;">Obrigado pelo seu gesto de apoio</h1>
  <p>Recebemos a sua contribuição para <strong>${campaignName}</strong>.</p>
  <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px 0; color: #78716c;">Valor:</td><td style="padding: 8px 0; text-align: right; font-weight: bold;">${amount} ${currency}</td></tr>
    <tr><td style="padding: 8px 0; color: #78716c;">Referência:</td><td style="padding: 8px 0; text-align: right; font-family: monospace;">${reference}</td></tr>
  </table>
  <p style="color: #78716c; font-size: 13px; margin-top: 24px;">
    Este email é informativo e não constitui recibo fiscal.
    A confirmação do pagamento foi recebida via o fornecedor de pagamentos.
  </p>
  <p style="color: #78716c; font-size: 13px;">
    Com os nossos agradecimentos,<br/>Um Gesto de Apoio
  </p>
</body>
</html>
`
}
