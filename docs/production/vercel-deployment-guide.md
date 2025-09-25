# Vercel Deployment Guide

This guide walks through deploying the OpenRouter Chatbot to Vercel for the first time, wiring up environment variables, cron jobs, and runtime settings.

## 1. Prerequisites

- GitHub repository access with the production branch ready.
- Supabase production project created and credentials available (see [supabase-production-setup.md](./supabase-production-setup.md)).
- Provisioned integrations (Upstash Redis, Stripe, OpenRouter, etc.) with production secrets on hand.
- Upgraded Vercel plan: **Pro** or higher (cron jobs require Pro).

## 2. Create the Vercel Project

1. Sign up at [vercel.com/signup](https://vercel.com/signup) using a work email.
2. Choose **Import Git Repository** and grant Vercel access to the GitHub organization/repo.
3. Select the repository (`openrouter-chatbot`) and pick the production branch you intend to deploy from (you can change this later under _Project → Settings → Git_).
4. When prompted for a framework, Vercel should auto-detect **Next.js**.
5. Accept the default build command `npm run build` and output directory `.vercel/output` (handled automatically by Next.js 15).

## 3. Environment Variable Inventory

Set the following variables before the first deploy. Vercel supports _Production_, _Preview_, and _Development_ scopes—create a **Production** environment for these secrets.

> 🔐 Generate new 32+ byte random values for all secrets (see [integrations-and-secrets.md](./integrations-and-secrets.md)).

| Variable                                                    | Scope         | Notes                                                                           |
| ----------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------- |
| `BRAND_NAME`                                                | Public        | Optional branding override.                                                     |
| `NEXT_PUBLIC_APP_URL`                                       | Public        | Should match your production domain (`https://<project>.vercel.app` initially). |
| `OPENROUTER_API_KEY`                                        | Server        | Production key for OpenRouter billing account.                                  |
| `OPENROUTER_API_MODEL`, `OPENROUTER_MODELS_LIST`, etc.      | Public/Server | Keep defaults unless product requires changes.                                  |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`        | Server        | Create a dedicated production Upstash Redis database.                           |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public        | From the new Supabase project.                                                  |
| `SUPABASE_SERVICE_ROLE_KEY`                                 | Server        | Required for server-to-server operations.                                       |
| `ANON_USAGE_HMAC_SECRET`                                    | Server        | 32+ byte random secret used for anonymized analytics HMAC.                      |
| `INTERNAL_SYNC_TOKEN` **or** `INTERNAL_SYNC_SECRET`         | Server        | Auth for `/api/internal/sync-models`; pick either bearer token or HMAC secret.  |
| `INTERNAL_CLEANUP_TOKEN` **or** `INTERNAL_CLEANUP_SECRET`   | Server        | Used by attachments cleanup/retention cron wrappers.                            |
| `CRON_SECRET`                                               | Server        | Shared bearer token for all Vercel cron GET wrappers.                           |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                | Server        | Use test keys until the Stripe account is live.                                 |
| `STRIPE_PRO_PRICE_ID`, `STRIPE_ENTERPRISE_PRICE_ID`         | Server        | Create live price IDs before launch.                                            |
| `STRIPE_API_VERSION`                                        | Server        | Keep in sync with backend expectations.                                         |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`                        | Public        | Publishable key for Checkout/Portal.                                            |
| `NEXT_PUBLIC_STRIPE_DASHBOARD_MODE`                         | Public        | `test` for Sandbox dashboards, switch to `live` when pointing users to prod.    |
| `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`                   | Server        | Use relative paths (`/account/subscription?success=true`).                      |
| `OPENROUTER_BASE_URL`, `OPENROUTER_MAX_TOKENS`              | Server        | Optional overrides.                                                             |
| `AUTH_SNAPSHOT_CACHE_TTL_SECONDS`, `MAX_MESSAGE_CHARS`      | Server        | Optional tuning knobs.                                                          |
| `SENTRY_DSN`                                                | Server        | Only if Sentry is enabled.                                                      |
| `STREAM_DEBUG`, `NEXT_PUBLIC_DEBUG_STREAMING`               | Public/Server | Keep `0` unless troubleshooting.                                                |

Add any other variables from `.env.example` that your product configuration requires (marketing copy toggles, feature flags, etc.).

### Adding Variables

1. Vercel Dashboard → Project → **Settings → Environment Variables**.
2. Click **Add** and supply the _key_, _value_, and _environment_ (Production).
3. Leave _Encrypt_ enabled (on by default) for server-side secrets.
4. After saving all variables, click **Redeploy** to apply them.

## 4. Cron Job Configuration

The repository ships with `vercel.json` that defines three cron schedules:

```json
{
  "crons": [
    { "path": "/api/cron/attachments/retention", "schedule": "0 4 * * *" },
    { "path": "/api/cron/attachments/cleanup", "schedule": "30 4 * * *" },
    { "path": "/api/cron/models/sync", "schedule": "0 * * * *" }
  ]
}
```

After the first deployment:

1. Go to _Project → Settings → Cron Jobs_ and confirm the schedules are listed. Vercel will use UTC time.
2. Set the `CRON_SECRET` environment variable so the wrappers authorize requests. Without it, cron executions return `401`.
3. Optionally adjust the `CRON_*` tuning variables (limits/dry-run flags) in Vercel if production needs different retention windows.
4. Manually trigger each endpoint to validate:

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/models/sync
```

All three should return a `200` or `204` response.

## 5. Build & Runtime Settings

1. _Project → Settings → Functions_:
   - Set **Default Memory** to `2048 MB` (covers the majority of API routes).
   - Add an override for `/api/chat` to run on **Performance (4096 MB, 2 vCPU)** and set **Max Duration** to `300s`.
2. Verify the project uses **Node.js 20** runtime (Next.js 15 default).
3. Keep **Edge Functions** disabled unless specifically needed (all routes currently expect Node runtime).

## 6. Connecting Supabase Webhooks (Optional)

If you rely on Supabase webhooks (e.g., for subscription sync):

1. In Supabase → _Database → Webhooks_, add the production endpoint (e.g., `/api/webhooks/supabase`).
2. Store the webhook secrets in Vercel (`SUPABASE_WEBHOOK_SECRET`).

## 7. Domain & SSL

1. You can launch with the default `https://<project-name>.vercel.app` domain. Stripe accepts this during onboarding.
2. When you purchase a custom domain, add it under _Settings → Domains_ and follow Vercel’s DNS instructions.
3. Update `NEXT_PUBLIC_APP_URL`, Stripe dashboard URLs, and any OAuth redirect URIs once the custom domain is live.

## 8. Preview Environments (Optional)

- Configure a separate **Preview** environment in Vercel for staging/testing.
- Duplicate required env vars, but point to staging versions of services (Supabase staging project, Stripe test keys, etc.).
- Use branch protections to control who can deploy to Production.

## 9. Verification Checklist

- [ ] First deployment succeeds (`npm run build` passes in Vercel logs).
- [ ] Cron jobs list shows three active schedules.
- [ ] Manual curl to `/api/cron/models/sync` with `CRON_SECRET` returns success.
- [ ] `/api/stripe/webhook` reachable and Stripe dashboard shows **200** test delivery.
- [ ] Supabase connection works (check `/api/user/data` logs for errors).
- [ ] Redis rate limiting functioning (inspect Upstash metrics after live traffic).

## 10. Post-Deployment Tips

- Configure [Spend Controls](https://vercel.com/docs/management/spend-controls) to pause deployments if monthly costs spike.
- Enable [Log Drains](https://vercel.com/docs/observability/log-drains) if you need to retain logs longer than Vercel’s default window.
- Invite teammates as _Members_ with least-privilege roles (Viewer vs. Developer vs. Admin).

> ✅ Once this guide is complete, proceed to [stripe-production-plan.md](./stripe-production-plan.md) to finish payment onboarding and switch to live mode.
