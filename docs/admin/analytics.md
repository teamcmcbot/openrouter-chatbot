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
