# Production Readiness Checklist

Use this checklist as the master tracker for launch. Each section links to deeper guidance in the companion documents inside `/docs/production/`.

## 1. Project & Access Control

- [ ] Confirm the production GitHub branch (`feature/stripe-payment` or `main`) that Vercel will build from.
- [ ] Ensure all maintainers who will manage Vercel, Supabase, Stripe, and Upstash have individual accounts with MFA enabled.
- [ ] Set up a shared password manager (1Password, Bitwarden, etc.) for storing issued API keys and secrets.
- [ ] Establish an incident escalation channel (Slack/Discord) and on-call rotation for launch week.

## 2. Supabase Production Stack

- [ ] Create a new Supabase project in the target region (see [supabase-production-setup.md](./supabase-production-setup.md)).
- [ ] Import the existing schema by running `supabase db reset` locally against the remote instance.
- [ ] Verify RLS policies and storage buckets exist after migration (especially chat history, attachments, and analytics tables).
- [ ] Configure Google OAuth credentials in Supabase Auth with production client ID/secret.
- [ ] Capture the project URL, anon key, and service role key for Vercel environment variables.

## 3. Vercel Deployment Pipeline

- [ ] Create a Vercel account and import the GitHub repository (see [vercel-deployment-guide.md](./vercel-deployment-guide.md)).
- [ ] Choose the Pro plan to unlock cron jobs and environment variable scoping.
- [ ] Add the complete production `.env` inventory to Vercel (mark client vs. server variables appropriately).
- [ ] Configure build and runtime memory overrides (4GB for `/api/chat`, 2GB default elsewhere).
- [ ] Enable [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs) and confirm the three schedules from `vercel.json` appear after the first deploy.

## 4. External Integrations & Secrets

- [ ] Provision production-grade services listed in [integrations-and-secrets.md](./integrations-and-secrets.md) (Upstash Redis, Stripe, OpenRouter, Sentry, etc.).
- [ ] Generate fresh 32+ byte random secrets for HMAC tokens using `openssl rand -hex 32` or your password manager.
- [ ] Store all secrets only in Vercel and Supabase (never commit them to git).
- [ ] Confirm rotation procedures (document who owns each secret and how to roll it if compromised).

## 5. Stripe Launch Readiness

- [ ] Set up the Stripe account (business profile, bank info, support details) following [stripe-production-plan.md](./stripe-production-plan.md).
- [ ] Deploy the app to a public Vercel URL (`https://project-name.vercel.app`) and configure it as the website in Stripe’s onboarding.
- [ ] Create production products and price IDs for Pro and Enterprise tiers; copy them into Vercel env vars.
- [ ] Configure webhook endpoint `https://<prod-domain>/api/stripe/webhook` and store the signing secret.
- [ ] Test Checkout and Customer Portal flows using Stripe test cards before switching to live mode.

## 6. Scheduled Jobs & Automation

- [ ] Set `CRON_SECRET`, `INTERNAL_SYNC_TOKEN`, and `INTERNAL_CLEANUP_TOKEN` environment variables.
- [ ] Manually trigger `/api/cron/*` endpoints (via `curl`) with the Bearer token to confirm they return `200`.
- [ ] Monitor Upstash dashboards to ensure cron-triggered tasks are rate limited correctly.

## 7. Observability & Monitoring

- [ ] Configure Sentry DSN (optional but recommended) and verify error capture in a staging environment.
- [ ] Enable logging drains or Vercel logs retention to cover your incident response window.
- [ ] Set Vercel billing alerts ($50/$100/$200 thresholds) and auto-pause at $300 to prevent runaway spend.
- [ ] Document runbook for investigating failed cron jobs and Stripe webhook retries.

## 8. Launch Day Validation

- [ ] Smoke-test authentication (Google sign-in), chat completion, settings updates, and file uploads on production.
- [ ] Confirm Stripe Checkout completes and upgrades the Supabase subscription row.
- [ ] Verify cron jobs execute (check Supabase logs or Upstash metrics).
- [ ] Run the regression suite locally (`npm test && npm run build`) from the release commit.

## 9. Post-Launch Follow-Up

- [ ] Schedule the first data retention review (verify attachments cleanup) for one week after launch.
- [ ] Monitor billing dashboards (Stripe and Vercel) daily during the first week.
- [ ] Capture user feedback and triage into `/issues/` for follow-up releases.
- [ ] Revisit infrastructure scaling options when monthly Vercel spend exceeds $400 (see alternative platform notes in `vercel-cost.md`).

> ℹ️ **Tip:** Duplicate this checklist into your project management tool and assign owners/due dates so nothing falls through during the go-live window.
