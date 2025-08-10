# Admin Sync Models – Enhancement Analysis

This analysis covers the requested enhancements: formal ADMIN role, scheduled sync job, and an admin dashboard. It addresses database schema, API, auth, UI, and security.

## Goals

- Introduce a first-class ADMIN account type separate from subscription tiers.
- Move model sync from manual admin-triggered to a scheduled/background job.
- Provide an admin dashboard to manage models, users, and operations securely.

---

## Status update (as of 2025-08-10)

What’s implemented

- Database
  - profiles.account_type added with CHECK constraint and default 'user'.
  - Partial index for admins added: idx_profiles_account_type_admin.
  - Helper function public.is_admin(uuid) created and used in RLS.
  - model_sync_log.added_by_user_id column added for attribution.
  - sync_openrouter_models signature updated to (models_data JSONB, p_added_by_user_id UUID DEFAULT NULL)
    - Inserts a running log row including added_by_user_id.
    - Updates the log with success/failure and duration on completion.
  - RLS: model_sync_log now has admin SELECT, INSERT, and UPDATE policies.
  - Indices on model_access updated/confirmed (status, tier flags, last_synced, openrouter_last_seen) for dashboard queries.
- API/Auth
  - withAdminAuth middleware added; enforces profile.account_type === 'admin'.
  - /api/admin/sync-models GET/POST now wrapped with withAdminAuth (no more enterprise-tier check).
  - Service passes the triggering admin’s user id to RPC (p_added_by_user_id).
- UI
  - Admin dashboard at /admin with server-side guard (checks account_type).
  - “Model Sync” panel can GET status and POST a manual sync trigger.

What’s verified

- Manual sync successfully updates public.model_access (new/updated/inactive transitions observed).
- model_sync_log records a new row per run with added_by_user_id populated.
- Admin-only access enforced for /admin and /api/admin/sync-models.

Pending (next steps)

- Internal scheduled endpoint POST /api/internal/sync-models with HMAC/service token.
- Cron wiring (Vercel or Supabase) to call the internal endpoint on cadence.
- Admin UI expansions: Models table (filters/bulk actions) and Users table (promote/demote, edit tier).
- Tests: middleware unit tests, route integration tests, and basic E2E for the dashboard.
- Docs: endpoint-protection/security patterns; admin dashboard usage notes.

## Database schema changes

1. profiles.account_type (new)

- Column: account_type text NOT NULL DEFAULT 'user' CHECK (account_type IN ('user','admin'))
- Purpose: Decouple administrative privilege from subscription tier. Retain subscription_tier for consumption limits.
- Migration notes:
  - Backfill existing profiles to 'user'.
  - Create partial index for faster admin lookups: CREATE INDEX ON profiles (account_type) WHERE account_type='admin';

2. Model sync ownership (optional)

- model_sync_log.added_by_user_id UUID NULL
  - If triggered manually by admin, store who triggered.
  - For scheduled jobs, can store a special service user id or NULL.

3. Service account (optional)

- profiles row for a service user (account_type='admin') to attribute scheduled jobs, or store job runner id in a separate settings table.

4. Future-proofing flags (optional)

- model_access.new_since TIMESTAMPTZ NULL (to help dashboard highlight recent additions).
- model_access.is_new boolean GENERATED (status = 'new') for indexing and filtering.

Migration plan

- Create patch in database/patches/admin-role-and-scheduler/ with idempotent/ordered steps:
  1. ALTER TABLE profiles ADD COLUMN account_type ... (if not exists)
  2. UPDATE profiles SET account_type='user' WHERE account_type IS NULL
  3. CREATE INDEX CONCURRENTLY (if supported) on profiles(account_type) where account_type='admin'
  4. ALTER TABLE model_sync_log ADD COLUMN added_by_user_id UUID NULL (if not exists)
  5. Optionally add new_since or generated column if chosen
- Review RLS policies referencing subscription_tier; add policies for ADMIN overrides where necessary.
- Review functions/triggers relying on subscription_tier, recreate if type signatures change (none expected if only new column).

Implementation notes

- Implemented: account_type column and partial index; public.is_admin(uuid) helper; model_sync_log.added_by_user_id; sync_openrouter_models updated to accept p_added_by_user_id and write attribution; RLS policies on model_sync_log for SELECT/INSERT/UPDATE by admins.
- SECURITY DEFINER is retained for the RPC to function under server context.

---

## API changes

1. Auth separation: ADMIN vs enterprise

- Replace enterprise-tier checks for admin endpoints with ADMIN account_type checks.
- Introduce `withAdminAuth` middleware wrapper:
  - Requires authenticated user with profile.account_type === 'admin'.
  - Leverage existing withAuth chain, avoid manual checks in handlers.

Implementation notes

- Implemented: withAdminAuth middleware; updated /api/admin/sync-models to use it; attribution flows from API → service → RPC via p_added_by_user_id.
- Pending: migrate any other admin endpoints to withAdminAuth and add internal-only endpoint for scheduled syncs.

2. Admin endpoints

- Keep /api/admin/sync-models for manual trigger, but protect with ADMIN.
- Add /api/admin/models (CRUD, filters, bulk actions) with `withAdminAuth`.
- Add /api/admin/users (limited management), heavily restricted to avoid accessing messages or user content.

Status

- /api/admin/sync-models: Implemented and verified.
- /api/admin/models and /api/admin/users: Pending.

3. Scheduled sync job

- Options:
  - Supabase Scheduled Edge Function invoking an internal endpoint with a service key.
  - Vercel/Next Cron job hitting an internal route guarded by a secret (HMAC) and/or service token.
  - Background worker (queue) if available.
- Endpoint: POST /api/internal/sync-models
  - Guarded by HMAC header (X-Signature) and/or service bearer token; never exposed to browser.
  - Bypasses per-user cooldown but honors DB concurrency guard `isSyncRunning()`.
  - Uses same ModelSyncService.

Status

- Internal endpoint and scheduler: Pending.
- RLS considerations:
  - RPC `sync_openrouter_models` requires server role. Ensure service client uses service key context or RLS-exempt function security definer.

4. Telemetry/headers

- Standardize response headers for admin APIs and internal job endpoint (X-Response-Time, X-Sync-Log-ID, etc.).

Status

- Basic headers present on admin sync route (X-Response-Time, X-Sync-Log-ID, X-Models-Processed). Can standardize across admin APIs later.

---

## Authentication and authorization changes

- New enum-like field on profiles: account_type ('user'|'admin').
- Middleware: `withAdminAuth` built on `withAuth` with options { required: true, requireProfile: true } and a custom check for account_type.
- Update endpoint security standards doc to include admin-only pattern.
- AuthContext changes:
  - Add account_type to `UserProfile` and `AuthContext` for type safety.
  - Feature flags: admins bypass tier limits for admin routes but keep user-tier limits for non-admin features.

Status

- Implemented: account_type added to UserProfile; withAdminAuth in place; server-side guard on /admin. Feature flags unchanged; can revisit if needed.

---

## UI changes (Admin Dashboard)

Information Architecture

- Route group: /admin
- Protect via server-side check + client guard:
  - Server: Next.js middleware or server component check using AuthContext; redirect non-admins.
  - Client: minimal guard for UX; not a security boundary.

Features

- Models Management
  - Table: model_access with filters (status: new/active/disabled), search, sort.
  - Bulk actions: set status active/disabled; set is_free/pro/enterprise flags.
  - Detail view: pricing, context_length, last_synced_at, metadata.
  - Action: trigger manual sync (calls /api/admin/sync-models).
- Users Management (scoped)
  - List users with account_type and subscription_tier.
  - Promote/demote account_type (user<->admin) with confirmation and audit logging.
  - Edit subscription_tier; manage credits if applicable.
  - Never display user messages or PII beyond profile basics.
- Analytics (phase 2+)
  - Sync stats (success rate, avg duration, last success).
  - Usage by model and by tier (aggregate-only).

UX/Dev Notes

- Paginate and debounce searches.
- Use optimistic UI with server confirmation.
- Instrument with basic toasts and error banners.

---

## Security implications

- Principle of least privilege:
  - ADMIN separated from subscription_tier.
  - Admin endpoints protected with `withAdminAuth` only; never rely on front-end checks.
- RLS and Supabase:
  - Ensure RPC `sync_openrouter_models` runs with appropriate rights; consider SECURITY DEFINER and stable signature.
  - Lock down tables: model_access and model_sync_log should be read-only to non-admins (except via public read endpoints as designed).
- Secrets and scheduled jobs:
  - Internal sync endpoint must validate HMAC signature or service token stored in env.
  - Do not reuse user-facing cookies for job calls.
- Audit logging:
  - Log admin actions (status changes, role promotions) with who/when.
  - Store sync trigger attribution (added_by_user_id or service identity).
- Concurrency & DoS:
  - Keep DB-backed `isSyncRunning()` guard.
  - Rate limit admin manual trigger; skip per-user cooldown for internal job.
- Data exposure:
  - Admin dashboard must not expose user messages; restrict user management views to minimal fields.

---

## Phases & tasks

Phase 1 – Admin role foundation

- [x] DB patch: add profiles.account_type with check constraint & index.
- [x] Types: extend UserProfile & AuthContext with account_type.
- [x] Middleware: add withAdminAuth (server) and client guard util.
- [ ] Docs: update endpoint-protection and security docs.
- [x] User verification: confirm admin login works and non-admin denied.

Phase 2 – Scheduled sync job

- [ ] Add internal endpoint /api/internal/sync-models with HMAC/service token.
- [ ] Create cron (Vercel/Supabase) calling internal endpoint daily.
- [ ] Ensure RPC/RLS works with service context.
- [x] Update logs to record trigger identity.
- [ ] User verification: simulate cron, verify model_sync_log and model_access changes.

Phase 3 – Admin dashboard (MVP)

- [x] Route /admin with server auth check.
- Models Management
  - [x] List models from public.model_access
  - [x] Filter by statuses (new/active/disabled)
  - [x] Bulk edit status and flags (is_free/is_pro/is_enterprise)
  - [x] Sorting and search for models
  - [x] Pagination and count badges (filtered vs total)
- Sync Controls
  - [x] Manual “Trigger Sync” action wired to /api/admin/sync-models
- Users Management
  - [x] List users with account_type and subscription_tier
  - [x] Filter by account_type or subscription tier
  - [x] Bulk edit users (promote/demote admin; edit subscription_tier; adjust credits)
  - [ ] Confirmation modals and audit log entries for role/tier changes
- Analytics
  - [ ] Analytics tab with sync stats (success rate, avg duration, last success)
  - [ ] Usage by model/tier (aggregate-only views)
- [x] User verification: walkthrough of each UI action with expected DB effects (sync trigger/status).

Phase 4 – Hardening & analytics

- [ ] RLS policy review and tighten.
- [ ] Add audit logs for admin actions.
- [ ] Analytics views for sync and model usage.
- [ ] Load/perf tests on sync flow and dashboard queries.
- [ ] Documentation updates.

---

## Open questions (please confirm)

1. Service execution environment: prefer Vercel cron, Supabase Edge Function, or another worker?
2. Internal auth for scheduler: HMAC shared secret, Supabase service key, or both?
3. Should admins bypass any rate limits globally, or only on admin endpoints?
4. Do we need a soft-delete/archival policy for model_access or sync logs?
5. UI scope: Should user account management be included in MVP or phased later?

---

## Testing strategy (high-level)

- Unit: middleware, role checks, service utilities.
- Integration: internal sync endpoint hitting RPC; verify DB effects.
- E2E: admin dashboard flows (Cypress/Playwright) under admin and non-admin roles.
- Security: negative tests for unauthorized access; HMAC signature verification.

---

## How to verify (current)

- As an admin (profiles.account_type = 'admin'):
  - Visit /admin → see Admin Dashboard; non-admins see Access denied.
  - Click “Trigger Sync” → expect success message and X-Sync-Log-ID header in response.
  - Click “Refresh Status” → see currentStatus.isRunning false/true and last sync info.
- Database:
  - SELECT \* FROM public.model_sync_log ORDER BY sync_started_at DESC LIMIT 5; → shows latest run with added_by_user_id.
  - SELECT status, COUNT(\*) FROM public.model_access GROUP BY 1; → observe new/active/inactive counts consistent with sync.

## Next session suggestions

- Implement internal scheduled endpoint with HMAC verification and wire a daily cron.
- Build Models table in /admin (server components for SSR + client filters) and a minimal update endpoint using withAdminAuth.
- Add tests: middleware unit tests, route integration for admin sync, and a Playwright happy-path for /admin sync.
