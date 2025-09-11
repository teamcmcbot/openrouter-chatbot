# Admin Analytics API

Admin-only analytics endpoints powering the Analytics UI tabs. All routes are protected with `withAdminAuth` and tiered rate limiting (Tier C).

Security

- Auth: Admin profile required (`profile.account_type = 'admin'`)
- Rate limiting: `withTieredRateLimit(..., { tier: 'tierC' })`
- RLS: Aggregations rely on admin-readable views and SECURITY DEFINER functions

Common params

- Range: today, last 7 days, last 30 days
  - Accepts `start` and `end` (ISO date) via shared resolver; most endpoints also accept `?range=today|7d|30d` from UI

Segments

- All analytics endpoints now return a `segments` object with two keys: `authenticated` and `anonymous`.
- For backward compatibility, the top-level fields are equivalent to the `authenticated` segment.
- The `anonymous` segment aggregates privacy-preserving usage from anonymous sessions and excludes any user-identifying data.

Errors segmenting

- The errors endpoint supports `?segment=anonymous` to fetch anonymous error rows; otherwise it returns authenticated errors.

---

GET /api/admin/analytics/overview

- Purpose: Executive summary tiles + top models (by spend)
- Sources: `profiles`, `chat_sessions`, `chat_messages`, `user_usage_daily`, `get_global_model_costs`, `v_sync_stats`, `v_model_counts_public`, `anonymous_usage_daily`, `anonymous_model_usage_daily`, `get_anonymous_model_costs`
- Query params
  - `start` (ISO date)
  - `end` (ISO date)
- Response
  {
  ok: boolean,
  range: { start: string, end: string, key?: string },
  totals: {
  users: number,
  conversations: number,
  messages: number,
  usage_7d: { total_tokens: number, messages: number },
  costs_7d: { total_cost: number, total_tokens: number, assistant_messages: number }
  },
  top_models: Array<{ model_id: string, total_cost: number, total_tokens: number }>,
  sync: object | null,
  model_counts: object | null,
  segments: {
  authenticated: {
  usage_7d: { total_tokens: number, messages: number },
  costs_7d: { total_cost: number, total_tokens: number, assistant_messages: number },
  top_models: Array<{ model_id: string, total_cost: number, total_tokens: number }>
  },
  anonymous: {
  usage_7d: { total_tokens: number, messages: number, anon_sessions: number },
  costs_7d: { total_cost: number, total_tokens: number, assistant_messages: number },
  top_models: Array<{ model_id: string, total_cost: number, total_tokens: number }>
  }
  }
  }

---

GET /api/admin/analytics/costs

- Purpose: Cost and token stacks by model
- Source: `get_global_model_costs`, `get_anonymous_model_costs`
- Query params
  - `start`, `end` (ISO date)
  - `granularity` or `g` = day|week|month (default: day)
- Response
  {
  ok: boolean,
  range: { start: string, end: string, key?: string },
  granularity: 'day'|'week'|'month',
  totals: { total_cost: number, total_tokens: number, assistant_messages: number, distinct_users_estimate: number },
  stacked_cost: { models: string[], days: Array<{ date: string, segments: Record<string, number>, others: number, total: number }> },
  stacked_tokens: { models: string[], days: Array<{ date: string, segments: Record<string, number>, others: number, total: number }> },
  segments: {
  authenticated: {
  totals: { total_cost: number, total_tokens: number, assistant_messages: number, distinct_users_estimate: number },
  stacked_cost: { models: string[], days: Array<{ date: string, segments: Record<string, number>, others: number, total: number }> },
  stacked_tokens: { models: string[], days: Array<{ date: string, segments: Record<string, number>, others: number, total: number }> }
  },
  anonymous: {
  totals: { total_cost: number, total_tokens: number, assistant_messages: number },
  stacked_cost: { models: string[], days: Array<{ date: string, segments: Record<string, number>, others: number, total: number }> },
  stacked_tokens: { models: string[], days: Array<{ date: string, segments: Record<string, number>, others: number, total: number }> }
  }
  }
  }

---

GET /api/admin/analytics/performance

- Purpose: Average latency (excludes zeros) and error totals
- Sources: `message_token_costs`, `get_error_count`, `anonymous_model_usage_daily`, `get_anonymous_errors`
- Query params
  - `start`, `end` (ISO date)
- Response
  {
  ok: boolean,
  range: { start: string, end: string, key?: string },
  overall: { avg_ms: number, error_count: number },
  daily: Array<{ date: string, avg_ms: number, messages: number }>,
  segments: {
  authenticated: {
  overall: { avg_ms: number, error_count: number },
  daily: Array<{ date: string, avg_ms: number, messages: number }>
  },
  anonymous: {
  overall: { avg_ms: number, error_count: number },
  daily: Array<{ date: string, avg_ms: number, messages: number }>
  }
  }
  }

---

GET /api/admin/analytics/performance/errors

- Purpose: Last N errors for admin debugging
- Source: `get_recent_errors` (authenticated), `get_anonymous_errors` (anonymous)
- Query params
  - `start`, `end` (ISO date)
  - `limit` (default 100)
  - `segment` (optional): `authenticated` (default) | `anonymous`
- Response
  { ok: true, range: { start: string, end: string }, errors: ErrorRow[] }

ErrorRow

- message_id, session_id, user_id (nullable)
- model (nullable), message_timestamp
- error_message (nullable), completion_id (nullable)
- user_message_id (nullable), elapsed_ms (nullable)

Anonymous ErrorRow differences

- message_id, session_id, user_id will be null
- model (nullable), message_timestamp (from event timestamp)
- error_message (nullable), completion_id (nullable)
- provider (nullable), provider_request_id (nullable)
- metadata may include `api_request_id` if upstream data is missing

---

GET /api/admin/analytics/usage

- Purpose: DAU/messages/tokens per day
- Sources: `user_model_costs_daily`, `message_token_costs`, `anonymous_usage_daily`, `anonymous_model_usage_daily`
- Query params
  - `start`, `end` (ISO date)
- Response
  {
  ok: boolean,
  range: { start: string, end: string, key?: string },
  total_messages: number,
  daily: Array<{ date: string, active_users: number, messages: number, tokens: number }>,
  segments: {
  authenticated: {
  total_messages: number,
  daily: Array<{ date: string, active_users: number, messages: number, tokens: number }>
  },
  anonymous: {
  total_messages: number,
  daily: Array<{ date: string, anon_sessions: number, messages: number, tokens: number }>
  }
  }
  }

Notes

- DAU computed from distinct user_ids in `user_model_costs_daily` per day
- total_messages from `message_token_costs` count in range

---

GET /api/admin/analytics/models

- Purpose: Model portfolio counts + recent activity
- Sources: `v_model_counts_public`, `get_model_sync_activity_daily` (wrapper over `v_model_sync_activity_daily`)
- Query params
  - none
- Response
  {
  ok: boolean,
  counts: { total_count: number, new_count: number, active_count: number, inactive_count: number, disabled_count: number },
  recent: Array<{ day: string, models_added: number, models_marked_inactive: number, models_reactivated: number }>
  }

Security notes

- `get_model_sync_activity_daily` is SECURITY DEFINER, enforces admin via `public.is_admin(auth.uid())`, and only `authenticated`/`service_role` have EXECUTE.
- Underlying view has `security_invoker=true`; PUBLIC SELECT revoked.

Important semantics

- `recent` rows reflect sync job transitions (adds, inactive markings, reactivations) over the last N days (default 30) and are not a status snapshot.

---

Changelog

- 2025-09-11: Models endpoint now uses hardened RPC `get_model_sync_activity_daily`; updated recent row field names (models_added, models_marked_inactive, models_reactivated) and added security notes.
- 2025-09-03: Added segmented responses (`segments.authenticated`/`segments.anonymous`) across analytics endpoints; added `?segment=anonymous` to errors endpoint; documented anonymous metrics fields (anon_sessions, total_tokens, estimated costs)
- 2025-09-02: First publication of Admin Analytics API docs (overview, costs, performance, usage, models)
