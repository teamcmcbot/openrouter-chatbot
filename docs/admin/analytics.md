# Admin Analytics

This page describes the available analytics aggregates and how to use them in the dashboard.

## Segment toggle (Authenticated vs Anonymous)

- The Analytics dashboard now supports a segment toggle across Overview, Costs, Usage, and Performance tabs.
- Choices: "Authenticated" and "Anonymous". Default is "Authenticated" to preserve prior behavior.
- The toggle switches the data source to the corresponding `segments` field returned by the API.

Anonymous metrics

- Anonymous Usage aggregates privacy-preserving events from unauthenticated sessions.
- Key fields:
  - anon_sessions: estimated distinct anonymous sessions in range/day
  - messages: assistant+user message counts inferred from events
  - total_tokens: assistant output tokens attributed at completion time
  - estimated_cost: based on model pricing joined at ingest time
- No PII is collected; values are grouped by anon_hash and model/day.

Performance errors

- The Performance → Errors list supports a segment query.
- When the toggle is set to Anonymous, the UI fetches with `?segment=anonymous` and displays normalized anonymous errors (no message_id/user_id/session_id).

## Views

- v_sync_stats (admin only)
  - last_success_id, last_success_at
  - success_rate_30d (%), avg_duration_ms_30d
  - runs_24h, failures_24h
- v_model_counts_public (safe for public)
  - new_count, active_count, inactive_count, disabled_count, total_count
- v_model_sync_activity_daily (admin only)
  - day, flagged_new, flagged_active, flagged_inactive, flagged_disabled (last 30 days)

## Usage

- Display v_sync_stats on the Admin Analytics tab as quick KPIs.
- Use v_model_counts_public to show model status distribution (safe to show anywhere).
- Use v_model_sync_activity_daily to chart rolling activity for the last 30 days.

UI wiring notes

- Overview: tiles and top models switch based on segment; Anonymous shows Anon Sessions, Messages 7d, and Est. Cost 7d.
- Costs: totals and stacked charts switch to anonymous when selected.
- Usage: daily series switches; anonymous shows anon_sessions instead of active_users.
- Performance: average latency and error counts switch; Errors list uses the `segment` query parameter.

## Security & RLS

- These are plain views. Enforce admin-only access to admin\_\* views by ensuring RLS on base tables and wrapping data access with admin-only endpoints.
- v_model_counts_public: explicitly set security_invoker=true; SELECT is granted to anon, authenticated, and service_role (public-safe aggregate; no PII).
- Prefer server-side APIs protected with `withAdminAuth` to fetch these metrics.

## Next Steps

- Optionally materialize v_sync_stats for faster reads if the sync log grows.
- Add date-range parameters via server APIs for more flexible charts.

## API endpoints powering the dashboard

- GET `/api/admin/analytics/overview`
- GET `/api/admin/analytics/costs`
- GET `/api/admin/analytics/performance`
- GET `/api/admin/analytics/performance/errors`
- GET `/api/admin/analytics/usage`
- GET `/api/admin/analytics/models`

See details and response shapes in `docs/api/admin-analytics.md`.

## Semantics note on "New" (Models)

`v_model_sync_activity_daily` (now consumed exclusively via the hardened SECURITY DEFINER RPC `get_model_sync_activity_daily(p_days integer)`) aggregates per-day sums from `model_sync_log` over the last N days (default 30): `models_added`, `models_marked_inactive`, `models_reactivated`.

Hardening pattern applied:

- View explicitly marked `security_invoker=true` and direct SELECT revoked from PUBLIC.
- EXECUTE permission granted on the wrapper function only to `authenticated` and `service_role` roles; function enforces admin via `public.is_admin(auth.uid())`.
- API route `/api/admin/analytics/models` calls `supabase.rpc('get_model_sync_activity_daily', { p_days: 30 })` instead of selecting from the view.

Semantics: These counts reflect sync job outcomes (state transitions) rather than final model status at end-of-day. A model added and then disabled same day contributes to `models_added` and may not appear as active in status snapshots.

## Audit log (admin_audit_log)

Admin-only table that records privileged actions (bulk model updates, user updates, manual/scheduled sync triggers). Entries are written via the SECURITY DEFINER function `public.write_admin_audit(...)`.

Fields:

- id (uuid)
- actor_user_id (uuid, nullable) — NULL indicates a system/scheduled action (no human actor)
- action (text)
- target (text)
- payload (jsonb)
- created_at (timestamptz)

Query tips:

- Show recent: `select * from admin_audit_log order by created_at desc limit 100;`
- Filter by actor: `select * from admin_audit_log where actor_user_id = '<uuid>' order by created_at desc;`
- System-only (internal scheduler): `select * from admin_audit_log where actor_user_id is null order by created_at desc;`

RLS:

Changelog

- 2025-09-11: Updated model sync activity section to document hardened RPC usage.
- 2025-09-03: Added segment toggle documentation and anonymous metrics semantics. Updated UI wiring notes and errors list behavior.

- SELECT allowed for admins only via policy "Only admins can read audit logs".
- INSERT denied by RLS; only `write_admin_audit` can insert (SECURITY DEFINER).
