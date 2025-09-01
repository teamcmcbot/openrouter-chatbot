# Admin analytics: data map, dashboards, and anon strategy

## Summary

Goal: design an admin-only analytics suite using existing schema. Cover usage, cost, performance, reliability, feature adoption, growth, and model portfolio views. Also propose a path to capture large anonymous traffic safely and cheaply.

## What data we already have (from `/database/schema`)

Tables/views/functions directly usable today:

- Users & tiers

  - `public.profiles` (id, email, subscription_tier, account_type, credits, created_at, last_active, usage_stats JSONB)
  - RLS helper: `public.is_admin(uuid)`
  - View: `public.api_user_summary` (joins today usage + total sessions)

- Usage aggregation (per user/day)

  - `public.user_usage_daily` (messages_sent/received, tokens in/out/total, sessions_created, generation_ms, estimated_cost, models_used JSONB)
  - Maintained by triggers: `public.track_user_usage`, `public.track_session_creation`, and message/session triggers in chat schema

- Conversations & content signals

  - `public.chat_sessions` (message_count, total_tokens, last_model, timestamps) — session-level slice and recency/activity
  - `public.chat_messages` (role, content_type, model, input/output/total tokens, elapsed_ms, error_message, is_streaming, has_websearch, websearch_result_count, has_attachments, attachment_count, user_message_id, completion_id, reasoning fields)
  - `public.chat_attachments` (image size/type, user/session linkage, status)
  - `public.chat_message_annotations` (url citations) — content enrichment count per msg

- Cost & pricing

  - `public.message_token_costs` (per assistant message costs with prompt/completion/image/websearch costs, elapsed_ms, pricing snapshot)
  - View: `public.user_model_costs_daily` (per user/day/model costs/tokens)
  - Function: `public.get_global_model_costs(start_date, end_date, granularity)` — admin-only global aggregation by day/week/month
  - `public.model_access` (catalog with pricing fields and tier flags)
  - `public.model_sync_log` and views `public.v_sync_stats`, `public.v_model_counts_public`, `public.v_model_recent_activity_admin`

- System-wide stats and events
  - `public.system_stats` (daily rollups: users, messages, tokens, response time, error rate, db size) — can be scheduled to populate
  - `public.admin_audit_log` (admin/system actions)
  - `public.cta_events` + `public.ingest_cta_event` (anon or auth CTA clicks; has `ip_hash` and `is_authenticated`)

Indexes are present on user_id/date, timestamps, tokens, model_id, etc., enabling efficient aggregations with time filters.

## Admin dashboards we can build now

1. Executive overview (last 7/30 days)

- KPIs: Active users, New users, Sessions, Messages, Total tokens, Est. cost, Avg/95p response time, Error rate
- Sources: `user_usage_daily`, `message_token_costs`, `chat_messages` (errors), `system_stats` (optional)
- Cuts: By subscription tier (`profiles.subscription_tier`), by day/week

2. Cost & tokens

- Charts: Cost over time (stacked by model), Top models by spend, Cost per 1K tokens, Cost/user and Cost/session distribution
- Sources: `message_token_costs`, `user_model_costs_daily`, `get_global_model_costs`
- Filters: date range, model, tier

3. Performance & reliability

- Charts: p50/p95 `elapsed_ms` by model and by tier; Error rate and top error reasons; Streaming vs non-streaming latency
- Sources: `chat_messages` (elapsed_ms, error_message, is_streaming), `message_token_costs.elapsed_ms`
- Note: exclude rows with non-empty `error_message` from latency aggregates

4. Usage & engagement

- Charts: Messages/day by role; Sessions created/day; DAU/WAU/MAU; Retention cohorts (first session week)
- Sources: `user_usage_daily`, `chat_sessions` (created_at), `profiles` (created_at, last_active)

5. Feature adoption

- Charts: % messages with `has_websearch=true`; avg `websearch_result_count`; % with `has_attachments`; % with `is_streaming`; % assistant msgs with `reasoning`
- Sources: `chat_messages` fields and `chat_attachments`

6. Model portfolio health

- Tables/charts: Active/inactive/disabled counts; Recent changes; Sync success rate and average duration
- Sources: `model_access` + views `v_model_counts_public`, `v_model_recent_activity_admin`, and `v_sync_stats`

7. Funnel & growth (top-of-funnel; anon-supported)

- Charts: CTA clicks by page/cta over time; conversion rates (anon -> signup -> first session)
- Sources: `cta_events` (anon+auth), `profiles`, `chat_sessions`

## Known gaps and quick wins

- Anonymous messages are not stored in `chat_*`, so usage/cost/perf analytics miss anon traffic entirely.
- We do have anon-friendly `cta_events` with `ip_hash` and `is_authenticated`, which enables top-of-funnel analysis but not chat usage.
- Quick win: ensure `user_usage_daily.estimated_cost` is up to date via `message_token_costs` deltas (already handled); expose admin API aggregations that call `get_global_model_costs` directly.

## Strategy for anonymous usage at scale (no PII, low cost)

Problem: Anonymous chat traffic will be large; we need signals without storing content or creating user records.

Constraints

- Respect privacy: no raw content, no IP storage; use salted `ip_hash` or short-lived `session_key` cookie.
- Keep storage small and queries fast; prefer daily rollups.
- Preserve continuity if anon later signs up (optional linkage).

Proposed minimal schema (phaseable)

- Keep current DB unchanged for now. Add one new aggregate table later if needed:
  - `anon_usage_daily(session_bucket text, usage_date date, messages_user int, messages_assistant int, input_tokens int, output_tokens int, total_tokens int, sessions_started int, generation_ms bigint, model_breakdown jsonb, websearch_counts jsonb, attachment_counts jsonb, error_counts jsonb, est_cost numeric, created_at timestamptz, updated_at timestamptz, unique(session_bucket, usage_date))`
  - session_bucket examples: deterministic hash of cookie + coarse time bucket (e.g., day) or simply 'all' to avoid user-level granularity.

Collection options

- Option A: Server-side counters only (recommended to start)

  - During chat API handling for anon requests, increment Redis counters keyed by `{day}:{model}:{metric}` and push only daily rollups into Postgres as aggregates (no per-message rows).
  - Pros: very cheap, no PII, low write amp. Cons: no per-session drilldown.

- Option B: Cookie-scoped pseudo-IDs with short TTL

  - Set `anon_session_id` cookie (UUIDv4), store ephemeral aggregates keyed by that in Redis. Nightly, upsert to `anon_usage_daily` with coarse bucketing. If user signs up, optional best-effort merge via `anon_session_id` seen before signup time.
  - Pros: allows unique anon sessions estimates. Cons: slightly higher complexity.

- Option C: Client-only telemetry (fallback)
  - Send `ingest_cta_event`-like pings for anon chat interactions. Rough, but no server token numbers unless the server echoes counts.

Privacy/Security

- Salted IP hash or cookie UUID only; never store raw IPs. No message content. Apply tiered rate-limiting pools already documented.

Rollups & reporting

- Build admin views mirroring `user_usage_daily` but prefixed “Anon”. Merge anon+auth for global toplines, keep separate for funnels.

## Admin APIs to expose (no code yet, design only)

- Costs: call `public.get_global_model_costs(start, end, granularity)` with admin auth; return series + model breakdown.
- Usage: aggregate from `user_usage_daily` by date and tier; join `api_user_summary` for today snapshots.
- Performance: percentiles on `chat_messages.elapsed_ms` for assistant messages without errors; group by model and tier.
- Reliability: error rate = errors / total assistant messages per period; group by model and tier (errors where `error_message` not null/empty).
- Feature adoption: counts of `has_websearch`, `has_attachments`, `is_streaming`, and non-null `reasoning`.
- Funnels: `cta_events` -> `profiles.created_at` -> first `chat_sessions.created_at`.

## Phases & verification

- [ ] Phase 1 — Wire admin aggregations (DB-first)

  - [ ] Validate tables/views listed above and document JSON shapes for endpoints.
  - [ ] Define endpoints that only wrap SQL/views (no heavy logic) and enforce `withTierAuth('enterprise')` or admin check.
  - [ ] User verification: share 3 sample payloads (Overview, Costs, Performance) from local seed data.

- [ ] Phase 2 — UI panels (read-only)

  - [ ] Add top-level tabs: Overview, Costs, Performance, Reliability, Features, Models, Growth.
  - [ ] Implement charts with date range, tier, model filters.
  - [ ] User verification: screenshots + values match SQL spot-checks.

- [ ] Phase 3 — Anonymous rollups (optional pilot)

  - [ ] Start with Redis per-day counters (Option A). No schema change yet; show “Anon Overview” panel from Redis snapshot.
  - [ ] If needed, add `anon_usage_daily` and nightly job to persist rollups.
  - [ ] User verification: verify totals align with infra logs and rate-limit pools.

- [ ] Phase 4 — Docs
  - [ ] `/docs/admin/analytics.md` + data dictionary. Include privacy notes, retention, and SLOs.

## Open questions (please confirm)

1. Initial KPIs to prioritize on Overview? (my pick: Active users, Sessions, Messages, Tokens, Est. cost, p95 latency, Error rate)
2. Access control: restrict to `account_type='admin'` only, or allow `subscription_tier='enterprise'` admins as well?
3. Retention: how long to keep detailed `message_token_costs` vs daily rollups? (e.g., 90 days detail, 1 year rollup)
4. Anonymous: acceptable approach to per-day counters in Redis (Option A) vs adding `anon_usage_daily` table now?
5. Timezone standard for charts — UTC or user-selected?

## Risks & mitigations

- High cardinality queries: stick to daily granularity, leverage existing indexes, and prefer pre-aggregated views/functions.
- RLS and auth: always use standardized middleware for admin endpoints; avoid manual checks.
- Cost accuracy: `message_token_costs` already delta-updates `user_usage_daily.estimated_cost`; keep OpenRouter pricing synced via `model_access`.

## Success criteria

- Admins can visualize accurate usage, cost, performance, reliability, features, and growth with date/tier/model filters, including anon toplines (pilot). No PII leakage and queries return under ~1s on 30-day windows.

---

## Implementation handover plan (detailed)

UI structure (Phase 1–2)

- Analytics sub-tabs: Overview, Costs, Performance (Phase 1). Add Usage and Models (Phase 2). Reliability/Features/Growth (Phase 3).
- Global filters bar: date range (default last 7 days, UTC), model (optional), tier (optional in Phase 1).

Auth and rate-limiting

- Wrap all handlers with standardized middleware:
  - `withProtectedAuth(withTieredRateLimit(handler, { tier: "tierD" }))`
  - Gate on admin: `authContext.profile?.account_type === 'admin'`
- No service role required. Use admin-readable tables/views/functions and SECURITY DEFINER functions for cross-user aggregates.

Caching

- Add a 30–60s in-memory cache per endpoint (keyed by query params) to reduce load.
- Optionally persist to `system_cache` (key: `admin:analytics:${endpoint}:${hash(params)}`) with a short `expires_at`.

### Phase 1 endpoints (no DB changes)

1. GET /api/admin/analytics/overview

- Query params: `start` (ISO date), `end` (ISO date), `model?`, `tier?`
- Data sources:
  - `message_token_costs` (totals, distinct users, sessions, p95 latency)
  - `profiles` (new users via created_at)
- Example response shape:
  {
  "range": { "start": "2025-08-01", "end": "2025-08-07" },
  "kpis": {
  "active_users": 123,
  "new_users": 45,
  "sessions": 560,
  "assistant_messages": 980,
  "total_tokens": 431250,
  "estimated_cost": 12.3456,
  "latency_ms": { "p50": 420, "p95": 1800 }
  },
  "series": {
  "cost_per_day": [{ "date": "2025-08-01", "total_cost": 1.23 }, ...],
  "assistant_messages_per_day": [{ "date": "2025-08-01", "count": 120 }, ...]
  }
  }
- Notes:
  - Distinct users = COUNT(DISTINCT user_id) from `message_token_costs` in range.
  - Distinct sessions = COUNT(DISTINCT session_id) from `message_token_costs`.
  - p50/p95 via `percentile_cont` on `elapsed_ms` where `elapsed_ms` > 0.

2. GET /api/admin/analytics/costs

- Query params: `start`, `end`, `granularity` (day|week|month)
- Data source: `public.get_global_model_costs(start, end, granularity)`
- Example response:
  {
  "granularity": "day",
  "series": [
  {
  "usage_period": "2025-08-01",
  "model_id": "deepseek/deepseek-r1-0528:free",
  "prompt_tokens": 10000,
  "completion_tokens": 12000,
  "total_tokens": 22000,
  "total_cost": 1.2345,
  "assistant_messages": 300,
  "distinct_users": 40
  }
  ]
  }

3. GET /api/admin/analytics/performance

- Query params: `start`, `end`, `model?`, `tier?`
- Data source: `message_token_costs.elapsed_ms` grouped by model (join to profiles on user_id if tier filter used)
- Example response:
  {
  "by_model": [
  { "model_id": "deepseek/deepseek-r1-0528:free", "p50": 380, "p95": 1500, "count": 1200 },
  { "model_id": "google/gemini-2.0-flash-exp:free", "p50": 220, "p95": 900, "count": 800 }
  ]
  }

UI wiring (Phase 1)

- Overview: KPI tiles from `/overview`; stacked area (cost_per_day); line (assistant_messages_per_day)
- Costs: stacked area by model using `/costs` series; top models table (aggregate client-side)
- Performance: bar/line chart from `/performance` by model; allow model filter

### Phase 2 endpoints (add definer functions for RLS-safe aggregates)

Add SECURITY DEFINER functions (admin-only) in SQL patches (no RLS policy changes):

- `public.get_admin_usage_aggregates(p_start date, p_end date, p_granularity text DEFAULT 'day', p_tier text DEFAULT NULL)`
  - Aggregates `user_usage_daily` by period and optionally by tier (join profiles)
  - Returns messages_sent, messages_received, sessions_created, tokens_in, tokens_out, total_tokens

Endpoints:

- GET /api/admin/analytics/usage → calls `get_admin_usage_aggregates`
- GET /api/admin/analytics/models → reads views: `v_model_counts_public`, `v_model_recent_activity_admin`, `v_sync_stats`

UI wiring (Phase 2)

- Usage: dual-series messages by role; sessions/day; tokens/day; DAU = DISTINCT users from `message_token_costs`
- Models: counts by status; recent activity table; last sync KPIs

### Phase 3 endpoints (reliability, features, growth)

Add SECURITY DEFINER functions:

- `public.get_admin_error_stats(p_start date, p_end date, p_group_by text)`
  - From `chat_messages`: assistant messages vs errors (error_message not null/empty), optional group by model/tier/day
- `public.get_admin_feature_adoption(p_start date, p_end date, p_group_by text)`
  - From `chat_messages` (+ `chat_attachments`), compute rates for websearch, attachments, streaming, reasoning
- `public.get_admin_funnel(p_start date, p_end date)`
  - From `cta_events`, `profiles.created_at`, first `chat_sessions.created_at`; returns funnel counts and rates

Endpoints:

- GET /api/admin/analytics/reliability → `get_admin_error_stats`
- GET /api/admin/analytics/features → `get_admin_feature_adoption`
- GET /api/admin/analytics/growth → `get_admin_funnel`

UI wiring (Phase 3)

- Reliability: error trend, error by model, top reasons
- Features: adoption percentages and counts
- Growth: CTA→Signup→First session funnel with rates

### Testing & verification

Automated tests

- Handlers: mock admin/non-admin contexts; assert 401/403 vs 200; validate query param validation
- Data: mock DB calls or use minimal seed; verify shapes match contracts above
- Components: mock router/auth; snapshot empty/loading/error; value rendering checks

Manual checks

- Overview: for a 2–3 day range, validate KPI totals with direct SQL on `message_token_costs` and `profiles`
- Costs: compare chart totals with `get_global_model_costs` results
- Performance: spot-check percentile results against a direct `percentile_cont` query
- Reliability/Features (later): validate a 1-hour window with direct SQL filters

Performance notes

- Time-bounded queries with indexes should serve <1s for 30-day ranges; add optional indexes if slow:
  - `message_token_costs(message_timestamp, model_id)`
  - `chat_messages(message_timestamp) WHERE error_message IS NOT NULL AND error_message <> ''`

Deployment/ops

- Ensure tiered rate-limiting tiers are configured (Tier D used here)
- If enabling `system_stats`, schedule a daily job; otherwise derive metrics on the fly

---

## Manual test plans (admin analytics UI)

The following checklists validate each Analytics tab end-to-end. For each plan:

- Use an Admin account (profile.account_type = 'admin').
- Test three ranges: Today, Last 7 days, Last 30 days.
- Confirm API calls return 200 and payload matches expected shape.
- Validate UI renders KPIs/charts/tables accordingly and no error toasts.
- Note edge cases and gating behavior.

### 1) Overview

Scope: KPIs + cost per day + assistant messages per day.

Setup

- Ensure there’s at least some data in the chosen windows (messages, costs).

Steps (repeat for Today, 7D, 30D)

- Navigate: /admin → Analytics → Overview.
- Select range from filter bar (Today/7D/30D).
- Observe loading state, then final KPIs and charts.

Verify on screen

- KPI tiles visible: Active users, New users, Sessions, Assistant messages, Total tokens, Est. cost, Latency p50/p95.
- Cost per day chart renders with >= 1 data point when data exists.
- Assistant messages/day line renders with >= 1 data point when data exists.
- Empty-state messaging appears when no data.

Verify API

- Endpoint: GET /api/admin/analytics/overview?start=…&end=…&g=g
- Status: 200; no rate-limit or auth errors.
- JSON keys:
  - range.start, range.end
  - kpis.active_users, kpis.new_users, kpis.sessions, kpis.assistant_messages, kpis.total_tokens, kpis.estimated_cost
  - kpis.latency_ms.p50, kpis.latency_ms.p95
  - series.cost_per_day[] with date, total_cost
  - series.assistant_messages_per_day[] with date, count

Edge cases

- No data → all KPIs should show 0 and charts show empty-state.
- Large windows (30D) should still render within ~1s.
- Admin gating: Non-admin should receive 403.

### 2) Costs

Scope: cost/time series stacked by model; totals and top models.

Steps (repeat for Today, 7D, 30D)

- Navigate: /admin → Analytics → Costs.
- Select range and confirm stacked chart renders.

Verify on screen

- Stacked chart by model visible; legend shows top models.
- Totals match legend sum for a given day (spot-check 1–2 days).
- Table/cards of top models show spend and tokens where present.

Verify API

- Endpoint: GET /api/admin/analytics/costs?start=…&end=…&granularity=day
- Status: 200.
- JSON keys:
  - granularity = 'day'
  - series[] items with usage_period (date), model_id, prompt_tokens, completion_tokens, total_tokens, total_cost, assistant_messages, distinct_users

Edge cases

- If no costs, chart shows empty-state; totals are 0.
- Performance: large model list is truncated to top N in UI; rest grouped as “Other”.
- Admin gating and rate limiting enforced.

### 3) Performance

Scope: latency percentiles and counts by model.

Steps (repeat for Today, 7D, 30D)

- Navigate: /admin → Analytics → Performance.
- Select range; verify chart/table of p50/p95 by model.

Verify on screen

- Chart renders p50/p95 per model (bar/line as implemented).
- Rows exclude errored messages from latency aggregates.
- A total/average row is present if provided by UI.

Verify API

- Endpoint: GET /api/admin/analytics/performance?start=…&end=…
- Status: 200.
- JSON keys:
  - by_model[] items include model_id, p50, p95, count

Edge cases

- If elapsed_ms is sparse, percentiles still compute or UI shows N/A.
- Models with only errors should not skew latency; ensure exclusion.
- Admin gating and rate limiting enforced.

### 4) Usage

Scope: daily usage aggregates: messages, tokens, sessions, DAU.

Steps (repeat for Today, 7D, 30D)

- Navigate: /admin → Analytics → Usage.
- Select range; verify charts update.

Verify on screen

- Lines/bars for active_users, messages, tokens, sessions per day.
- Totals/KPIs reflect the selected window.

Verify API

- Endpoint: GET /api/admin/analytics/usage?start=…&end=…&g=day
- Status: 200.
- JSON keys:
  - range.start, range.end
  - totals: messages, total_tokens, sessions (if provided)
  - series[] per day with active_users, messages, tokens

Edge cases

- If user_usage_daily empty for range, show empty-state.
- Distinct users calculation aligns with DAU when data present.
- Admin gating and rate limiting enforced.

### 5) Models

Scope: portfolio health: counts and recent activity.

Steps (repeat for Today, 7D, 30D)

- Navigate: /admin → Analytics → Models.
- Select range; verify counts and activity table update.

Verify on screen

- Cards show total active/inactive/disabled as applicable.
- Recent activity table lists adds/updates/removals with timestamps.

Verify API

- Endpoint: GET /api/admin/analytics/models?start=…&end=…
- Status: 200.
- JSON keys:
  - counts: from v_model_counts_public (e.g., active, inactive, disabled)
  - recent_activity[]: from v_model_recent_activity_admin (id, model_id, action, at least a timestamp field)
  - sync_stats (optional): from v_sync_stats (last_run_at, success rates)

Edge cases

- If no changes in window, recent_activity is empty; counts still display.
- Admin gating and rate limiting enforced.

General validation

- All admin analytics endpoints must be wrapped with standardized auth + tiered rate limiting.
- Response times: under ~1s for 30D windows on seeded/staging data.
- Error handling: UI shows friendly empty/error states; no unhandled exceptions in console.
