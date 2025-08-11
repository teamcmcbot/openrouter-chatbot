# Admin Analytics

This page describes the available analytics aggregates and how to use them in the dashboard.

## Views

- v_sync_stats (admin only)
  - last_success_id, last_success_at
  - success_rate_30d (%), avg_duration_ms_30d
  - runs_24h, failures_24h
- v_model_counts_public (safe for public)
  - new_count, active_count, inactive_count, disabled_count, total_count
- v_model_recent_activity_admin (admin only)
  - day, flagged_new, flagged_active, flagged_inactive, flagged_disabled (last 30 days)

## Usage

- Display v_sync_stats on the Admin Analytics tab as quick KPIs.
- Use v_model_counts_public to show model status distribution (safe to show anywhere).
- Use v_model_recent_activity_admin to chart rolling activity for the last 30 days.

## Security & RLS

- These are plain views. Enforce admin-only access to admin\_\* views by ensuring RLS on base tables and wrapping data access with admin-only endpoints.
- Prefer server-side APIs protected with `withAdminAuth` to fetch these metrics.

## Next Steps

- Optionally materialize v_sync_stats for faster reads if the sync log grows.
- Add date-range parameters via server APIs for more flexible charts.

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

- SELECT allowed for admins only via policy "Only admins can read audit logs".
- INSERT denied by RLS; only `write_admin_audit` can insert (SECURITY DEFINER).
