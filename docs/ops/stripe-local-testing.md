# Stripe local testing guide

This guide helps you run Stripe flows locally with test mode and the Stripe CLI.

Prereqs:

- Stripe account (test mode)
- Stripe CLI installed and logged in
- App running locally (e.g., http://localhost:3000)

1. Environment setup (.env.local)

Set mandatory vars (test keys) and price IDs:

NEXT*PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test*...
NEXT*PUBLIC_STRIPE_DASHBOARD_MODE=test
STRIPE*SECRET_KEY=sk_test*...
STRIPE*WEBHOOK_SECRET=whsec*... # Will be set by CLI listen output
NEXT*PUBLIC_APP_URL=http://localhost:3000
STRIPE_SUCCESS_URL=/account/subscription?success=true
STRIPE_CANCEL_URL=/account/subscription?canceled=true
STRIPE_PRO_PRICE_ID=price*...
STRIPE*ENTERPRISE_PRICE_ID=price\*...

# Optional: newer API for better portal deep-links

STRIPE_API_VERSION=2024-06-20

Notes:

- You can override return paths per-request by including returnPathSuccess/returnPathCancel/returnPath in the request body for start-subscription-flow or customer-portal.

2. Start the app

Run the dev server in another terminal.

3. Start Stripe CLI webhooks

stripe listen \
 --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.payment_succeeded,invoice.payment_failed \
 --forward-to http://localhost:3000/api/stripe/webhook

Copy the displayed whsec\_... into STRIPE_WEBHOOK_SECRET, then restart the dev server.

4. Exercise the flows

- Checkout (Upgrade/Switch Plan):

  - Go to /account/subscription
  - Pick a plan (Pro or Enterprise) → Continue checkout
  - Complete payment with a test card (e.g., 4242 4242 4242 4242)
  - You’ll return to /account/subscription?success=true
  - Expected: toast shows success; models refresh; tier/status update after short poll

- Billing Portal:

  - Click Manage billing (requires stripeCustomerId)
  - Update payment method or plan
  - Return path should include billing_updated=1
  - Expected: toast shows billing updated; models refresh

- Cancel / Undo cancel:
  - Click Cancel subscription → confirm
  - You’ll see action=cancel marker and a toast
  - Click Don’t cancel subscription to undo → action=undo_cancel toast

5. Useful Stripe CLI triggers (optional)

# Create a new invoice and mark it paid

stripe trigger invoice.payment_succeeded

# Simulate a failed payment

stripe trigger invoice.payment_failed

# Re-send subscription updated

stripe trigger customer.subscription.updated

6. Troubleshooting

- Webhook 400: ensure STRIPE_WEBHOOK_SECRET matches current `stripe listen` output; server must use raw body for verification.
- Returned with success/billing_updated but UI didn’t change: wait a few seconds; the page polls /api/stripe/subscription and refreshes /api/models; refocus window to trigger another fetch.
- Toasts showed once then disappeared: this is expected; URL markers are stripped after showing toasts to avoid duplicates.
