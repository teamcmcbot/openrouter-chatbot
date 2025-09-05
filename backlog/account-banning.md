# Account monitoring and banning – plan and initial findings

Last updated: 2025-09-05

## What we have today (findings)

- Auth provider and flow
  - Client: `contexts/AuthContext.tsx` uses `supabase.auth.signInWithOAuth({ provider: 'google' })` and tracks session/user on auth state changes.
  - Server: API routes use standardized middleware (e.g., `withProtectedAuth`, `withTieredRateLimit`) that builds an `AuthContext` via `lib/utils/auth.extractAuthContext()` using Supabase cookies or Bearer token.
- Profile creation and sync (Supabase-first)
  - DB trigger: `CREATE TRIGGER on_auth_user_profile_sync AFTER INSERT OR UPDATE ON auth.users EXECUTE FUNCTION public.handle_user_profile_sync()` (see `database/schema/01-users.sql`).
    - On first Google sign-in, `public.handle_user_profile_sync()` creates a row in `public.profiles` with `id=email/full_name/avatar_url` populated from Google metadata and logs `profile_created` in `public.user_activity_log`.
    - On subsequent auth updates, it syncs profile fields and logs `profile_synced` with dedupe.
  - Server fallback: `lib/utils/auth.fetchUserProfile()` attempts to select from `public.profiles`; if `PGRST116` (no row), it calls `createDefaultUserProfile()` to insert a minimal profile. In practice the DB trigger should create the profile; fallback is a safety net.
- Current schema gaps for banning
  - `public.profiles` has no ban-related fields or status.
  - There’s a comprehensive `user_activity_log` and `user_usage_daily`, which we can leverage for monitoring, but no explicit moderation/ban tables or helper functions.

## Goals and constraints

- Detect abusive behavior (spikes, spammy patterns, repeated rate-limit trips, ToS-violations) and surface to admins.
- Allow permanent or temporary bans; bans must block chat endpoints (Tier A) while allowing sign-in UI to load (so we can display a clear notice and an appeal path).
- Centralize enforcement in middleware; keep UI simple and consistent; write structured, privacy-safe logs.
- Follow existing standards: middleware-based auth, tiered rate limiting, structured logging, no PII in logs.

## Phased implementation plan

### Phase 1 — Schema + server enforcement

- [x] Add ban fields to profiles (or a status enum)
  - Option A: Columns on `public.profiles`
    - `is_banned boolean default false not null`
    - `banned_at timestamptz`
    - `banned_until timestamptz` (nullable; null means permanent)
    - `ban_reason text` (admin-entered note; do not expose to client verbatim)
    - `violation_strikes int default 0 not null`
  - Option B (complementary): `public.moderation_actions` table
    - Columns: `id, user_id, action, reason, metadata jsonb, created_at, created_by`
    - Actions: `warned | banned | unbanned | temporary_ban`
- [x] Helper functions (SECURITY DEFINER)
  - `public.is_banned(user_uuid uuid) returns boolean`
  - `public.ban_user(user_uuid uuid, until timestamptz default null, reason text default null)`
  - `public.unban_user(user_uuid uuid, reason text default null)`
- [x] Idempotent patch
  - Create a SQL patch under `database/patches/account-banning/001-ban-schema.sql` with safe `ALTER TABLE IF NOT EXISTS` patterns and function guards.
- [x] Middleware enforcement (central)

  - Extend `lib/types/auth.ts` with a new `AuthErrorCode.ACCOUNT_BANNED` and map to HTTP 403 in `lib/utils/errors.ts`.
  - In `lib/middleware/auth.ts` inside `withAuth` (after profile fetch), block if `is_banned` or `banned_until > now()`; return `handleAuthError` with user-safe message: “Your account is banned. Contact support if you think this is a mistake.”
  - Ensure this runs before tier checks and before rate limiting.

- [x] Redis cache for ban/tier snapshot (server-side)
  - Minimal snapshot (no PII): `isBanned:boolean`, `bannedUntil:string|null`, `tier:'free'|'pro'|'enterprise'`, `accountType:'user'|'admin'`, `updatedAt:string`, `v:number`.
  - Key/TTL: `auth:snapshot:user:{userId}`, TTL 900s (15m). Store as JSON string.
  - Middleware flow per request:
    1. Validate Supabase cookie/token → get `userId`.
    2. GET Redis `auth:snapshot:user:{userId}`.
    3. If hit → enforce ban quickly without DB read for these fields.
    4. If miss/expired → SELECT only needed columns from `public.profiles` (ban fields + `subscription_tier`, `account_type`), enforce, then SET the snapshot with TTL.
  - Invalidation: on successful ban/unban (or tier/account type change), DEL `auth:snapshot:user:{userId}` to apply immediately. (Hook to be wired in Phase 3 admin endpoints.)
  - Fallback: if Redis unavailable, skip cache and read from DB; do not fail requests.
  - Config: co-locate Redis with deployment region; add env `AUTH_SNAPSHOT_CACHE_TTL_SECONDS` (default 900) to tune or disable.
  - Logging: emit sampled, privacy-safe hit/miss counters at debug level only.
- [ ] UI: disable chat input on banned
  - When any chat API returns `code: 'account_banned'`, disable send controls and open a modal/inline banner explaining the ban and linking to appeal.

User verification for Phase 1

- [ ] Confirm DB patch applies cleanly and RLS remains correct.
- [ ] Confirm banned account can sign in but cannot use `/api/chat` or other Tier A endpoints (403 with `account_banned`).
- [ ] Confirm non-banned accounts unaffected.
- [ ] With Redis enabled, first request after TTL performs one DB read; subsequent requests within TTL avoid DB for ban/tier fields (verify via query logs/observability).
- [ ] After an admin bans a user, cache key is invalidated and the next request reflects the ban immediately (no 15m delay).

### Phase 2 — Monitoring + detection signals

- [ ] Signals (rule-based to start)
  - Repeated rate-limit exceedances per day.
  - Abnormally high messages/tokens per minute vs user’s historical median.
  - Excessive failed sends or upstream provider 4xx/5xx ratios.
  - Attachment misuse (excessive size violations, repeated malware-type rejections if we add scanners later).
- [ ] Aggregations
  - Extend `user_usage_daily` or create `user_violations_daily(user_id, date, violations jsonb, score int)`.
  - Lightweight scoring: `score += weight_per_signal`; threshold triggers admin attention.
- [ ] Admin dashboard module
  - New page: `/admin/users` with sortable “risk” view (score, last_active, tier, recent violations, quick ban/unban).
- [ ] Notifications for admins (optional)
  - Low-volume email/slack webhook when a user crosses a high threshold.

User verification for Phase 2

- [ ] Validate detectors with synthetic data (seed 1-2 users that should trip rules).
- [ ] Confirm admin UI lists risky accounts and allows ban/unban flows.

### Phase 3 — Admin actions and auditability

- [ ] Admin endpoints
  - `POST /api/admin/users/{id}/ban` (body: `until?`, `reason?`) → `withAdminAuth` + `withTieredRateLimit({ tier: 'tierD' })`.
  - `POST /api/admin/users/{id}/unban` (body: `reason?`).
- [ ] Write audit logs
  - Log `user_banned`/`user_unbanned` to `public.user_activity_log` and `public.moderation_actions` with minimal context, no PII.
- [ ] UX hardening

  - Propagate banned state to client quickly (refetch profile after admin action; invalidate caches).

- [ ] Redis invalidation hook
  - On ban/unban success, DEL `auth:snapshot:user:{userId}`. Optionally trigger client profile refresh.

User verification for Phase 3

- [ ] Confirm endpoints require admin profile and rate limiting tier D is applied.
- [ ] Confirm actions update DB, produce activity logs, and UI reflects changes.

## Admin Dashboard — Users tab UI flow

Goal: let admins search users by ID or email, view status, and ban/unban with auditability.

Key screens/components

- Route: `/admin/users` (protected by `withAdminAuth`)
- Components
  - Search bar with filter: Any | Email | User ID
  - Results table (paginated): ID, Email, Name, Tier, Account Type, Status (Banned/Active), Last Active, Strikes, Actions
  - User detail side drawer: profile summary, recent usage, recent moderation actions
  - Ban/Unban modal

Search behavior

- Single input with debounced query (300–500ms). Filters:
  - Any (default):
    - If query matches UUID v4 -> search by `id` exact
    - Else if query contains `@` -> `email ILIKE %query%`
    - Else -> `email ILIKE %query%` OR `id LIKE query%`
  - Email: `email ILIKE %query%`
  - User ID: UUID exact match (validate client-side)
- Pagination server-side; default 25 per page; show skeleton loaders.

Row actions

- View: opens side drawer with profile data, today’s usage, last 7 days summary, and moderation history (if `moderation_actions` exists).
- Ban: opens Ban modal.
- Unban: opens Unban modal (if currently banned).

Ban modal (primary flow)

- Fields
  - Ban type: Temporary | Permanent
  - Duration presets (temporary): 24h, 72h, 7d, Custom (date/time picker). Computes `banned_until` in UTC.
  - Reason (required, 10–500 chars). Note: stored server-side; not exposed verbatim to end users.
  - Confirm checkbox or type-to-confirm (e.g., type BAN)
- Submit → POST `/api/admin/users/{id}/ban` with body `{ until?: string (ISO), reason: string }`
- Success → close modal, toast success, refresh table row and drawer; optionally highlight “Banned” status badge.
- Errors → inline error under form; map known codes:
  - `forbidden` (not admin) → show “Insufficient privileges”
  - `too_many_requests` (TierD RL) → show retry in Xs
  - `conflict` (already banned) → refresh and show current status

Unban modal

- Fields: Reason (optional). Submit → POST `/api/admin/users/{id}/unban`.
- Same success/error handling as Ban.

Status indicators

- Status column: Active | Banned (until <date> | permanent). Badges with color coding.
- Drawer shows ban metadata and last moderation action.

Guardrails

- Hide or disable Ban for self (admin cannot ban their own account).
- Double-confirm if target `account_type = 'admin'`.
- Final enforcement is server-side via middleware/functions; the UI only assists.

API contracts (draft)

- GET `/api/admin/users?query=...&filter=(any|email|id)&page=1&limit=25`
  - Returns: `{ items: Array<{ id, email, full_name, subscription_tier, account_type, is_banned, banned_until, violation_strikes, last_active }>, total }`
  - Protected by `withAdminAuth`, tier D rate limit.
- POST `/api/admin/users/{id}/ban`
  - Body: `{ until?: string, reason: string }`
  - Returns: `{ success: true, user: { ...updated fields... } }`
- POST `/api/admin/users/{id}/unban`
  - Body: `{ reason?: string }`
  - Returns: `{ success: true, user: { ...updated fields... } }`

Logging & privacy

- Server logs one structured event per action; no PII in logs. `reason` stored in DB, not logged verbatim.
- Activity log entries: `user_banned`/`user_unbanned` with small, redacted context.

UI test steps

- Search by email substring shows expected user rows.
- Search by valid UUID shows exact match; invalid UUID shows validation hint.
- Ban a user (24h) → row updates to Banned with until timestamp; Unban becomes available.
- Unban → row returns to Active; Ban becomes available.
- Attempt to ban self → action disabled with tooltip.
- Attempt to ban another admin → requires double-confirm; server enforces policy.

### Phase 4 — Content moderation (optional, feature-flagged)

- [ ] Pluggable moderation checks (LLM/API)
  - Sample: text toxicity/harassment categories with thresholds.
  - Gate behind feature flag; do not log raw text; only store category and boolean flags.
- [ ] Escalation
  - On repeated violations → auto temp-ban (configurable) and notify admins.

User verification for Phase 4

- [ ] Confirm no prompts/responses are logged; only redacted, categorical flags.
- [ ] Confirm false-positive rate acceptable before enabling broadly.

### Finalization

- [ ] Merge SQL patch into canonical `/database/schema/01-users.sql` after approval.
- [ ] Add docs in `/docs/` (admin guide, moderation policy, UI behavior, API error codes).

## UI behavior (banned notice)

- When banned: show a blocking modal on the chat page and disable composer. Message: “Your account is banned.” Optional: link to appeal or support.
- API shape on ban: `{ error: "Your account is banned.", code: "account_banned", timestamp: ISO8601 }`.
- Keep copies of messages safe; do not expose ban reason to end user unless policy allows.

## Edge cases

- Anonymous usage: IP-based limits only; no account to ban. Optionally consider IP/device bans later.
- Temporary bans (until date): unblock automatically when `banned_until < now()`.
- Enterprise admins: no bypass for bans; a ban must override all.
- Data export/delete (GDPR): ensure banned users still can export/delete via self-service if required by policy.

## Open questions (please confirm)

1. What behaviors constitute “abuse” for initial manual bans and for automated flags? Any hard thresholds to start with?
2. Should bans be temporary by default (e.g., 24–72 hours) or permanent until reviewed?
3. Who is allowed to ban/unban (only `account_type = 'admin'`)? Any audit verbiage we must store?
4. Do we need an in-app appeal form, or just link to email/support?
5. Any requirement to support IP/device-level bans for anonymous users at this stage?
6. Snapshot cache TTL final value (default 15m)? Any endpoints that should bypass cache?
7. Confirm Redis colocation/region and whether to gate cache behind an env flag for phased rollout.

## Patch outline (not applied yet; requires sign-off)

- `database/patches/account-banning/001-ban-schema.sql`
  - `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned boolean not null default false;`
  - `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned_at timestamptz;`
  - `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned_until timestamptz;`
  - `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ban_reason text;`
  - `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS violation_strikes int not null default 0;`
  - Create table `public.moderation_actions` if not exists with RLS and indexes.
  - Functions `public.is_banned`, `public.ban_user`, `public.unban_user`.
- Web: extend error codes with `ACCOUNT_BANNED`; add check in `withAuth` prior to handlers; UI modal on receipt.
- Admin: endpoints and page wiring (Phase 3).

## Manual test steps (Phase 1)

- Create a test user and set `is_banned = true`.
- Attempt chat send → expect 403 with `account_banned` and UI modal; chat input disabled.
- Set `banned_until = now() + interval '10 minutes'` → still blocked.
- After expiry, confirm access is restored on next request.
