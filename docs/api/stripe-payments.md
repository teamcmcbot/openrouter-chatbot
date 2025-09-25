# Stripe Payments API

This document describes the MVP backend endpoints for Stripe billing. UI flows will call these endpoints and redirect the user to Stripe as needed.

## Auth and Rate Limiting

- All endpoints except the webhook are protected with the standard auth middleware.
- Use tiered rate limiting Tier C for CRUD-style endpoints. The webhook is not rate limited.

## Endpoints

### POST /api/stripe/checkout-session

Creates a Stripe Checkout session for subscription purchase.

- Auth: Protected
- Rate limit: Tier C
- Body:
  - plan: "pro" | "enterprise" (required)
  - trialDays: number (optional)
  - returnPathSuccess: string (optional)
  - returnPathCancel: string (optional)
- Response: { url: string }

### POST /api/stripe/customer-portal

Creates a Billing Portal session for plan changes, payment methods, and cancellation.

- Auth: Protected
- Rate limit: Tier C
- Body:
  - returnPath: string (optional; default "/account/subscription")
- Response: { url: string }

Note: Ensure the Stripe Billing Portal is configured in Test mode and includes your Pro/Enterprise prices to show the "Change plan" option.

### GET /api/stripe/subscription

Returns the current user's subscription snapshot consolidated from the database.

- Auth: Protected
- Rate limit: Tier C
- Response:
  - tier: "free" | "pro" | "enterprise"
  - status: string (e.g., active, trialing, inactive)
  - periodStart: ISO8601 or null
  - periodEnd: ISO8601 or null
  - cancelAtPeriodEnd: boolean
  - lastUpdated: ISO8601
  - stripeCustomerId: string | null
  - stripeSubscriptionId: string | null

### POST /api/stripe/webhook

Stripe webhook handler. Validates signature with STRIPE_WEBHOOK_SECRET and processes the following events:

- checkout.session.completed
- customer.subscription.created/updated/deleted
- invoice.payment_succeeded / invoice.payment_failed

Writes to:

- profiles (tier/status + updated_at)
- subscriptions
- payment_history
- stripe_events (idempotency)

Note: Do not apply auth or rate limiting to the webhook. Use a raw body in Next.js for signature verification.

### (Optional) POST /api/stripe/cancel-subscription

Not required for MVP because the Billing Portal can perform cancellations. Keep this endpoint disabled or behind admin/testing.

## Environment Variables

- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- STRIPE_PRO_PRICE_ID
- STRIPE_ENTERPRISE_PRICE_ID
- NEXT_PUBLIC_APP_URL
- STRIPE_SUCCESS_URL (optional override)
- STRIPE_CANCEL_URL (optional override)

## Testing

1. Create a checkout session
   - POST /api/stripe/checkout-session with plan="pro"
   - Follow the returned URL, use any Stripe test card (e.g., 4242 4242 4242 4242)
2. Verify webhooks
   - Run the Stripe CLI to forward webhooks to /api/stripe/webhook
   - Confirm DB updated: profiles.tier/status and subscriptions row
3. Customer portal
   - POST /api/stripe/customer-portal
   - Change plan or cancel; verify events and DB state
4. Read state
   - GET /api/stripe/subscription
   - Confirm periodStart/End and cancelAtPeriodEnd reflect the latest subscription

## Data Model

Tables: subscriptions, payment_history, stripe_events.
Profiles: adds stripe_customer_id, subscription_status, subscription_updated_at, trial_ends_at.

RLS: End users can SELECT their own subscriptions/payment_history; writes occur via service role from webhook.

## Notes

- The webhook implementation is idempotent (stores event IDs in stripe_events).
- Period dates fall back to subscription item fields when top-level fields are missing.
- Portal misconfiguration in Test mode returns a clear 400 with guidance.
