# Anonymous usage statistics

## Summary

Track usage for non-authenticated sessions without a user ID, safely and without PII, and optionally sync if user later authenticates.

## Current implementation snapshot

- Anonymous users are supported via `withEnhancedAuth` on `/api/chat` and `/api/chat/stream`; these do not persist to DB. Authenticated users persist via `/api/chat/messages` (protected), which triggers analytics.
- Usage analytics pipeline relies on:
  - `chat_sessions.user_id` (NOT NULL) and `chat_messages`
  - Triggers: `on_message_change -> update_session_stats()` which calls `track_user_usage(user_id, ...)` on successful inserts; `on_session_created -> track_session_creation()` also calls `track_user_usage(..., session_created=true)`
  - Cost pipeline: `after_assistant_message_cost -> calculate_and_record_message_cost() -> recompute_image_cost_for_user_message(user_message_id)` which writes to `message_token_costs (user_id NOT NULL)` and updates `user_usage_daily.estimated_cost` by delta
  - Aggregates: `user_model_costs_daily` view; `get_global_model_costs()` RPC for admin
- UI surfaces and APIs:
  - View Usage: `/app/usage/costs/page.tsx` calls `/api/usage/costs`, `/api/usage/costs/models/daily` (protected; user-scoped to `message_token_costs`)
  - User Settings: `/api/user/data` calls `get_user_complete_profile(user_uuid)` returning `usage_stats.today`, `usage_stats.all_time` (from `user_usage_daily` + `profiles.usage_stats`)
  - Admin Dashboard: `/api/admin/analytics/overview`, `/api/admin/analytics/costs`, `/api/admin/analytics/usage` (admin). These read from `user_usage_daily`, `message_token_costs`, and `get_global_model_costs()`
  - Conversation sync: `/api/chat/sync` persists sessions/messages for authenticated users using client-provided IDs; triggers update stats and cost after insert

## Approach (contract)

- Inputs: anonymous session id (uuid stored in localStorage), event types (message_sent, completion_received), token counts, model id, timestamps.
- Outputs: server-side aggregated records keyed by `anonymous_session_id`.
- Errors: rate limit abuse; ensure minimal data and no PII.

## anonymous_session_id [CONFIRMED]

Agreed design for generating, persisting, and rotating the anonymous session identifier used for anonymous analytics. This is a short-lived, privacy-preserving “anonymous persona” identifier, not a durable user ID.

- Generation

  - Client generates a v4 UUID via crypto.randomUUID(); never includes PII; not reused across devices/browsers.

- Storage

  - Primary: localStorage key app:anon_session
  - Mirrors: sessionStorage app:anon_session and an in-memory singleton for early reads and private-browsing quirks
  - Value (JSON): { id: string, createdAt: ISO8601, lastUsedAt: ISO8601, ttlHours: number, version: 1 }

- TTL and rotation

  - Sliding inactivity TTL: default 24 hours (configurable to 12h). On use, update lastUsedAt and extend.
  - Rotate when: (1) expired (no activity for ttlHours), (2) user resets via UI, (3) storage is denied/corrupted, or (4) significant privacy mode is detected.
  - Pre-rotate guard: if inactivity exceeds ~90% of ttlHours (≈22h for 24h, ≈11h for 12h), schedule rotation on next send or rotate immediately per policy.

- Cross-tab behavior

  - Use window 'storage' events on app:anon_session to sync updates across tabs and prevent duplicate rotations.
  - Optional mutex: app:anon_session:lock with a short TTL (e.g., ~2s) so only one tab rotates at a time; others back off.

- Fallbacks

  - If localStorage write fails, attempt sessionStorage; if that fails, use an in-memory ephemeral ID for the page lifetime.

- Transport and server privacy

  - Client sends only the raw UUID over HTTPS; server derives anon_hash = HMAC-SHA256(k, uuid) with a regularly rotated key (e.g., 90 days) and never stores/logs the raw UUID.
  - Anonymous analytics remain aggregate-only; do not intentionally send or join IP/UA fingerprints.

- Consent and controls

  - Provide an opt-out; when opted out, do not generate or send the ID; clear storage; operate in a non-identifying state.
  - Provide a “Reset anonymous session” action to force rotation.

- Notes
  - If “entire session” is interpreted as a single browser tab/window, sessionStorage-only can be used (no TTL). Our confirmed approach uses localStorage + sliding TTL for short-lived continuity (24h default, 12h optional).

## End-to-end flow

Anonymous chat (not free/pro/enterprise)

1. Client call

- User chats via `/api/chat` or `/api/chat/stream` (enhanced auth allows anonymous). These do not persist messages/sessions to DB.

2. Generate/keep anonymous_session_id

- If missing, client creates `anonymous_session_id` (crypto.randomUUID()), stores in `localStorage`, and reuses it.

3. After response completes

- Client POSTs to `/api/usage/anonymous` with a minimal payload: `{ anonymous_session_id, events: [{ type, timestamp, model, input_tokens|output_tokens, elapsed_ms }] }`.
- Endpoint protection: tiered rate limit only (`tierC`); no auth; strict validation + size caps.

4. Server ingestion (RPC)

- Handler calls `public.ingest_anonymous_usage(payload)` (SECURITY DEFINER).
- DB upserts:
  - `public.anonymous_usage_daily` (per-session/day messages/tokens/latency)
  - `public.anonymous_model_usage_daily` (per-model/day prompt/completion tokens, assistant_messages, generation_ms)
- Pricing snapshot: reads `public.model_access` to snapshot unit prices; increments `estimated_cost` at ingestion time.
- RLS: admin-only SELECT; direct writes denied.

5. Admin analytics

- Admin endpoint queries `public.get_anonymous_model_costs(start, end, granularity)` and shows anonymous totals separately from authenticated totals. No user-facing changes.

6. Retention

- Scheduler/ops invokes `public.cleanup_anonymous_usage(30)` daily to purge rows older than 30 days.

Authenticated chat (free/pro/enterprise)

1. Client call

- User persists via `/api/chat/messages` (protected auth middleware).

2. DB pipeline (unchanged)

- Triggers update `chat_sessions` stats and call `track_user_usage(...)` to maintain `public.user_usage_daily`.
- Per-assistant-message cost snapshot goes into `public.message_token_costs`; `user_usage_daily.estimated_cost` updated by delta.
- Admin/user analytics use `user_model_costs_daily` and `public.get_global_model_costs(...)`.

Key guarantees (v1)

- No PII in anonymous tables; no `user_id`; no linking in v1.
- Anonymous usage is admin-only and displayed separately; chat performance is unaffected (best-effort logging after response).

## Phases

- [ ] Phase 1 — Schema & API
  - [x] Add table for anonymous usage aggregates (by day, session).
  - [x] RPC to ingest anonymous usage in batches (SECURITY DEFINER; anon+authenticated EXECUTE only).
  - [x] Public API endpoint `/api/usage/anonymous` with tiered rate limit to call RPC.
  - [x] Extend admin usage endpoint to include anonymous aggregates (fields: `anonymous_messages`, `anonymous_tokens`).
  - [ ] User verification: rows appear in `anonymous_usage_daily` without PII; admin Usage tab shows anonymous fields.
- [ ] Phase 2 — Client emitters
  - [ ] Add lightweight client to emit metrics for anonymous sessions.
  - [ ] User verification: metrics sent only when not authenticated.
- [ ] Phase 3 — Link on auth (optional)
  - [ ] On signup/login, optionally link last N hours of anonymous metrics to the new user, or keep separate per policy.
  - [ ] User verification: linkage works as designed.
- [ ] Phase 4 — Docs
  - [ ] `/docs/analytics/anonymous-usage.md` + privacy statement.

## Clarifying questions

1. Do we want to ever link anonymous stats to a later account? If so, what window?
2. What exact metrics to collect for anonymous? Minimal set?
3. Retention period and deletion policy?

## Risks

- Privacy; ensure no content or PII is logged.
- Abuse; enforce rate limits and size caps.

## Success criteria

## Approaches evaluated

1. Store anonymous activity in the existing tables by making `user_id` nullable and revising RLS/triggers.

   - Pros: Single pipeline; fewer new APIs.
   - Cons: High risk to RLS and invariants; `message_token_costs.user_id` NOT NULL and all analytics assume user scope; triggers and policies would need overhaul; risk of data leakage and bugs.

2. Parallel anonymous aggregates keyed by `anonymous_session_id` only (this patch).
   - Pros: No changes to existing authenticated flows; very low PII risk (no user_id); clear separation; easy retention policy; safe to expose only via admin.
   - Cons: Admin charts need to merge two sources; no per-user view of anon usage (by design).

Recommendation: Approach 2 (parallel aggregates). It preserves current guarantees, minimizes changes, and keeps privacy clear.

## Proposed Phase 1 (pending sign-off)

Scope: Implement anonymous usage as separate aggregates only; no linking in v1; admin-only visibility; keep user-facing analytics unchanged.

- Data model (aggregates)

  - Table: anonymous_usage_daily(anonymous_session_id text, usage_date date, messages_sent int, messages_received int, input_tokens int, output_tokens int, models_used int, generation_ms bigint, created_at timestamptz, updated_at timestamptz).
  - Unique: (anonymous_session_id, usage_date).
  - RLS: admin-only SELECT; no user_id stored; no content/PII stored.

- Ingestion RPC

  - Function: ingest_anonymous_usage(payload jsonb) SECURITY DEFINER; EXECUTE granted to anon+authenticated roles.
  - Validates payload and upserts via track_anonymous_usage(...).
  - Idempotent per (anonymous_session_id, usage_date).

- Public endpoint

  - POST /api/usage/anonymous (rate-limited: tierC). Middleware: tiered rate limit only; no auth required.
  - Calls RPC with minimal validated payload; enforces size caps; returns { ok: true }.

- Admin analytics inclusion

  - Extend /api/admin/analytics/usage to include anonymous_messages and anonymous_tokens as separate fields, not merged with user totals.
  - No changes to user-facing endpoints (/api/usage/\*) or pages.

- Retention

  - Policy: 30 days retention for anonymous_usage_daily (to be enforced via a scheduled job during implementation).

- Out of scope (v1)
  - Client emitter wiring, UI polish beyond admin columns, and any linking/de-dup RPCs.

---

## Step 4 — Recommendation and plan (no code yet)

Recommendation: Proceed with Approach 2, completing gaps with a linking workflow and client emitter.

Phased plan (implementation pending approval):

1. Finalize schema for de-dup

   - Add linked_user_id UUID NULL, linked_at TIMESTAMPTZ, and optional linked_session_ids TEXT[] to anonymous_usage_daily.
   - Add RPC link_anonymous_usage(p_session_id text, p_user_id uuid, p_since_ts timestamptz default null) that:
     - Finds rows by anonymous_session_id (and optional date window)
     - Sets linked_user_id, linked_at
     - Returns counts linked for telemetry
   - Update admin usage endpoint to exclude linked rows from “anonymous\_\*” fields.

2. Client emitter for anonymous

   - Generate/store anonymous_session_id in localStorage
   - Emit events on message send and assistant finalization; debounce and POST to /api/usage/anonymous
   - Only active when not authenticated

3. Sync flow de-dup

   - Extend /api/chat/sync to accept anonymous_session_id (optional)
   - If provided, call link_anonymous_usage before inserts; record linkage in logs

4. Docs and verification
   - Update /docs/analytics/anonymous-usage.md with privacy/retention statement and linking behavior
   - Admin Usage tab expectations: new columns already supported; ensure linked rows excluded

Open questions (confirm before implementation): None for v1. All linking work is deferred.

---

## Decision summary (final — analysis only)

- Chosen approach: Approach 2 (separate anonymous aggregates), keep anonymous data fully separate from user-facing analytics in v1.
- Linking: Not in v1. We will not link anonymous aggregates to user accounts initially; this avoids double-counting risks and any policy ambiguity. If needed later, prefer "link-and-exclude" via a lightweight RPC (out of scope for v1).
- Retention (anon aggregates): 30 days (suggested) for admin-only trend visibility; can be tuned during implementation.
- Admin display: Anonymous totals in a separate section/columns, not merged with user totals.
- Scope control: No runtime code or schema changes until sign-off. This document captures the analysis and decision only.

### Ready for sign-off

- [ ] Approve Approach 2 (separate aggregates), no linking in v1
  > - [ ] Approve anonymous retention window: 30 days (adjustable)
- [ ] Approve admin-only display as a separate section/columns
- [ ] Green-light Phase 1 implementation (DB objects + public ingest API + admin endpoint adjustments), behind standard auth/rate-limit middleware

If approved, we will implement Phase 1 only and provide a verification guide before proceeding to any optional linking work.
