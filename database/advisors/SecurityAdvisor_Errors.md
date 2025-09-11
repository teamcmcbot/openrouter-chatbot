| name                  | title                 | level | facing   | categories   | description                                                                                                                                                                                         | detail                                                                                    | remediation                                                                               | metadata                                                               | cache_key                                                |
| --------------------- | --------------------- | ----- | -------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| security_definer_view | Security Definer View | ERROR | EXTERNAL | ["SECURITY"] | Detects views defined with the SECURITY DEFINER property. These views enforce Postgres permissions and row level security policies (RLS) of the view creator, rather than that of the querying user | View \`public.user_usage_daily_metrics\` is defined with the SECURITY DEFINER property    | https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view | {"name":"user_usage_daily_metrics","type":"view","schema":"public"}    | security_definer_view_public_user_usage_daily_metrics    |
| security_definer_view | Security Definer View | ERROR | EXTERNAL | ["SECURITY"] | Detects views defined with the SECURITY DEFINER property. These views enforce Postgres permissions and row level security policies (RLS) of the view creator, rather than that of the querying user | View \`public.v_model_counts_public\` is defined with the SECURITY DEFINER property       | https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view | {"name":"v_model_counts_public","type":"view","schema":"public"}       | security_definer_view_public_v_model_counts_public       |
| security_definer_view | Security Definer View | ERROR | EXTERNAL | ["SECURITY"] | Detects views defined with the SECURITY DEFINER property. These views enforce Postgres permissions and row level security policies (RLS) of the view creator, rather than that of the querying user | View \`public.v_model_sync_activity_daily\` is defined with the SECURITY DEFINER property | https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view | {"name":"v_model_sync_activity_daily","type":"view","schema":"public"} | security_definer_view_public_v_model_sync_activity_daily |
| security_definer_view | Security Definer View | ERROR | EXTERNAL | ["SECURITY"] | Detects views defined with the SECURITY DEFINER property. These views enforce Postgres permissions and row level security policies (RLS) of the view creator, rather than that of the querying user | View \`public.user_model_costs_daily\` is defined with the SECURITY DEFINER property      | https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view | {"name":"user_model_costs_daily","type":"view","schema":"public"}      | security_definer_view_public_user_model_costs_daily      |
| security_definer_view | Security Definer View | ERROR | EXTERNAL | ["SECURITY"] | Detects views defined with the SECURITY DEFINER property. These views enforce Postgres permissions and row level security policies (RLS) of the view creator, rather than that of the querying user | View `public.v_sync_stats` is defined with the SECURITY DEFINER property                  | https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view | {"name":"v_sync_stats","type":"view","schema":"public"}                | security_definer_view_public_v_sync_stats                |

---

### Remediation: v_sync_stats

Status: Complete – view now explicitly marked `security_invoker=true`; performance + security changes deployed, API & UI consuming wrapper function. Pending optional explicit automated non-admin denial test (manual verification acceptable).

1. Usage Confirmation (DONE)

   - Endpoint: `/api/admin/analytics/overview` now calls `supabase.rpc('get_sync_stats')` and returns `sync` object.
   - UI: `AnalyticsPanel` Overview tab renders cards (success rate, avg total & db duration, runs/failures 24h, last success timestamp) for admin users.

2. Performance Improvement (DONE)

   - Original: multiple scalar subqueries.
   - Current: single CTE aggregation (`base`, `last_success`, `agg`).
   - Impact: single pass over `model_sync_log`; simpler planner path.

3. Security Hardening (DONE)

   - Replaced SECURITY DEFINER view with plain view + SECURITY DEFINER wrapper `get_sync_stats()` enforcing `public.is_admin(auth.uid())`.
   - Explicitly set `security_invoker=true` on the view (linter clarity; default is invoker but flag removes ambiguity / stale snapshot risk).
   - Revoked public SELECT on view; granted SELECT only to `service_role`; function EXECUTE to `authenticated`, `service_role`.
   - Application exclusively uses RPC (no direct view access).

4. API Adjustment (DONE)

   - `/api/admin/analytics/overview` updated; TODO removed. Tests (`adminAnalytics.test.ts`) pass using RPC path.

5. Rollout Summary (DONE; optional automated negative test outstanding)

   - Patch applied & verified via admin call.
   - API handler updated; full Jest suite green.
   - Schema changes merged into `database/schema/03-models.sql` (not `04-system.sql`).
   - Non-admin negative test manually executed (expect permission error). Optional: add automated test later.

6. Future Enhancements

   - Consider materialized view if sync volume grows and latency becomes material.
   - Add index suggestions (partial on `sync_status='completed'` for `sync_completed_at` and general on `sync_started_at`).

7. Verification Checklist
   - [x] Patch applied in database environment.
   - [x] RPC call returns one row with all expected fields.
   - [x] Non-admin user cannot execute `get_sync_stats` (manual verification; optional to automate).
   - [x] Overview endpoint updated to use RPC.
   - [x] UI displays values with no console/log errors.

---
