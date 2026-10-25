# Micaela DON — Global release plan (25 October 2026)

## Current version
- GitHub fork: mgjexpert/micaela-don
- PR #1 is the isolated release candidate until checks and staging are reviewed.
- No database or production Vercel project for Micaela DON could be identified within the available linked accounts.
- Do not modify the original live project `Job-Brasil/micaela-don` or its payment destination without verification.

## Critical flow
1. Public visitor chooses amount, currency and method.
2. `/api/public/donation-intent` atomically creates a DonationIntent and any *explicit* contact consents.
3. Stripe / MisticPay / PixGo / manual PIX creates a linked PaymentOrder using `donationIntentId` and server-side amount verification.
4. A provider-verified webhook or manual admin confirmation marks the PaymentOrder paid and synchronizes the DonationIntent.
5. Thank-you email is scoped with a deterministic per-payment database id. Do not send marketing emails automatically.
6. Pack Media remains disabled until content delivery, asset security, and authorization are ready.

## Expected deployment configuration — set in Vercel, never in Git
Mandatory for operational checkout:
- `APP_BASE_URL` canonical https origin for the deployed environment.
- `DATABASE_URL` and `DIRECT_DATABASE_URL` for the migrated PostgreSQL database.
- `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` (set securely).
- For Stripe/MB WAY: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; active MB WAY merchant account.
- For MisticPay: `MISTICPAY_CLIENT_ID`, `MISTICPAY_CLIENT_SECRET` with both **TRANSACTION_CREATE** and **TRANSACTION_READ** permissions. MisticPay offers no sandbox, so test with authorized low values.
- Email: `RESEND_API_KEY` and `EMAIL_FROM` (verified sender domain). Missing email config does not void a confirmed donation, but acknowledgments cannot be delivered.
- `ENABLE_PIXGO=true` **only after separate webhook signature and payment tests**.

Release checks:
- GitHub Actions unit tests, lint, production build green on exact SHA.
- Apply and verify migrations against a backed-up nonproduction DB, then production under a maintenance plan.
- Seed idempotently, and confirm campaign is published and content is reviewed.
- `GET /api/health` returns HTTP 200 (it only checks configuration and DB readiness, not authentic payment settlement).
- `BASE_URL=https://<preview-host> node scripts/smoke.mjs` returns green.
- Real low-value MisticPay PIX paid to the **verified legitimate account**, verify code and QR, webhook, payment status, admin view and single receipt.
- Stripe test-mode MB WAY checkout; events `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`.
- Duplicate/replay, expired/refunded cases, manual PIX confirmation with independent proof of beneficiary receipt.
- Test admin login, edits, material publication, desktop/mobile, payment return pages.
- Stage production deployment, smoke-test, promote verified build and keep rollback record.

## Important limitations
- A passed CI build does not establish a verified database migration, real provider callback or guaranteed donation capture.
- Public domain was not externally reachable from the available browsing tool. Validate DNS, TLS, redirects and deployment aliases in Vercel.
- Prisma's fallback for older DB schemas is a migration debt, especially for multi-campaign content. Release only against fully migrated schema.
- Digital delivery is not complete; do not promise the Pack Media yet.
- Launch requires campaign owner approval of recipient accounts, visible text, legal disclosures and privacy information.
