# Micaela DON — Payment hotfix P0 (2026-10-25)

## Scope
Base: `b97cee517a28920d70506a2dc684d447e3a0d41b` from `Job-Brasil/micaela-don`.

This patch changes MisticPay confirmation from **trusting webhook payload status** to **checking the transaction on MisticPay's authenticated server API**. A valid `COMPLETO` is accepted only when its identity, method (PIX), deposit type, BRL amount and transaction state all match the stored order. All provider errors fail closed; missing/unknown data must never authorize fulfillment.

Other changes: parse nested create/check API responses; support numeric transaction IDs; use `APP_BASE_URL` instead of client Origin for payment callback URLs; handle Stripe Checkout asynchronous result events; disable the currently undeliverable Pack Media option.

## Validation
- Run `node --experimental-strip-types --test tests/misticpay-provider.test.mjs` on Node >=22.
- Run `bun install --frozen-lockfile && bun run lint && bun run build` in an isolated checkout with required build configuration.
- Do NOT deploy without confirming the Supabase migrations, Vercel environment, MisticPay credentials and webhook endpoint, legitimate payment destination and Stripe webhook subscriptions.
- Test a controlled small real PIX charge end-to-end. **Do not use fabricated payment proof.**
- Verify duplicate callbacks, pending state, wrong-amount rejection, refund handling, email idempotency, and server logs without leaking personal/payment secrets.
- Confirm Stripe dashboard sends `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `checkout.session.async_payment_failed`.

## Current implementation after the global release-candidate follow-up
1. `DonationIntent` is now linked to `PaymentOrder` by matching the campaign, method, currency and amount.
2. Thank-you emails have a deterministic, order-scoped primary key. Transactional receipts and promotional consent are separate.
3. Pack Media is now available in source code: generated SVG/TXT, approved published campaign materials, private 7-day links, admin recovery and payment-state checks. See `docs/pack-media.md`.
4. Still required: real-provider payment tests, Vercel deployment access, real DB migration verification, sender-domain validation and end-to-end smoke testing.

The fork/PR does **not** automatically deploy to `ajudar.charity`; source production is independently controlled.
