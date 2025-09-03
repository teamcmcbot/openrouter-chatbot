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
- Outputs: server-side aggregated records keyed by `anon_hash` (HMAC of the `anonymous_session_id`).
- Errors: rate limit abuse; ensure minimal data and no PII.

## API and DB flow (v1)

Goal: On every anonymous chat completion, call a backend API to persist success or error analytics via RPCs. Keep data aggregate-only for usage; store error events minimally for admin diagnostics.

Endpoints

- POST `/api/chat/anonymous` (public, tierC)
  - Body: { anonymous_session_id, model, prompt_tokens, completion_tokens, elapsed_ms, features?: { reasoning_tokens?, image_units?, websearch_results? }, timestamp }
  - Server: derive anon_hash (HMAC), validate caps, call RPC public.ingest_anonymous_usage(payload)
  - Effect: upsert `anonymous_usage_daily` and `anonymous_model_usage_daily`; snapshot unit prices from model_access; compute estimated_cost (tokens ± future features)
- POST `/api/chat/anonymous/error` (public, tierC)
  - Body: { anonymous_session_id, model, timestamp, http_status?, error_code?, error_message?, provider?, completion_id? }
  - Server: derive anon_hash, sanitize+truncate error_message (e.g., 300 chars), call RPC public.ingest_anonymous_error(payload)
  - Effect: insert into `anonymous_error_events` (append-only). Admins can inspect errors without user content.

Data captured

- Success: model, prompt_tokens, completion_tokens, elapsed_ms, assistant_messages += 1, optional features (reasoning_tokens, image_units, websearch_results) default 0 for now; unit prices snapshot; estimated_cost stored.
- Error: timestamp, model, http_status, error_code, truncated error_message, provider, completion_id (optional), anon_hash. No chat content stored.

Admin queries

- Costs/usage: use get_anonymous_model_costs(start, end, granularity) and show alongside authenticated totals.
- Errors: add get_anonymous_errors(start, end, limit, model?) to fetch recent anon errors, and a daily rollup view for counts by model/date.

Retention

- Usage tables: 30 days via cleanup_anonymous_usage(30)
- Error events: 30 days via cleanup_anonymous_errors(30)

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

3. Completion

- On success: POST /api/chat/anonymous with model/tokens/elapsed_ms (+ future feature fields) for that turn.
- On error: POST /api/chat/anonymous/error with minimal error payload for admin diagnostics.

4. Server ingestion (RPC)

- Success: public.ingest_anonymous_usage(payload) upserts anonymous_usage_daily and anonymous_model_usage_daily with pricing snapshot and estimated_cost.
- Error: public.ingest_anonymous_error(payload) inserts an event row; optional daily error counts surface via view.

5. Admin analytics

- Costs/usage via get_anonymous_model_costs; errors via get_anonymous_errors and/or daily rollups. Anonymous shown separately from authenticated.

6. Retention

- Daily purge jobs keep only last 30 days.

## Phases

- [ ] Phase 1 — Schema & API
  - [x] Add tables for anonymous usage aggregates (by day, session) and per-model aggregates (by day, model).
  - [x] RPC to ingest anonymous usage (SECURITY DEFINER; anon+authenticated EXECUTE only).
  - [x] Public API endpoint /api/chat/anonymous with tiered rate limit to call RPC.
  - [ ] Add table anonymous_error_events + RPC ingest_anonymous_error + API /api/chat/anonymous/error.
  - [ ] Admin helper get_anonymous_errors(start, end, limit[, model]) and daily error rollup view.
  - [ ] User verification: rows appear; admin Usage and Errors tabs show expected fields.
- [ ] Phase 2 — Client emitters
  - [ ] Emit success metrics on assistant finalize; emit error payload on failure paths; only when not authenticated.
- [ ] Phase 3 — Link on auth (optional)
  - [ ] Conversation-scoped adjustments (sidecar) on /api/chat/sync to avoid double counting.
- [ ] Phase 4 — Docs
  - [ ] /docs/analytics/anonymous-usage.md + privacy statement.

## Risks

- Privacy: ensure error messages are sanitized and truncated; no chat content stored.
- Abuse: enforce rate limits and payload size caps on both endpoints.

## Database changes (DDL summary)

Tables

| Table                              | Purpose                                                                          | Primary/Unique Keys         |
| ---------------------------------- | -------------------------------------------------------------------------------- | --------------------------- |
| public.anonymous_usage_daily       | Per-session daily aggregates for anonymous activity (messages/tokens/generation) | PK: (anon_hash, usage_date) |
| public.anonymous_model_usage_daily | Per-model daily token aggregates and cost snapshot for anonymous usage           | PK: (usage_date, model_id)  |
| public.anonymous_error_events      | Append-only anonymous error events for admin diagnostics                         | PK: id (uuid)               |

public.anonymous_usage_daily columns

| Column            | Type        | Notes                                                           |
| ----------------- | ----------- | --------------------------------------------------------------- |
| anon_hash         | text        | Derived HMAC of session id; only stored key for anonymous joins |
| usage_date        | date        | UTC day bucket                                                  |
| messages_sent     | integer     | Count of user messages                                          |
| messages_received | integer     | Count of assistant messages                                     |
| input_tokens      | integer     | Sum of prompt tokens                                            |
| output_tokens     | integer     | Sum of completion tokens                                        |
| total_tokens      | integer     | Generated or computed as input+output                           |
| generation_ms     | bigint      | Sum of assistant generation time                                |
| created_at        | timestamptz | Default now()                                                   |
| updated_at        | timestamptz | Default now(), maintained on upsert                             |

public.anonymous_model_usage_daily columns

| Column                | Type          | Notes                                    |
| --------------------- | ------------- | ---------------------------------------- |
| usage_date            | date          | UTC day bucket                           |
| model_id              | varchar(100)  | Model identifier                         |
| prompt_tokens         | bigint        | Sum of prompt tokens                     |
| completion_tokens     | bigint        | Sum of completion tokens                 |
| total_tokens          | bigint        | Generated always as prompt+completion    |
| assistant_messages    | bigint        | Assistant message count                  |
| generation_ms         | bigint        | Sum generation latency                   |
| prompt_unit_price     | numeric(12,8) | Snapshot at ingestion                    |
| completion_unit_price | numeric(12,8) | Snapshot at ingestion                    |
| image_units           | integer       | Optional, default 0 (future)             |
| image_unit_price      | numeric(12,8) | Optional                                 |
| websearch_results     | integer       | Optional, default 0 (future)             |
| websearch_unit_price  | numeric(12,8) | Optional                                 |
| reasoning_tokens      | bigint        | Optional, default 0 (future)             |
| reasoning_unit_price  | numeric(12,8) | Optional                                 |
| estimated_cost        | numeric(18,6) | Precomputed total cost for the day/model |
| created_at            | timestamptz   | Default now()                            |
| updated_at            | timestamptz   | Default now()                            |

public.anonymous_error_events columns

| Column              | Type         | Notes                                                                          |
| ------------------- | ------------ | ------------------------------------------------------------------------------ |
| id                  | uuid         | Default gen_random_uuid()                                                      |
| anon_hash           | text         | HMAC of anonymous_session_id; avoids storing raw session IDs                   |
| event_timestamp     | timestamptz  | When error occurred                                                            |
| model               | varchar(100) | Model at time of error                                                         |
| http_status         | integer      | Optional HTTP status from provider or API                                      |
| error_code          | text         | Categorical code (e.g., PROVIDER_TIMEOUT)                                      |
| error_message       | text         | Sanitized+truncated (e.g., 300 chars)                                          |
| provider            | text         | e.g., openrouter                                                               |
| provider_request_id | text         | Optional upstream request/trace id                                             |
| completion_id       | text         | Optional; often null for errors before completion is created                   |
| metadata            | jsonb        | Optional upstream payload excerpt (sanitized), e.g., { provider_error: {...} } |
| created_at          | timestamptz  | Default now()                                                                  |

Indexes & RLS (high level)

- Indexes for anon_hash/date and model/date for efficient admin queries
- Admin-only SELECT policies; writes via SECURITY DEFINER RPCs only

## Functions (RPCs and helpers)

| Function                                                                          | Type                   | Purpose                                                                                                                                                     |
| --------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| public.ingest_anonymous_usage(jsonb)                                              | RPC (SECURITY DEFINER) | Validate payload; aggregate to day; upsert anonymous_usage_daily and anonymous_model_usage_daily with pricing snapshot and estimated_cost; clamp/cap values |
| public.get_anonymous_model_costs(start date, end date, granularity text='day')    | Admin helper           | Aggregate anonymous_model_usage_daily into periods; returns tokens, cost, assistant_messages by model                                                       |
| public.cleanup_anonymous_usage(days int=30)                                       | Maintenance            | Delete anonymous\_\* rows older than N days                                                                                                                 |
| public.ingest_anonymous_error(jsonb)                                              | RPC (SECURITY DEFINER) | Validate+sanitize error payload; insert into anonymous_error_events                                                                                         |
| public.get_anonymous_errors(start date, end date, limit int=100, model text=null) | Admin helper           | Return recent error events (sanitized), optionally filtered by model                                                                                        |
| public.cleanup_anonymous_errors(days int=30)                                      | Maintenance            | Delete error events older than N days                                                                                                                       |

## API endpoints

POST /api/chat/anonymous

- Auth: Public, tiered rate limit (Tier C)
- Payload (JSON):
  - anonymous_session_id: string (UUID-ish)
  - model: string
  - prompt_tokens: number (>=0)
  - completion_tokens: number (>=0)
  - elapsed_ms: number (>=0)
  - features?: { reasoning_tokens?: number, image_units?: number, websearch_results?: number }
  - timestamp: ISO8601
- Response: { ok: true }
- Backend logic:
  - Derive anon_hash = HMAC-SHA256(secret, anonymous_session_id)
  - Validate caps (e.g., tokens <= 200k, elapsed_ms <= 5m, features within bounds)
  - Call supabase.rpc('ingest_anonymous_usage', { payload })
  - Do not log raw anonymous_session_id

POST /api/chat/anonymous/error

- Auth: Public, tiered rate limit (Tier C)
- Payload (JSON):
  - anonymous_session_id: string
  - model: string
  - timestamp: ISO8601
  - http_status?: number
  - error_code?: string
  - error_message?: string (will be truncated server-side)
  - provider?: string
  - provider_request_id?: string
  - completion_id?: string (optional; usually absent when errors occur pre-completion)
  - metadata?: object (safe subset of upstream error; sanitized and size-capped)
- Response: { ok: true }
- Backend logic:
  - Derive anon_hash; sanitize & truncate error_message (e.g., 300 chars)
  - Strip secrets from metadata; cap to e.g., 2 KB
  - Call supabase.rpc('ingest_anonymous_error', { payload })
  - No chat content captured; admin-only read path for diagnostics

Rationale: anon_hash vs anonymous_session_id

- We store anon_hash (HMAC of the client’s anonymous_session_id) to avoid persisting raw identifiers and enable periodic key rotation without breaking aggregation semantics. Raw IDs are never logged or stored.
