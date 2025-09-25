# Integrations & Secrets Inventory

This document centralizes every third-party integration required for production, the secrets you must generate, and best practices for managing them.

## How to Generate Strong Secrets

Use a crypto-safe generator such as:

```bash
# 64 hex characters (256 bits of entropy)
openssl rand -hex 32
```

Store generated secrets in your team password manager and copy them into Vercel/Supabase—never commit to git.

---

## 1. OpenRouter

| Item                                             | Purpose                      | Notes                                                                                                   |
| ------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`                             | Authorizes chat completions. | Create a dedicated API key for production in the OpenRouter dashboard. Restrict by origin if available. |
| `OPENROUTER_BASE_URL`                            | Optional base override.      | Keep default unless migrating to a proxy.                                                               |
| `OPENROUTER_API_MODEL`, `OPENROUTER_MODELS_LIST` | Feature configuration.       | Ensure the listed models match those provisioned for paid tiers.                                        |

**Monitoring:** Track usage via OpenRouter billing page. Consider adding spend alerts.

---

## 2. Upstash Redis

| Item                              | Purpose                          | Notes                                                  |
| --------------------------------- | -------------------------------- | ------------------------------------------------------ |
| `UPSTASH_REDIS_REST_URL`          | REST endpoint for rate limiting. | Create a new database in the closest region to Vercel. |
| `UPSTASH_REDIS_REST_TOKEN`        | Auth token.                      | Rotate quarterly or if compromised.                    |
| `AUTH_SNAPSHOT_CACHE_TTL_SECONDS` | Optional tuning.                 | Adjust based on ban propagation requirements.          |

**Setup:**

1. Log in to [Upstash](https://console.upstash.com/), create a Redis database, and copy the REST credentials.
2. Enable the _Rate Limit_ metric dashboard for monitoring.
3. Consider setting per-IP throttling within Upstash if abuse is expected.

---

## 3. Stripe

| Item                                                | Purpose                         | Notes                                                                     |
| --------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`                                 | Server-side API key.            | Use test key until production onboarding complete.                        |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`                | Client key.                     | Safe to expose—scope to Production environment.                           |
| `NEXT_PUBLIC_STRIPE_DASHBOARD_MODE`                 | Controls Stripe dashboard URLs. | Set to `test` for Sandbox links; change to `live` once production ready.  |
| `STRIPE_WEBHOOK_SECRET`                             | Verifies `/api/stripe/webhook`. | Created when adding webhook endpoint in Stripe dashboard.                 |
| `STRIPE_PRO_PRICE_ID`, `STRIPE_ENTERPRISE_PRICE_ID` | Checkout price references.      | Create separate live prices even if amounts match test prices.            |
| `STRIPE_API_VERSION`                                | Ensures stable API responses.   | Keep aligned with `/lib/stripe/client.ts` (currently `2025-06-30.basil`). |

**Environments:** Stripe provides separate test and live modes. Configure _two_ sets of keys if you also deploy a staging environment.

---

## 4. Supabase

| Item                            | Purpose                      | Notes                                                       |
| ------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Project URL for client SDK.  | Safe to expose, but ensure it points to production project. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client auth key.             | Rotatable at any time.                                      |
| `SUPABASE_SERVICE_ROLE_KEY`     | Elevated server-side access. | Keep server-only. Rotate if leaked.                         |
| `SUPABASE_JWT_SECRET` (if used) | Custom verification.         | Only needed for custom auth flows.                          |

**Google OAuth:** Manage the OAuth client IDs in Supabase Auth dashboard. See [supabase-production-setup.md](./supabase-production-setup.md).

---

## 5. Internal Job Secrets

| Item                                                 | Purpose                                    | Notes                                                                       |
| ---------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| `CRON_SECRET`                                        | Authorizes Vercel cron wrappers.           | Shared bearer token supplied in the `Authorization` header.                 |
| `INTERNAL_SYNC_TOKEN` / `INTERNAL_SYNC_SECRET`       | Secures `/api/internal/sync-models`.       | Choose **either** bearer (`Authorization: Bearer`) or HMAC (`X-Signature`). |
| `INTERNAL_CLEANUP_TOKEN` / `INTERNAL_CLEANUP_SECRET` | Secures attachment cleanup/retention jobs. | Same auth approach as sync job.                                             |
| `BASE_URL`                                           | Optional override for scripts.             | Not required in Vercel environments; defaults to request origin.            |

HMAC secrets should be 32+ byte random strings. If you prefer bearer tokens, treat them as passwords.

---

## 6. Sentry (Optional but Recommended)

| Item                | Purpose                   | Notes                                                      |
| ------------------- | ------------------------- | ---------------------------------------------------------- |
| `SENTRY_DSN`        | Error reporting endpoint. | Create a project in Sentry and copy the DSN.               |
| `SENTRY_ENABLE_DEV` | Toggle dev reporting.     | Set to `false` in production unless you want local traces. |

**Setup:**

1. Create a new project in Sentry (Platform: **Next.js**).
2. Follow Sentry’s onboarding to verify events (trigger an error in staging).
3. Configure release tracking if you plan to monitor deployments.

---

## 7. Google OAuth

| Item                      | Purpose                  | Notes                                                             |
| ------------------------- | ------------------------ | ----------------------------------------------------------------- |
| Google Client ID & Secret | Supabase OAuth provider. | Store in Supabase Auth settings; not required in Vercel env vars. |
| Authorized domains        | Security boundary.       | Include production domain and fallback `.vercel.app` domain.      |

Refer to Google Cloud Console to rotate credentials annually or after personnel changes.

---

## 8. Miscellaneous Configuration

| Variable                                                 | Purpose                                             |
| -------------------------------------------------------- | --------------------------------------------------- |
| `ANON_USAGE_HMAC_SECRET`                                 | Hash key for anonymous telemetry.                   |
| Feature flags (e.g., `NEXT_PUBLIC_ENABLE_CONTEXT_AWARE`) | Control UI experiments.                             |
| `STREAM_DEBUG`, `NEXT_PUBLIC_DEBUG_STREAMING`            | Troubleshooting flags—leave `0` in production.      |
| `STREAM_MARKERS_ENABLED`, `STREAM_REASONING_ENABLED`     | Control streaming payload features per environment. |

---

## Secret Management Tips

- **Rotation Cadence:** Rotate critical secrets (Stripe, Supabase service role, OpenRouter API key) every 6–12 months or immediately after a suspected breach.
- **Audit Trail:** Maintain a changelog of who generated each secret and where it is stored.
- **Principle of Least Privilege:** Provide service accounts where available (Stripe restricted keys, Sentry team roles) instead of sharing global admin credentials.
- **Incident Response:** Document how to revoke API keys quickly (e.g., Stripe → Developers → API keys → Roll).

---

## Quick Reference Table

| Service       | Production Setup Checklist                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------- |
| OpenRouter    | Create prod API key → Add to Vercel → Verify chat completions from staging.                     |
| Upstash Redis | New database → Copy REST URL/token → Monitor rate limits.                                       |
| Supabase      | New project → Run migrations → Configure Google Auth → Copy anon/service keys.                  |
| Stripe        | Complete business onboarding → Deploy site → Configure webhook + price IDs → Swap to live keys. |
| Google Cloud  | Create OAuth client → Add prod domain + fallback → Paste credentials into Supabase.             |
| Sentry        | Create Next.js project → Paste DSN → Trigger test error.                                        |

Keep this document updated as new integrations (analytics, email providers, etc.) are introduced.
