# Stripe Integration

This document explains how Stripe is integrated into the OpenRouter Chatbot app: architecture, endpoints, database, environment, and local testing. It reflects the current implementation on the `feature/stripe-payment` branch.

## Overview

- Billing model: subscription tiers — Free, Pro ($5/month), Enterprise ($15/month)
- Frontend: Next.js App Router (server + client components)
- Backend: Next.js API routes under `src/app/api/stripe/*`
- Auth: Supabase (cookies or Authorization header) via standardized middleware
- DB: Supabase/Postgres tables for subscriptions, payment history, and idempotent event log
- Billing UX: Checkout for purchase/upgrade; Billing Portal for plan changes, payment methods, invoices

## Architecture

1. User initiates upgrade from `/account/subscription`.
2. POST `/api/stripe/checkout-session` creates a Checkout session and returns a redirect URL.
3. After payment, Stripe redirects back to `/account/subscription?success=true`.
4. Stripe webhooks call `/api/stripe/webhook` (server-to-server) with verified signatures; handlers upsert DB and update the user's subscription tier/status.
5. The UI polls `/api/stripe/subscription` after return to reflect the updated tier quickly (webhook remains the source of truth).
6. Manage billing uses POST `/api/stripe/customer-portal` to open Stripe Billing Portal.

## Endpoints and protection

All protected endpoints use the shared auth + tiered rate-limiting middleware. Do not add manual auth checks.

- POST `/api/stripe/checkout-session` — Protected + Tier C

  - Body: `{ plan: 'pro'|'enterprise', trialDays?: number, returnPathSuccess?: string, returnPathCancel?: string }`
  - Response: `{ url: string }`
  - Behavior: Ensures a Stripe Customer exists; creates a subscription Checkout session using `STRIPE_PRO_PRICE_ID` or `STRIPE_ENTERPRISE_PRICE_ID`; success/cancel URLs default to env.

- POST `/api/stripe/customer-portal` — Protected + Tier C

  - Body: `{ returnPath?: string }`
  - Response: `{ url: string }`
  - Behavior: Creates a Billing Portal session for existing customers.

- GET `/api/stripe/subscription` — Protected + Tier C

  - Response: `{ tier, status, periodStart, periodEnd, cancelAtPeriodEnd, lastUpdated, stripeCustomerId, stripeSubscriptionId }`
  - Behavior: Reads from DB only; no live Stripe calls.

- POST `/api/stripe/webhook` — Public (Stripe only)
  - Verifies signature with `STRIPE_WEBHOOK_SECRET` using the raw request body.
  - Handles events: `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.payment_succeeded|failed`.
  - Idempotent: event IDs recorded to prevent duplicate writes.

Optional (not required for MVP):

- POST `/api/stripe/cancel-subscription` — Protected + Tier C; sets `cancel_at_period_end=true`.
- POST `/api/stripe/change-plan` — Protected + Tier C; programmatic change without the portal.

## Database schema (supabase)

Tables (canonical DDL under `database/schema/`):

- `subscriptions`
  - `user_id`, `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`
  - `status` (active|canceled|past_due|unpaid|trialing)
  - `current_period_start`, `current_period_end`, `cancel_at_period_end`, `canceled_at`
  - Timestamps: `created_at`, `updated_at`
- `payment_history`
  - `user_id`, `stripe_invoice_id`, `stripe_payment_intent_id`
  - `amount`, `currency`, `status`, `description`, `created_at`
- `stripe_events` (idempotency)
  - `id` (Stripe event id), `created_at`
- `user_profiles` (existing)
  - extended with `stripe_customer_id`, `subscription_status`, `subscription_updated_at`, `trial_ends_at`

Notes:

- Unique constraints on `stripe_customer_id` and `stripe_subscription_id`.
- `user_profiles.subscription_tier` is authoritative for gating; updated by webhook.

## Webhook mapping (idempotent)

- `checkout.session.completed`
  - If subscription checkout: link `stripe_customer_id` to profile if missing; upsert `subscriptions` with price/status/period; set `cancel_at_period_end=false`.
  - Update profile: `subscription_status='active'`; derive `subscription_tier` from price id mapping; set `subscription_updated_at=now()`.
- `customer.subscription.created|updated`
  - Upsert by `stripe_subscription_id`; update status, price id, period dates, and `cancel_at_period_end`.
  - Sync `user_profiles.subscription_status` and `subscription_tier`.
- `customer.subscription.deleted`
  - Mark `subscriptions.status='canceled'`, set `canceled_at`.
  - Set `user_profiles.subscription_tier='free'`, `subscription_status='canceled'`.
- `invoice.payment_succeeded`
  - Insert `payment_history` with amount/currency/invoice/status='succeeded'.
- `invoice.payment_failed`
  - Insert/update `payment_history` with status='failed'; set `subscriptions.status='past_due'` and profile status accordingly.

## Environment variables

- Client key: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- Server: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Price IDs: `STRIPE_PRO_PRICE_ID`, `STRIPE_ENTERPRISE_PRICE_ID`
- URLs: `NEXT_PUBLIC_APP_URL`, `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`
- Optional: `STRIPE_API_VERSION` — override the Stripe API version used by the server SDK. Supplying a recent version (e.g., `2024-06-20` or newer) can enable advanced Billing Portal deep-links used to preselect a target plan during plan changes.

Example (`.env.local`):

```bash
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
STRIPE_SUCCESS_URL=/account/subscription?success=true
STRIPE_CANCEL_URL=/account/subscription?canceled=true
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ENTERPRISE_PRICE_ID=price_...
# Optional: set to a recent API version to improve portal preselection compatibility
STRIPE_API_VERSION=2024-06-20
```

## Subscription UI behavior

- Page: `/account/subscription` shows current plan header (label, price/mo, status pill, renewal date and countdown, Manage billing button) and a "Limits & features" section.
- Plan selection cards show features, limits, and prices; CTA launches checkout.
- After returning from Checkout or Portal, the page detects markers (`success`, `billing_updated`) and triggers a short backoff poll of `/api/stripe/subscription` until the webhook updates land.

## Sign-in redirect behavior (subscription flow)

- Canonical parameter: `returnTo` (relative path only). Example: `/auth/signin?returnTo=%2Faccount%2Fsubscription`.
- Fallback cookie: `post_sign_in_redirect` (Secure, HttpOnly, SameSite=Lax, TTL≈10m) set before OAuth redirects.
- On successful auth: read `returnTo` or cookie → validate via `getSafeReturnTo()` → `router.replace(target)`; fallback `/chat`.
- OAuth provider redirects include `redirectTo=/auth/callback?returnTo=...` so the app can restore the intended destination.

## Local testing (Stripe Test Mode + CLI)

1. Install Stripe CLI and log in.
2. Run the app locally.
3. `stripe listen --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.payment_succeeded,invoice.payment_failed --forward-to http://localhost:3000/api/stripe/webhook`.
4. Create a Checkout Session with the Pro or Enterprise price and complete payment using test cards.
5. Watch webhook events; confirm `/api/stripe/subscription` reflects the new tier.
6. Trigger additional events with `stripe trigger ...` for lifecycle testing.

## Security and logging

- Webhook uses raw body verification and rejects invalid signatures.
- All server logs use `lib/utils/logger.ts`; avoid logging PII or raw Stripe payloads.
- Protected routes use standardized middleware and tiered rate limiting (Tier C for billing CRUD).

## Troubleshooting

- 400 webhook signature error: ensure `whsec_...` matches the currently running `stripe listen` and raw body is used.
- No webhooks locally: verify Stripe CLI is running and the `--forward-to` URL is correct.
- Redirect markers seen but no UI change: webhook may be delayed; the client will retry polling briefly and also on window focus.
- Billing Portal shows both plans but doesn't preselect the chosen plan: your Stripe account/API version may not support advanced deep-links. The app attempts a sequence of portal flows: advanced (items + proration), items-only, minimal, then plain portal. Setting `STRIPE_API_VERSION` to a newer version can help. Ensure your Portal settings allow customers to switch products.

## Future enhancements

- In-app plan change and cancellation flows (bypass portal)
- Billing history UI bound to `payment_history`
- Cron-based Stripe reconciliation and grace-period downgrades
- SSE/WebSocket push for subscription updates
