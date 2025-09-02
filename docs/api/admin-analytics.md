# Admin Analytics API

Admin-only analytics endpoints powering the Analytics UI tabs. All routes are protected with `withAdminAuth` and tiered rate limiting (Tier C).

Security

- Auth: Admin profile required (`profile.account_type = 'admin'`)
- Rate limiting: `withTieredRateLimit(..., { tier: 'tierC' })`
- RLS: Aggregations rely on admin-readable views and SECURITY DEFINER functions

Common params

- Range: today, last 7 days, last 30 days
  - Accepts `start` and `end` (ISO date) via shared resolver; most endpoints also accept `?range=today|7d|30d` from UI

---

GET /api/admin/analytics/overview

- Purpose: Executive summary tiles + top models (by spend)
- Sources: `profiles`, `chat_sessions`, `chat_messages`, `user_usage_daily`, `get_global_model_costs`, `v_sync_stats`, `v_model_counts_public`
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
  model_counts: object | null
  }

---

GET /api/admin/analytics/costs

- Purpose: Cost and token stacks by model
- Source: `get_global_model_costs`
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
  stacked_tokens: { models: string[], days: Array<{ date: string, segments: Record<string, number>, others: number, total: number }> }
  }

---

GET /api/admin/analytics/performance

- Purpose: Average latency (excludes zeros) and error totals
- Sources: `message_token_costs`, `get_error_count`
- Query params
  - `start`, `end` (ISO date)
- Response
  {
  ok: boolean,
  range: { start: string, end: string, key?: string },
  overall: { avg_ms: number, error_count: number },
  daily: Array<{ date: string, avg_ms: number, messages: number }>
  }

---

GET /api/admin/analytics/performance/errors

- Purpose: Last N errors for admin debugging
- Source: `get_recent_errors`
- Query params
  - `start`, `end` (ISO date)
  - `limit` (default 100)
- Response
  { ok: true, range: { start: string, end: string }, errors: ErrorRow[] }

ErrorRow

- message_id, session_id, user_id (nullable)
- model (nullable), message_timestamp
- error_message (nullable), completion_id (nullable)
- user_message_id (nullable), elapsed_ms (nullable)

---

GET /api/admin/analytics/usage

- Purpose: DAU/messages/tokens per day
- Sources: `user_model_costs_daily`, `message_token_costs`
- Query params
  - `start`, `end` (ISO date)
- Response
  {
  ok: boolean,
  range: { start: string, end: string, key?: string },
  total_messages: number,
  daily: Array<{ date: string, active_users: number, messages: number, tokens: number }>
  }

Notes

- DAU computed from distinct user_ids in `user_model_costs_daily` per day
- total_messages from `message_token_costs` count in range

---

GET /api/admin/analytics/models

- Purpose: Model portfolio counts + recent activity
- Sources: `v_model_counts_public`, `v_model_sync_activity_daily`
- Query params
  - none
- Response
  {
  ok: boolean,
  counts: { total_count: number, new_count: number, active_count: number, inactive_count: number, disabled_count: number },
  recent: Array<{ day: string, flagged_new: number, flagged_active: number, flagged_inactive: number, flagged_disabled: number }>
  }

Important semantics

- `recent.flagged_*` are grouped by updated_at day and reflect final status among rows updated that day; they do not represent creations
- Known issue: "New" appears as 0 when new rows are flipped to active/disabled same-day. See `backlog/trigger-sync-not-detecting-new-status.md` for fix plan (use created_at for daily added or add transition history)

---

Changelog

- 2025-09-02: First publication of Admin Analytics API docs (overview, costs, performance, usage, models)
