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
└── cancel-subscription/ # POST - Cancel subscription
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

- [ ] Set up Stripe account and products
- [ ] Implement database schema changes
- [ ] Create basic API endpoints
- [ ] Set up webhook handling

### Phase 2: UI Components (Week 2)

- [ ] Build subscription management page
- [ ] Create plan selector component
- [ ] Implement checkout flow
- [ ] Add billing history view

### Phase 3: Integration (Week 3)

- [ ] Connect Stripe Checkout
- [ ] Implement webhook processors
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
