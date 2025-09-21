# Stripe Payment Integration Analysis

## Overview

This document outlines the implementation plan for integrating Stripe payment processing into the OpenRouter Chatbot application to support subscription tiers: Free, Pro ($5/month), and Enterprise ($15/month).

## 1. Stripe Account Setup Guide (First-Time Setup)

### Initial Setup Steps

1. **Create Stripe Account**

   - Go to https://stripe.com and click "Start now"
   - Provide business email and create password
   - Complete business profile (can use individual/sole proprietorship initially)
   - Verify email address

2. **Dashboard Configuration**

   - Navigate to Stripe Dashboard
   - Complete identity verification (required for live payments)
   - Set up banking details for payouts
   - Configure tax settings if applicable

3. **Development Environment**

   - Switch to "Test mode" (toggle in dashboard header)
   - Obtain API keys from Dashboard > Developers > API keys:
     - Publishable key (starts with `pk_test_`)
     - Secret key (starts with `sk_test_`)
   - Save these in `.env.local`:
     ```
     NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
     STRIPE_SECRET_KEY=sk_test_...
     STRIPE_WEBHOOK_SECRET=whsec_... (obtained after webhook setup)
     ```

4. **Product & Pricing Setup**

   - Go to Products tab in Stripe Dashboard
   - Create products:
     - **Pro Plan**: $5/month recurring
     - **Enterprise Plan**: $15/month recurring
   - Note the Price IDs (starts with `price_`) for each plan

5. **Webhook Configuration**
   - Dashboard > Developers > Webhooks
   - Add endpoint: `https://yourdomain.com/api/stripe/webhook`
   - Select events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
   - Copy webhook signing secret

## 2. Database Schema Changes

### New Tables

```sql
-- Subscription management table
CREATE TABLE subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT UNIQUE,
    stripe_price_id TEXT,
    status TEXT CHECK (status IN ('active', 'canceled', 'past_due', 'unpaid', 'trialing')),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment history for audit trail
CREATE TABLE payment_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_payment_intent_id TEXT UNIQUE,
    stripe_invoice_id TEXT,
    amount DECIMAL(10,2),
    currency TEXT DEFAULT 'usd',
    status TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_payment_history_user_id ON payment_history(user_id);
```

### Modifications to Existing Tables

```sql
-- Update user_profiles table
ALTER TABLE user_profiles
ADD COLUMN stripe_customer_id TEXT UNIQUE,
ADD COLUMN subscription_status TEXT DEFAULT 'inactive',
ADD COLUMN subscription_updated_at TIMESTAMPTZ,
ADD COLUMN trial_ends_at TIMESTAMPTZ;

-- Add index for quick lookups
CREATE INDEX idx_user_profiles_stripe_customer_id ON user_profiles(stripe_customer_id);
```

## 3. UI/UX Implementation Plan

### 3.1 Subscription Management Page

**Location**: `/app/account/subscription`

Components needed:

- Current plan display card
- Available plans comparison table
- Upgrade/Downgrade buttons
- Billing history section
- Cancel subscription option
- Payment method management

### 3.2 Navigation Integration

- Add "Subscription" item in user dropdown menu
- Add upgrade prompt banner for free users (dismissible)
- Show current tier badge next to username

### 3.3 Paywall Components

**Location**: `components/subscription/`

- `PlanSelector.tsx` - Plan selection interface
- `BillingHistory.tsx` - Payment history display
- `UpgradeModal.tsx` - Upgrade flow modal
- `UsageLimitBanner.tsx` - Show when approaching limits

### 3.4 Checkout Flow

1. User clicks "Upgrade" → Show plan comparison
2. Select plan → Redirect to Stripe Checkout
3. Complete payment → Return to success page
4. Webhook updates database → UI reflects new tier

## 4. API Endpoints Required

```typescript
// API Routes Structure
/api/stripe/
├── checkout-session/    # POST - Create Stripe checkout session
├── customer-portal/     # POST - Create portal session for billing management
├── webhook/            # POST - Handle Stripe webhooks
├── subscription/       # GET - Get current subscription status
└── cancel-subscription/ # POST - Cancel subscription (optional for MVP; use Billing Portal)
```

## 5. Subscription Tier Management Logic

### 5.1 Tier Upgrade/Downgrade Flow

**Free → Pro/Enterprise**

1. Create Stripe checkout session
2. User completes payment
3. Webhook updates database immediately
4. Profile tier updated in same transaction

**Pro → Enterprise**

1. Use Stripe subscription update API
2. Prorate the difference
3. Update takes effect immediately
4. Database updated via webhook

**Enterprise/Pro → Free (Cancellation)**

1. Cancel subscription via Stripe API
2. Set `cancel_at_period_end = true`
3. User retains access until period end
4. Automated downgrade at period end

### 5.2 Subscription Lifecycle Management

```typescript
// Webhook handler pseudo-code
async function handleSubscriptionUpdate(event: Stripe.Event) {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      // Update subscription table
      // Update user_profiles.subscription_tier
      // Update user_profiles.subscription_status
      break;

    case "customer.subscription.deleted":
      // Set user to 'free' tier
      // Update subscription status to 'canceled'
      // Clear subscription_tier in profile
      break;

    case "invoice.payment_failed":
      // Send email notification
      // Set status to 'past_due'
      // Optionally restrict features
      break;
  }
}
```

## 6. Scheduled Jobs Requirements

### 6.1 Daily Subscription Check (Cron Job)

**Purpose**: Ensure database consistency with Stripe

```typescript
// Run daily at 2 AM UTC
async function syncSubscriptions() {
  // 1. Fetch all active subscriptions from database
  // 2. Verify each with Stripe API
  // 3. Update any mismatches
  // 4. Handle expired trials
  // 5. Process pending cancellations
}
```

### 6.2 Grace Period Handler

**Purpose**: Handle failed payments with grace period

```typescript
// Run every 6 hours
async function handleGracePeriods() {
  // 1. Find subscriptions in 'past_due' status
  // 2. Check if grace period expired (3 days)
  // 3. Downgrade to free if payment still failed
  // 4. Send final notification email
}
```

## 7. Implementation Phases

### Phase 1: Foundation (Week 1)

- [x] Set up Stripe account and products
- [x] Implement database schema changes
- [x] Create basic API endpoints
- [x] Set up webhook handling

### Phase 2: UI Components (Week 2)

- [x] Build subscription management page
- [x] Create plan selector component
- [x] Implement checkout flow
- [ ] Add billing history view

#### 2.1 Sign-in redirect behavior (subscription flow)

Problem: When an unauthenticated user clicks an Upgrade CTA and lands on `/account/subscription`, they currently see a prompt to sign in. Historically, successful sign-in redirected to `/chat`. We need a safe, flexible post-sign-in redirect that can send users back to the page that initiated auth (e.g., `/account/subscription`).

Approach: Add a first-class “return to” mechanism that works for email/password, OTP/magic link, and OAuth provider flows.

- Canonical parameter: `returnTo` (relative path). Example: `/auth/signin?returnTo=%2Faccount%2Fsubscription`.
- Fallback mechanism: A short‑lived cookie `post_sign_in_redirect` set before starting the auth flow (used when `returnTo` cannot be propagated through provider redirects reliably).
- Success logic: On auth success, read `returnTo` (query) OR cookie; validate it; perform a client-side `router.replace(returnTo)`; fallback to existing default (`/chat`) when missing/invalid.

Safety rules:

- Only allow internal relative paths beginning with `/`.
- Disallow absolute URLs and any value containing `://`, `\\`, or control characters.
- Cap length (e.g., 512 chars) and strip whitespace.
- Preserve query and hash if present (e.g., `/account/subscription?src=upgrade#billing`).

Implementation tasks (checklist):

- [x] Add `returnTo` plumbing to all Sign In entry points:
  - Header `Sign In` button should link to `/auth/signin?returnTo=<encoded pathname+search+hash>` when available.
  - Any modal/in-page prompt on `/account/subscription` should set the cookie `post_sign_in_redirect` with the same target as a backup.
- [x] Create or confirm canonical routes: `/auth/signin` (entry point) and `/auth/callback` (OAuth callback handler).
- [x] Create a shared util `getSafeReturnTo(input: string | null): string | null` that enforces the safety rules above.
- [x] Extend the sign-in success path (existing auth initializer or `useAuthSuccessToast`) to:
  - Read `returnTo` from the current URL first; else read `post_sign_in_redirect` cookie.
  - Use `getSafeReturnTo` and navigate (prefer `router.replace`) to that page; else navigate to `/chat`.
  - Clear the cookie after use.
- [x] For OAuth-based flows (`supabase.auth.signInWithOAuth`), set the cookie before triggering the provider redirect so the value survives the round trip.
- [x] For OAuth-based flows, pass `options.redirectTo = ${origin}/auth/callback?returnTo=<encoded target>` so the callback can restore the intended destination (cookie remains as fallback).
- [ ] For email OTP/magic link, persist `returnTo` similarly; if using `redirectTo` in Supabase, include the `returnTo` in your callback URL’s query so the app can read it on return.
- [ ] Add unit tests for `getSafeReturnTo` (valid/invalid inputs) and a minimal integration test for “arrive on `/account/subscription` while signed out → sign in → redirected back”.
- [ ] Update copy on `/account/subscription` for anonymous users to clarify: “Please sign in to manage your subscription. You’ll return here after signing in.”

Edge cases to handle:

- If `returnTo` is `/` or blank → fallback to `/chat` (existing default behavior).
- If a user opens the sign-in page directly (no `returnTo`, no cookie) → fallback to `/chat`.
- If the stored target is no longer accessible after sign-in (e.g., route removed) → fallback to `/account/subscription` for subscription-initiated flows, else `/chat`.
- If a user signs in on a deep page (e.g., `/settings#billing`), preserve the hash/query when redirecting.

User test steps (manual):

1. Anonymous → visit `/account/subscription`. Expect a sign-in prompt.
2. Click `Sign In`. Authenticate successfully.
3. After auth, expect to land back on `/account/subscription` (URL preserved). No page flicker to `/chat`.
4. Repeat from home `/` without any `returnTo`. After auth, expect to land on `/chat` (default).
5. Try a crafted external `returnTo=https://evil.com` directly. Expect to be ignored and fallback to `/chat`.

Assumptions & notes:

- Root auth provider is Zustand-based; legacy `contexts/AuthContext` is not globally mounted. The redirect logic will live in our existing auth initializer/success hook and will not depend on the legacy context.
- We will not modify server middleware for this; the client-side redirect on successful sign-in is sufficient for the UX requirement.
- No changes to API routes are required.

Decisions (approved):

1. Canonical sign-in entry point: Use a dedicated `/auth/signin` page. Any modal flows should route through `/auth/signin?returnTo=...` to centralize behavior.
2. OAuth callback handling: Use both query and cookie. Pass `redirectTo` to `/auth/callback?returnTo=...` and also set `post_sign_in_redirect` before provider redirect as a fallback.
3. Default fallback: Keep `/chat` when neither `returnTo` nor cookie is present or valid.
4. Preservation of query/hash: Preserve full path + query + hash after safety validation (relative path only, length cap, reject `://` and backslashes). We can optionally strip marketing params later, not required for MVP.
5. Additional targets: Support any internal path. Prioritize tests/docs for `/account/subscription`, `/chat`, and `/settings` (including `#billing`).

Security and reliability:

- Cookie TTL 10 minutes; `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`.
- Prefer `router.replace` over `push` to avoid back-button loops.
- Clear the cookie after successful redirect; log minimal, redacted info on invalid `returnTo` and fall back to `/chat`.

### Phase 3: Integration (Week 3)

- [ ] Connect Stripe Checkout
- [x] Implement webhook processors
- [ ] Add subscription status to auth context
- [ ] Update rate limiting based on tier

### Phase 4: Polish & Testing (Week 4)

- [ ] Add error handling and retry logic
- [ ] Implement scheduled jobs
- [ ] Test upgrade/downgrade scenarios
- [ ] Add monitoring and alerts

## 8. Security Considerations

1. **Webhook Validation**: Always verify webhook signatures
2. **API Key Storage**: Use environment variables, never commit keys
3. **PCI Compliance**: Let Stripe handle card data (use Checkout/Elements)
4. **Rate Limiting**: Implement on payment endpoints
5. **Idempotency**: Use idempotency keys for payment operations

## 9. Testing Strategy

### Test Scenarios

1. New user subscription flow
2. Upgrade from Pro to Enterprise
3. Downgrade from Enterprise to Pro
4. Subscription cancellation
5. Failed payment handling
6. Webhook retry scenarios
7. Concurrent subscription updates

### Test Card Numbers (Stripe Test Mode)

- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Requires auth: `4000 0025 0000 3155`

## 10. Monitoring & Analytics

### Key Metrics to Track

- Monthly Recurring Revenue (MRR)
- Churn rate
- Upgrade/downgrade rates
- Failed payment recovery rate
- Average revenue per user (ARPU)

### Database Queries for Insights

```sql
-- Active subscriptions by tier
SELECT subscription_tier, COUNT(*)
FROM user_profiles
WHERE subscription_tier != 'free'
GROUP BY subscription_tier;

-- MRR calculation
SELECT SUM(
  CASE
    WHEN subscription_tier = 'pro' THEN 5
    WHEN subscription_tier = 'enterprise' THEN 15
    ELSE 0
  END
) as mrr
FROM user_profiles
WHERE subscription_status = 'active';
```

## 11. Environment Variables Required

```bash
# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ENTERPRISE_PRICE_ID=price_...

# URLs
NEXT_PUBLIC_APP_URL=https://yourdomain.com
STRIPE_SUCCESS_URL=/account/subscription?success=true
STRIPE_CANCEL_URL=/account/subscription?canceled=true
```

## 12. Dependencies to Install

```json
{
  "dependencies": {
    "@stripe/stripe-js": "^2.x",
    "stripe": "^14.x"
  }
}
```

## 13. Local Testing (Stripe Test mode + Stripe CLI)

Follow this to test the full subscription flow locally (Checkout → Webhooks → DB updates) without real charges.

### Prerequisites

- Stripe account (Test mode).
- Products and recurring prices created (Pro $5/mo, Enterprise $15/mo) and their Price IDs.
- Env in `.env.local` (restart dev server after editing):

  ```bash
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
  STRIPE_SECRET_KEY=sk_test_...
  # Set after step 3 below
  STRIPE_WEBHOOK_SECRET=whsec_...

  NEXT_PUBLIC_APP_URL=http://localhost:3000
  STRIPE_SUCCESS_URL=/account/subscription?success=true
  STRIPE_CANCEL_URL=/account/subscription?canceled=true

  STRIPE_PRO_PRICE_ID=price_...
  STRIPE_ENTERPRISE_PRICE_ID=price_...
  ```

### Steps

1. Install Stripe CLI and log in (macOS):

```zsh
brew install stripe/stripe-cli/stripe
stripe login
```

2. Start the app locally:

```zsh
npm run dev
```

3. Forward Stripe webhooks to your local endpoint and capture signing secret:

```zsh
stripe listen \
  --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.payment_succeeded,invoice.payment_failed \
  --forward-to http://localhost:3000/api/stripe/webhook
```

- Copy the printed `whsec_...` and set `STRIPE_WEBHOOK_SECRET` in `.env.local`, then restart `npm run dev`.

4. Create a Checkout Session (Test mode) for Pro (or Enterprise):

- Via Stripe CLI (fastest):

  ```zsh
  stripe checkout sessions create \
   --mode subscription \
   --success_url "http://localhost:3000/account/subscription?success=true" \
   --cancel_url "http://localhost:3000/account/subscription?canceled=true" \
   --line_items[0][price]="$STRIPE_PRO_PRICE_ID" \
   --line_items[0][quantity]=1
  ```

  Open the printed URL to pay.

- Or via cURL:
  ```zsh
  curl https://api.stripe.com/v1/checkout/sessions \
   -u "$STRIPE_SECRET_KEY:" \
   -d mode=subscription \
   -d "line_items[0][price]=$STRIPE_PRO_PRICE_ID" \
   -d "line_items[0][quantity]=1" \
   -d success_url="http://localhost:3000/account/subscription?success=true" \
   -d cancel_url="http://localhost:3000/account/subscription?canceled=true"
  ```

5. Pay with a test card in the Checkout page:

- Success: `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP.
- CLI should display forwarded events hitting `/api/stripe/webhook`.

6. Simulate additional events (no UI required) while refining webhooks:

```zsh
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.payment_succeeded
stripe trigger invoice.payment_failed
```

7. Test upgrades/downgrades:

- After creating a Pro subscription, go to Stripe Dashboard → Customers → the test customer → Subscriptions.
- Change price to Enterprise (`$STRIPE_ENTERPRISE_PRICE_ID`) with proration on; observe webhook events and app tier update.
- For cancellation, set “Cancel at period end” and verify DB/UI reflects `cancel_at_period_end` and planned downgrade.

### Implementation notes (Next.js + Stripe)

- Webhook verification: read raw body and verify signature with `STRIPE_WEBHOOK_SECRET`. Don’t JSON.parse before verification.
- Next.js App Router example (from Stripe docs, adapted):

  ```ts
  // app/api/stripe/webhook/route.ts
  import { NextResponse } from "next/server";
  import { headers } from "next/headers";
  import Stripe from "stripe";

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2024-06-20",
  });

  export async function POST(req: Request) {
    let event: Stripe.Event;
    try {
      const rawBody = await req.text();
      const signature = (await headers()).get("stripe-signature");
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature!,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      return NextResponse.json(
        { message: `Webhook Error: ${err.message}` },
        { status: 400 }
      );
    }

    switch (event.type) {
      case "checkout.session.completed":
        // handle checkout completion
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "invoice.payment_succeeded":
      case "invoice.payment_failed":
        // handle subscription lifecycle
        break;
      default:
        // unhandled event types
        break;
    }
    return NextResponse.json({ received: true }, { status: 200 });
  }
  ```

- Idempotency: Stripe retries webhooks; make handlers idempotent when writing to DB.
- Security: never expose `STRIPE_SECRET_KEY` to the client; use server routes only.

### Troubleshooting

- 400 signature verification error → ensure the current `whsec_...` from the running `stripe listen` is in `.env.local` and the raw body is used.
- No webhooks arriving → confirm Stripe CLI is running, and `--forward-to` matches your local route (`/api/stripe/webhook`).
- Success/cancel URLs not redirecting locally → ensure they use `http://localhost:3000/...` in Test mode.
- Env changes not applied → restart `npm run dev` after updating `.env.local`.

### Useful Stripe CLI triggers (expanded)

```zsh
# Checkout and Subscription lifecycle
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger customer.subscription.trial_will_end

# Invoicing and payments
stripe trigger invoice.payment_succeeded
stripe trigger invoice.payment_failed
```

## Next Steps

1. Review and approve this analysis
2. Set up Stripe account in test mode
3. Create database migration scripts
4. Begin Phase 1 implementation
5. Schedule weekly progress reviews

## Questions for Clarification

1. Should we offer annual billing with a discount?
2. Do we want to offer a free trial period?
3. Should Enterprise tier have additional features beyond rate limits?
4. Do we need team/organization billing support?
5. Should we implement usage-based billing for token consumption?

---

This document should be reviewed and updated as implementation progresses. Consider creating separate specs for each phase in `specs` directory.

---

## 14. API-first Implementation Plan (detailed)

We will implement and verify the backend API and webhooks end-to-end with Stripe Sandbox before wiring any UI. This confirms subscribe, cancel, and upgrade/downgrade behavior strictly at the API layer.

### 14.1 Endpoint overview and contracts (Next.js App Router)

- All protected routes must use standardized auth middleware and tiered rate limiting. Do not implement manual auth.
  - Example: withProtectedAuth(withTieredRateLimit(handler, { tier: "tierC" }))
- Recommended rate limit tier: Tier C for CRUD/billing endpoints. Do not rate-limit the webhook.

Endpoints:

1. POST /api/stripe/checkout-session

   - Auth: Protected + TierC rate limiting
   - Purpose: Create a Stripe Checkout session for subscription signup/upgrade.
   - Request JSON:
     {
     "plan": "pro" | "enterprise",
     "trialDays"?: number,
     "returnPathSuccess"?: string, // default: STRIPE_SUCCESS_URL
     "returnPathCancel"?: string // default: STRIPE_CANCEL_URL
     }
   - Response JSON: { "url": string }
   - Behavior:
     - Ensure a Stripe Customer exists for the user (create/reuse via user_profiles.stripe_customer_id).
     - Use STRIPE_PRO_PRICE_ID / STRIPE_ENTERPRISE_PRICE_ID.
     - mode=subscription; success_url/cancel_url = NEXT_PUBLIC_APP_URL + path.
     - Use an idempotency key (e.g., requestId) to avoid duplicates.

2. POST /api/stripe/customer-portal

   - Auth: Protected + TierC
   - Purpose: Create a Stripe Billing Portal session for users to manage plan changes, cancellations, payment methods, and invoices.
   - Request JSON: { "returnPath"?: string }
   - Response JSON: { "url": string }
   - Behavior: Requires existing stripe_customer_id.

3. GET /api/stripe/subscription

   - Auth: Protected + TierC
   - Purpose: Return the current user’s subscription state from our DB (no live Stripe call).
   - Response JSON (example):
     {
     "tier": "free" | "pro" | "enterprise",
     "status": "inactive" | "active" | "past_due" | "unpaid" | "canceled" | "trialing",
     "periodStart": string | null,
     "periodEnd": string | null,
     "cancelAtPeriodEnd": boolean,
     "lastUpdated": string,
     "stripeCustomerId": string | null,
     "stripeSubscriptionId": string | null
     }

4. (Optional) POST /api/stripe/cancel-subscription

   - Auth: Protected + TierC
   - Purpose: Set cancel_at_period_end = true via Stripe API. DB is updated by webhook.
   - Request JSON: { }
   - Response JSON: { "ok": true }
   - Behavior: If no active subscription, return 400.

- Note: Not required for MVP since cancellations can be performed in the Stripe Billing Portal. Keep for in‑app cancel UX or API consumers.

5. (Optional v1) POST /api/stripe/change-plan

   - Auth: Protected + TierC
   - Purpose: Programmatic plan change w/o portal.
   - Request JSON: { "plan": "pro" | "enterprise", "prorate"?: boolean }
   - Response JSON: { "ok": true }

6. POST /api/stripe/webhook
   - Auth: none (Stripe only). No rate limiting.
   - Security: Verify signature with STRIPE_WEBHOOK_SECRET using the raw body (no JSON.parse before verify).
   - Response: 200 { received: true } on success; 400 on signature error.
   - Events: checkout.session.completed, customer.subscription.created|updated|deleted, invoice.payment_succeeded|failed.
   - Idempotency: Store handled event IDs to avoid duplicate writes.

### 14.2 Webhook event → DB mapping

Idempotent updates on verified events:

- checkout.session.completed

  - If session.mode == 'subscription':
    - Retrieve subscription and customer from session.
    - Link stripe_customer_id to user_profiles if missing.
    - Upsert subscriptions row: status, stripe_subscription_id, stripe_price_id, current_period_start/end, cancel_at_period_end=false.
    - Update user_profiles: subscription_status='active', subscription_tier from price id ('pro'|'enterprise'), subscription_updated_at=now().

- customer.subscription.created / updated

  - Upsert by stripe_subscription_id.
  - Update user_profiles.subscription_status based on Stripe status; set subscription_tier from price id mapping; set cancel_at_period_end.

- customer.subscription.deleted

  - Mark subscriptions.status='canceled'; set canceled_at.
  - Update user_profiles: subscription_status='canceled', subscription_tier='free'.

- invoice.payment_succeeded

  - Insert payment_history (amount, currency, stripe_invoice_id, status='succeeded').

- invoice.payment_failed
  - Insert/Update payment_history with status='failed'.
  - Update subscriptions.status='past_due' and user_profiles.subscription_status='past_due'.

Idempotency helper table:

```sql
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 14.3 Data model notes

- Keep unique constraints on stripe_customer_id and stripe_subscription_id.
- user_profiles.subscription_tier is authoritative for feature gating; derive from subscriptions on webhook updates.
- Consider a view joining user_profiles + subscriptions for UI reads.

### 14.4 Logging, errors, and security

- Use lib/utils/logger.ts for structured logs; include requestId and route; no console.\* in app code.
- Do not log PII or raw Stripe payloads; log event types and small, redacted context.
- Webhook must use req.text() for raw body; verify signature before parsing.

### 14.5 API-only test plan (no UI)

Prereqs: Stripe CLI listening (whsec set), app running.

1. Subscribe

   - POST /api/stripe/checkout-session { plan: "pro" } → open URL → pay with 4242.
   - Verify webhook events and GET /api/stripe/subscription shows Pro active.

2. Upgrade/Downgrade via Billing Portal

   - POST /api/stripe/customer-portal {} → open URL → change plan → webhooks update DB → GET reflects new tier.

3. Cancel

   - POST /api/stripe/cancel-subscription {} → Stripe sets cancel_at_period_end → webhook updates DB → GET shows cancelAtPeriodEnd.

4. Failure path
   - stripe trigger invoice.payment_failed → DB shows past_due in GET.

Success: All transitions visible via GET /api/stripe/subscription without any frontend.

## 15. UI Plan and Flow Decisions

Answers to the questions:

- Planning order: Yes, API-first. We will implement endpoints + webhooks, test via CLI/curl, then build the UI.

- Where does tier selection happen?

  - In our app. The Subscription page (/account/subscription) will present Free/Pro/Enterprise, features, and Upgrade buttons.
  - Clicking Upgrade calls POST /api/stripe/checkout-session with the chosen plan and redirects to the Checkout URL. Stripe Checkout handles payment; we pass the price id.

- How do users manage billing?

  - MVP: Stripe Billing Portal. A "Manage billing" button hits POST /api/stripe/customer-portal and redirects to portal for plan changes, cancellation, payment methods, and invoices. Our DB syncs via webhooks.
  - Optional later: in-app change plan/cancel flows using endpoints.

- What UI elements will we build?
  - /account/subscription page showing:
    - Current tier and status (active/past_due/canceled/trialing)
    - Renewal date (periodEnd), cancelAtPeriodEnd flag
    - Upgrade buttons (when eligible)
    - Manage billing (opens portal)
    - Basic billing history table (from payment_history) in later phase
  - MessageInput gating "Upgrade" buttons will navigate to /account/subscription (no in-line picker for MVP).

Navigation & UX:

- Add Subscription to account menu; success/cancel deep links via STRIPE_SUCCESS_URL/STRIPE_CANCEL_URL.
- Anonymous users attempting to upgrade are automatically routed to the canonical sign-in page with a safe return target: `/auth/signin?returnTo=%2Faccount%2Fsubscription%3Fsrc%3Dupgrade%26plan%3D<plan>`. After successful authentication, they are returned to `/account/subscription` with original query/hash preserved. Unsafe or missing return targets fall back to `/chat`.

## 16. Detailed task breakdown (API-first → UI)

Phase 1A: API + Webhook

- [x] Create tables: subscriptions, payment_history, stripe_events (idempotency)
- [x] Implement POST /api/stripe/checkout-session (Protected, Tier C)
- [x] Implement POST /api/stripe/customer-portal (Protected, Tier C)
- [x] Implement GET /api/stripe/subscription (Protected, Tier C)
- [x] Implement POST /api/stripe/cancel-subscription (Protected, Tier C) — optional for MVP
- [x] Implement POST /api/stripe/webhook (signature verify + handlers)
- [x] Minimal tests for endpoints (mock Stripe) and webhook idempotency
- [ ] API-only verification: subscribe, upgrade/downgrade (portal), cancel, failure paths

Phase 1B: Schema + Docs — Verified (2025-09-21)

- [x] Merge patch SQL into /database/schema after approval
- [x] Add endpoint docs under /docs/api

Phase 2: UI (Subscription page)

- [x] Build /account/subscription
- [x] Wire Upgrade buttons → if unauthenticated, route to `/auth/signin?returnTo=%2Faccount%2Fsubscription%3Fsrc%3Dupgrade%26plan%3D<plan>`; if authenticated, proceed to checkout-session redirect
- [x] Add Manage billing → customer-portal
- [x] Show status, renewal date, cancelAtPeriodEnd
- [x] Handle errors/empty states

#### Post-Stripe redirect handling (instant UX)

Goal: Make the UI feel instant after users complete actions in Stripe, while still relying entirely on server-side webhooks as the source of truth.

- Redirect markers

  - Checkout: use `STRIPE_SUCCESS_URL` (e.g., `/account/subscription?success=true`).
  - Billing Portal: pass a `returnPath` when creating the session (POST `/api/stripe/customer-portal`), e.g., `/account/subscription?billing_updated=1`.

- Client behavior on landing

  - On page load, if `success=true` or `billing_updated=1` is present:
    1. Immediately fetch `GET /api/stripe/subscription` and update the UI.
    2. If the webhook hasn’t updated the DB yet, show “Updating your subscription…” and start a short backoff poll for up to ~10–20 seconds (e.g., 500ms → 1s → 2s).
    3. Stop polling once one of these is true:
       - `subscription_status` is `active` (for upgrades), or
       - `cancel_at_period_end` flips / status reflects cancellation, or
       - `subscription_tier` matches the expected plan.
  - Also refetch on window focus/visibility so returning to the tab reflects the latest state.

- State management

  - If using SWR/React Query, call `mutate`/`invalidateQueries` for the subscription key on landing and on success. If using a store, expose `refreshSubscription()`.
  - Do not write subscription state from the client; the webhook is authoritative. The client only reads from `GET /api/stripe/subscription`.

- Optional (no polling alternative)
  - Consider SSE/WebSocket later to push a “subscription.updated” event from the server after webhook processing. Not required for MVP.

Phase 3: Enhancements

- [ ] In-app change-plan (optional)
- [ ] Billing history UI (payment_history)
- [ ] Cron sync + grace period jobs (see §6)
- [ ] Observability (logger + Sentry)

## 17. Smart "Continue checkout" routing (existing vs new subscription)

Problem

- From `/account/subscription`, clicking "Continue checkout" always creates a brand‑new subscription via Checkout. If the user already has Pro (or Enterprise), this causes a duplicate subscription and does not show prorated charges.

Goal

- Use a single button that transparently routes:
  - No existing active subscription → Stripe Checkout (mode=subscription)
  - Existing active subscription → Stripe Billing Portal, prefilled to update the current subscription to the selected plan, landing on Stripe’s proration confirmation screen (as in Screenshot 3)

Approach (server decides where to send the user)

- Add one smart endpoint that branches based on the user’s current state:

  Route: POST `/api/stripe/start-subscription-flow`

  - Auth: Protected + TierC rate limit (use withProtectedAuth(withTieredRateLimit(...)))
  - Request JSON: { plan: "pro" | "enterprise", returnPath?: string }
  - Response JSON: { url: string } // client should redirect to this URL

  Server logic (pseudocode):

  ```ts
  export const POST = withProtectedAuth(
    withTieredRateLimit(
      async (req, auth) => {
        const { plan, returnPath } = await req.json();
        const priceId =
          plan === "pro"
            ? process.env.STRIPE_PRO_PRICE_ID!
            : process.env.STRIPE_ENTERPRISE_PRICE_ID!;

        // 1) Ensure stripe customer
        const customerId = await ensureStripeCustomerForUser(auth.user.id);

        // 2) Find active subscription for this customer/product
        const sub = await getActiveAppSubscription(customerId); // from our DB; avoid live API when possible

        if (!sub) {
          // New subscription → Checkout
          const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer: customerId,
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: joinAppUrl(
              returnPath ?? process.env.STRIPE_SUCCESS_URL!
            ),
            cancel_url: joinAppUrl(process.env.STRIPE_CANCEL_URL!),
            // optional niceties:
            allow_promotion_codes: true,
          });
          return NextResponse.json({ url: session.url });
        }

        // Existing subscription → Billing Portal "subscription_update" flow (shows proration)
        const portal = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: joinAppUrl(
            returnPath ?? "/account/subscription?billing_updated=1"
          ),
          flow_data: {
            type: "subscription_update",
            subscription_update: {
              subscription: sub.stripe_subscription_id,
              items: [{ price: priceId, quantity: 1 }],
              proration_behavior: "create_prorations",
            },
          },
        });
        return NextResponse.json({ url: portal.url });
      },
      { tier: "tierC" }
    )
  );
  ```

Notes and edge cases

- Multiple subscriptions: store and use the specific app subscription ID on the profile to avoid ambiguity.
- Scheduled cancellation: the Portal handles undoing `cancel_at_period_end` if the user upgrades; if you DIY via API, be sure to clear that flag.
- Trialing: upgrades typically end trial early; Portal shows the correct proration. DIY must preview via `invoices.retrieveUpcoming`.
- Past_due/unpaid: the Portal will prompt for payment and still handle the plan change.
- Quantities/seats: pass the desired `quantity` in `items` for seat-based plans.

Acceptance criteria

- Existing Pro upgrading to Enterprise lands on a Stripe confirmation page showing prorated “Amount due today.”
- Existing Enterprise downgrading to Pro can choose immediate or period‑end (Portal default behavior) and returns correctly.
- New users (no subscription) always go to Checkout and never create duplicates.
- One endpoint covers both cases; client only needs the plan key and redirects to the returned URL.

Manual test steps

1. User with no subscription → click Continue on Enterprise → redirected to Checkout; complete payment; webhook sets tier=enterprise.
2. User with active Pro → click Continue on Enterprise → redirected to Portal confirm page with proration; confirm; webhook updates tier=enterprise.
3. User with active Enterprise → click Continue on Pro → redirected to Portal update; choose immediate/period end; webhook reflects downgrade state.
4. User with cancel_at_period_end set → upgrade to Enterprise → confirm Portal flow works and clears scheduled cancellation as appropriate.

Security & rate limiting

- Use standardized middleware: `withProtectedAuth(withTieredRateLimit(handler, { tier: "tierC" }))`.
- Do not log PII or Stripe payloads; use structured logger with small context.

Recommendation

- Implement this smart endpoint and replace the current "Continue checkout" call site to hit it. Keep the existing “Manage billing” button pointing to the general Billing Portal for payment methods and invoices.

## 18. Billing Portal return experience ("Return to merchant")

Problem

- After users complete changes in the Stripe Billing Portal, Stripe shows a “Return to merchant” button and does not auto‑redirect. Some users don’t click it, causing perceived stall.

Options

1. Keep Portal and smooth the UX (recommended)

   - Open Portal in a new tab/window (via `window.open`).
   - In-app, display a lightweight "Waiting for billing changes…" banner.
   - Webhook-driven refresh: on `customer.subscription.updated|deleted` and `invoice.payment_succeeded|failed`, update DB and refetch the client state.
   - Short backoff polling on `/account/subscription` when `?billing_updated=1` is present (e.g., 0.5s → 1s → 2s for up to ~15s) until the subscription state reflects the change.
   - Use a clear `return_url`, e.g., `/account/subscription?billing_updated=1`.
   - On the landing page, if the tab was script‑opened, allow a small "Close this tab" button and optionally auto‑close via `window.close()` when permitted by the browser.

2. API-only plan changes (advanced, not required)

   - Use `subscriptions.update` with `items` → target price and `proration_behavior: create_prorations`.
   - Preview charges with `invoices.retrieveUpcoming` to show “Amount due today” in‑app.
   - When invoice requires SCA, collect and confirm payment using the Payment Element. This increases scope (payments UI, error states) but gives full redirect control.

3. Hybrid
   - Keep general management in Portal (payment methods, invoices, cancel) and use the smart routing from §17 for plan changes. This yields proration and minimal code while preserving a first‑class in‑app UX.

Acceptance criteria

- Users never feel “stuck” in the Portal: returning to `/account/subscription` shows the updated tier within a few seconds without manual refresh.
- `return_url` consistently points back to `/account/subscription` (or a supplied path) and surfaces a success message when `billing_updated=1`.
- If the Portal was opened in a new tab by the app, the landing page can safely suggest closing the tab and may auto‑close when possible.

Manual test steps

1. From Pro, click Manage billing → Update to Enterprise in Portal → click Return to merchant → app shows new tier and renewal date; no manual refresh needed.
2. From Enterprise, cancel at period end → Return to merchant → app shows `cancelAtPeriodEnd=true`.
3. Repeat both while intentionally not clicking Return; switch back to the app tab and verify the banner + webhook/polling refresh reflect the change within ~10–20s.

Trade‑offs

- Portal keeps you PCI‑scope light and handles proration, taxes, refunds, and SCA. API‑only gives full control but requires more payment UI and edge‑case handling.

Decision

- Adopt the Hybrid approach: keep Portal for management; add smart routing for plan changes; add a minimal “waiting for changes” banner and webhook‑driven refresh on the return URL.
