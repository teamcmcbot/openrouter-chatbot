# Stripe Production Plan

Stripe powers subscription billing (Pro and Enterprise tiers). Because Stripe requires a public website during onboarding, you will deploy the app to Vercel **before** finalizing the account. Follow the steps below.

## 1. Timeline Overview

1. **Deploy to Vercel (Test Keys)** – Launch the app with Stripe test mode keys so Checkout works in staging.
2. **Complete Stripe Account Setup** – Provide business details, support contacts, and the public website URL (Vercel default domain is acceptable until you purchase a custom domain).
3. **Switch to Live Mode** – Generate production API keys, product IDs, and webhook signing secret.
4. **Run Live Verification Tests** – Process a $0 plan upgrade (Stripe allows $0 test) or use a real card if required by Stripe for verification.

## 2. Initial Setup in Test Mode

1. Create a Stripe account at [dashboard.stripe.com/register](https://dashboard.stripe.com/register).
2. In the dashboard, switch to **Test mode** (toggle in the left sidebar).
3. Create **Products & Prices**:
   - Product: _Pro Plan_ → Recurring price `$5/month`.
   - Product: _Enterprise Plan_ → Recurring price `$15/month`.
4. Copy the test price IDs into Vercel env vars (`STRIPE_PRO_PRICE_ID`, `STRIPE_ENTERPRISE_PRICE_ID`).
5. Use test keys (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) and a dummy webhook secret (from `stripe listen`) to validate the flow locally or on staging.
6. Deploy to Vercel using these test variables – this gives you the `https://<project>.vercel.app` URL to provide to Stripe later.

## 3. Account Verification & Business Profile

When you are ready to go live:

1. In Stripe dashboard, switch to **Live mode**.
2. Complete the business profile: legal entity, address, support email/phone, statement descriptor, and bank account for payouts.
3. For the **Website** field, you can supply the Vercel-generated domain until you purchase a custom domain. Update it later if you migrate to a branded domain.
4. Submit required identity documents (ID verification, business registration) to avoid payout delays.

## 4. Generate Live API Credentials

1. In **Developers → API keys**, create a restricted _Secret key_ for server-side use (scope it to the endpoints your app needs: Checkout Sessions, Customers, Subscriptions).
2. Copy the new key into Vercel as `STRIPE_SECRET_KEY` (Production environment).
3. Reveal the _Publishable key_ and set it as `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
4. Recreate products/prices in Live mode. (Test and live products are independent.)
   - Record live `price_...` IDs and update `STRIPE_PRO_PRICE_ID`, `STRIPE_ENTERPRISE_PRICE_ID` in Vercel.

## 5. Configure Webhooks

1. In Stripe dashboard → _Developers → Webhooks → Add endpoint_.
2. Endpoint URL: `https://<prod-domain>/api/stripe/webhook` (use the Vercel domain if custom domain not ready).
3. Select the following events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Save the webhook and copy the **Signing secret** (`whsec_...`). Add it to Vercel as `STRIPE_WEBHOOK_SECRET`.
5. Trigger a test delivery (Stripe → Send test webhook) and confirm Vercel logs show a `200` response.

## 6. Post-Live Validation

- Use Stripe’s [test cards](https://stripe.com/docs/testing) in live mode by enabling **Live mode test clock** or use a real card and immediately refund the charge.
- Confirm that Supabase `user_profiles` table updates the subscription tier after a successful checkout (check `/account/subscription`).
- Visit _Billing → Customer portal_ from the app and ensure Stripe returns the hosted portal session.
- Monitor Stripe dashboard → _Payments_ and _Customers_ to verify records appear.

## 7. Operational Considerations

- **Restricted Keys:** Create a second restricted key for CLI use or manual scripts if needed. Never use the secret key in client code.
- **Radar Rules:** Configure basic fraud detection in Stripe Radar once volume increases.
- **Dispute Handling:** Set up email alerts for disputes and add response playbooks to your support process.
- **Tax & Invoicing:** Evaluate if you need Stripe Tax or manual tax handling based on your jurisdictions.
- **Notifications:** Add team members to Stripe with appropriate roles (Developer, Analyst, Administrator) and enable 2FA.

## 8. Rolling Back to Test Mode

If you need to revert to test mode temporarily:

1. Duplicate the Vercel project or use Preview deployments with test env vars.
2. Swap the production env vars back to test keys.
3. Update the Supabase subscription data manually if you need to downgrade test users.

Document any live test transactions and reconcile them with accounting records; Stripe allows refunding or voiding charges to clean up the account.
