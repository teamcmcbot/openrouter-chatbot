# September 2025 Database Schema Cleanup

Date: 2025-09-10

## Summary

This update removes several unused database objects and simplifies retention maintenance ahead of production hardening.

## Removed Objects

- Tables: `system_cache`, `system_stats`
- View: `api_user_summary`
- Functions: `export_user_data`, `update_user_preferences`, `jsonb_deep_merge`, `sync_profile_from_auth`
- Legacy Chat Functions (removed earlier but noted here for completeness): `get_session_with_messages`, `sync_user_conversations`, `get_user_recent_sessions` (legacy variant)

## Added / Consolidated

- Unified retention function: `cleanup_old_data(days_to_keep INTEGER DEFAULT 90)` now deletes from:
  - `user_activity_log`
  - `user_usage_daily`
  - `anonymous_usage_daily`
  - `anonymous_model_usage_daily`
  - `anonymous_error_events`
  - `message_token_costs`
  - `cta_events`
  - `model_sync_log`

## Rationale

1. Reduce schema surface area to essentials actually queried by the application.
2. Eliminate dead code paths and lower cognitive overhead for future contributors.
3. Centralize data retention logic with a single parameter for consistent compliance.

## Operational Notes

- Run retention manually as needed:
  ```sql
  select public.cleanup_old_data(90);
  ```
- Consider a scheduled job (external scheduler or pg_cron) if automated cleanup becomes necessary.
- GDPR export should be implemented at the API layer by composing direct `SELECT` queries; the removed `export_user_data` function is intentionally not reintroduced.

## Follow-Up Recommendations

- Add lightweight monitoring around row counts of high-churn tables (anonymous usage/error events & token costs) to anticipate future partitioning needs.
- If a new aggregated user summary is required, implement a materialized view with clear usage metrics and refresh triggers instead of a broad ad-hoc view.
- Evaluate moving `message_token_costs` retention to a separate configurable window if token analytics horizons differ from general activity logs.

## Source Patches

- `database/patches/system-table-removal/001_drop_system_tables.sql`
- `database/patches/remove-export-user-data/001_drop_export_user_data.sql`
- `database/patches/analytics-retention/001_simplify_cleanup_old_data.sql`
- `database/patches/remove-api-user-summary/001_drop_api_user_summary.sql`

## Verification

- Confirm absence of removed objects:
  ```sql
  select * from pg_tables where tablename in ('system_cache','system_stats'); -- returns 0 rows
  select * from pg_views where viewname = 'api_user_summary'; -- returns 0 rows
  ```
- Ensure retention returns expected JSON structure.

## Change Log

- 2025-09-10: Initial publication.
