| name                  | title                 | level | facing   | categories   | description                                                                                                                                                                                         | detail                                                                                    | remediation                                                                               | metadata                                                               | cache_key                                                |
| --------------------- | --------------------- | ----- | -------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| security_definer_view | Security Definer View | ERROR | EXTERNAL | ["SECURITY"] | Detects views defined with the SECURITY DEFINER property. These views enforce Postgres permissions and row level security policies (RLS) of the view creator, rather than that of the querying user | View \`public.user_usage_daily_metrics\` is defined with the SECURITY DEFINER property    | https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view | {"name":"user_usage_daily_metrics","type":"view","schema":"public"}    | security_definer_view_public_user_usage_daily_metrics    |
| security_definer_view | Security Definer View | ERROR | EXTERNAL | ["SECURITY"] | Detects views defined with the SECURITY DEFINER property. These views enforce Postgres permissions and row level security policies (RLS) of the view creator, rather than that of the querying user | View \`public.v_model_counts_public\` is defined with the SECURITY DEFINER property       | https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view | {"name":"v_model_counts_public","type":"view","schema":"public"}       | security_definer_view_public_v_model_counts_public       |
| security_definer_view | Security Definer View | ERROR | EXTERNAL | ["SECURITY"] | Detects views defined with the SECURITY DEFINER property. These views enforce Postgres permissions and row level security policies (RLS) of the view creator, rather than that of the querying user | View \`public.v_model_sync_activity_daily\` is defined with the SECURITY DEFINER property | https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view | {"name":"v_model_sync_activity_daily","type":"view","schema":"public"} | security_definer_view_public_v_model_sync_activity_daily |
| security_definer_view | Security Definer View | ERROR | EXTERNAL | ["SECURITY"] | Detects views defined with the SECURITY DEFINER property. These views enforce Postgres permissions and row level security policies (RLS) of the view creator, rather than that of the querying user | View \`public.user_model_costs_daily\` is defined with the SECURITY DEFINER property      | https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view | {"name":"user_model_costs_daily","type":"view","schema":"public"}      | security_definer_view_public_user_model_costs_daily      |
| security_definer_view | Security Definer View | ERROR | EXTERNAL | ["SECURITY"] | Detects views defined with the SECURITY DEFINER property. These views enforce Postgres permissions and row level security policies (RLS) of the view creator, rather than that of the querying user | View `public.v_sync_stats` is defined with the SECURITY DEFINER property                  | https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view | {"name":"v_sync_stats","type":"view","schema":"public"}                | security_definer_view_public_v_sync_stats                |

---

### Remediation: v_sync_stats

Status: In progress (UI now consumes stats, patch created to harden view access and performance).

1. Usage Confirmation

   - Endpoint: `/api/admin/analytics/overview` returns `sync` object.
   - UI: `AnalyticsPanel` Overview tab now renders cards (success rate, avg duration, runs/failures 24h, last success timestamp) for authenticated/admin segment only.

2. Performance Improvement

   - Original implementation: multiple scalar subqueries (repeated scans of `model_sync_log`).
   - Patch (`database/patches/v_sync_stats_hardening/01_optimize_and_secure_v_sync_stats.sql`) rewrites view using a single CTE aggregation (`base`, `last_success`, `agg`).
   - Expected effect: fewer planner executions / scans, simpler statistics usage by Postgres.

3. Security Hardening

   - Problem: Advisor flagged SECURITY DEFINER view (escalated privileges risk).
   - Approach: Replace SECURITY DEFINER view with plain view + SECURITY DEFINER wrapper function `get_sync_stats()` that enforces `public.is_admin(auth.uid())` check.
   - Direct SELECT revoked from PUBLIC; only `service_role` retains view read. Application (admin dashboard) must call RPC instead of raw view when refactored.

4. API Adjustment (Next step)

   - Modify `/api/admin/analytics/overview` to call `supabase.rpc('get_sync_stats')` instead of `from('v_sync_stats')` after patch deploy.
   - Present code includes TODO comment; implementation pending migration deployment.

5. Rollout Plan

   - Apply patch in staging; verify: `SELECT * FROM public.get_sync_stats();` as admin succeeds; non-admin receives `insufficient_privilege`.
   - Update API handler; run test suite.
   - Merge patch into canonical schema file (`04-system.sql`) post-approval.

6. Future Enhancements

   - Consider materialized view if sync volume grows and latency becomes material.
   - Add index suggestions (partial on `sync_status='completed'` for `sync_completed_at` and general on `sync_started_at`).

7. Verification Checklist
   - [ ] Patch applied in database environment.
   - [ ] RPC call returns one row with all expected fields.
   - [ ] Non-admin user cannot execute `get_sync_stats`.
   - [ ] Overview endpoint updated to use RPC.
   - [ ] UI displays values with no console/log errors.

---
