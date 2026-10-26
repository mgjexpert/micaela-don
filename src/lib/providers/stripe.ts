import Stripe from 'stripe'

/**
 * Stripe adapter — server-only. Uses STRIPE_SECRET_KEY from env.
 *
 * This integration uses Stripe Checkout (hosted by Stripe) for MB WAY in Portugal.
 * The Stripe Secret Key is NEVER exposed to the client.
 *
 * Configuration:
 * - STRIPE_SECRET_KEY: sk_test_... (test) or sk_live_... (production)
 * - STRIPE_WEBHOOK_SECRET: whsec_... (from Stripe Dashboard webhook endpoint)
 *
 * MB WAY: payment_method_types=['multibanco'] is NOT mbway.
 * MB WAY uses the 'multibanco' payment method type ONLY for Multibanco reference payments.
 * For MB WAY, Stripe Checkout handles the method selection automatically when the
 * customer is in Portugal; no explicit payment_method_types is needed for MB WAY.
 * We set payment_method_types to undefined (let Stripe show available methods).
 *
 * IMPORTANT: confirm MB WAY is enabled in the Stripe Dashboard for the account,
 * country (PT), and currency (EUR) before going live.
 */

let stripeInstance: Stripe | null = null

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY não configurada no servidor.')
  }
  if (!stripeInstance) {
    stripeInstance = new Stripe(key, {
      apiVersion: '2025-08-27.basil' as Stripe.LatestApiVersion,
      typescript: true,
    })
  }
  return stripeInstance
}

export type CreateSessionParams = {
  internalReference: string
  amount: number
  currency: string
  campaignName: string
  customerEmail: string
  returnUrl: string
  cancelUrl: string
  metadata?: Record<string, string>
}

/**
 * Creates a Stripe-hosted Checkout Session. The server returns only the
 * HTTPS Checkout URL; no Stripe.js iframe or public key is required.
 */
export async function createCheckoutSession(params: CreateSessionParams): Promise<{
  sessionId: string
  checkoutUrl: string
}> {
  const stripe = getStripe()
  const amountInSmallestUnit = Math.round(params.amount * 100)

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    ui_mode: 'hosted',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: params.currency.toLowerCase(),
          unit_amount: amountInSmallestUnit,
          product_data: {
            name: `Apoio — ${params.campaignName}`,
            description: 'Contribuição para campanha de solidariedade',
          },
        },
      },
    ],
    customer_email: params.customerEmail,
    client_reference_id: params.internalReference,
    payment_intent_data: { metadata: { internal_reference: params.internalReference, ...params.metadata } },
    metadata: {
      internal_reference: params.internalReference,
      campaign_name: params.campaignName,
      ...params.metadata,
    },
    success_url: params.returnUrl,
    cancel_url: params.cancelUrl,
    locale: 'pt',
  })

  if (!session.url || !session.url.startsWith('https://')) {
    throw new Error('Stripe não devolveu um URL de checkout válido.')
  }
  return { sessionId: session.id, checkoutUrl: session.url }
}

/**
 * Verifies a Stripe webhook signature using the official SDK.
 * Uses the raw body (as string) and the STRIPE_WEBHOOK_SECRET.
 *
 * @returns The verified Stripe event, or throws if invalid.
 */
export function verifyStripeWebhook(
  rawBody: string,
  signature: string,
): Stripe.Event {
  const stripe = getStripe()
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET não configurada no servidor.')
  }
  return stripe.webhooks.constructEvent(rawBody, signature, secret)
}

export type StripeSession = Stripe.Checkout.Session
export type StripeEvent = Stripe.Event
