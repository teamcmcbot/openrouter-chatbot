# Security Advisor Errors

## Instrctions

There are several SECURITY DEFINER views in the database schema that have been flagged by the Supabase Security Advisor linter. We will be addressing these issues one by one. Each entry below corresponds to a specific view that has been flagged, along with a detailed remediation plan.

- Analysis of each view's purpose, usage in frontend/backend, and associated risks.
- Create <view_name> section for each view with analysis and remediation plan.
- Create patch files in /database/patches/security_definer_views/..sql
- Wait for user review and approval before proceeding with implementation.
- After approval, implement the necessary code changes.
- After implementation and test by user, merge patch to schema in /database/schema/

## List of SECURITY DEFINER Views

- v_sync_stats (fixed)
- v_model_sync_activity_daily (planned)
- v_user_usage_daily_metrics (not addressed)
- v_model_counts_public (not addressed)
- user_model_costs_daily (not addressed)

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

Resolution Note (post-linter refresh): The Supabase Security Advisor error for `v_sync_stats` cleared after applying the patch that set `security_invoker=true` and re-running the linter. Original finding was a stale snapshot from before converting the view away from SECURITY DEFINER. Keeping the explicit reloption prevents future false positives.

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

### Remediation: v_model_sync_activity_daily (Complete)

Status: Complete – View hardened and linter finding cleared.

Summary of Changes Applied (across patches 001–006, consolidated subsequently):

1. Removed ORDER BY from view definition (ordering now explicitly applied at API / function layer).
2. Added explicit `security_invoker=true` (via ALTER VIEW) to prevent SECURITY DEFINER context misuse.
3. Revoked PUBLIC privileges on the view; granted SELECT only to `service_role` (and explicitly to owner where needed during troubleshooting).
4. Introduced SECURITY DEFINER function `public.get_model_sync_activity_daily(p_days integer default 30)` enforcing `public.is_admin(auth.uid())` before returning rows.
5. Adjusted API route `src/app/api/admin/analytics/models/route.ts` to switch from direct `.from('v_model_sync_activity_daily')` to `supabase.rpc('get_model_sync_activity_daily', { p_days: 30 })`.
6. Resolved runtime issues:
   - Ambiguous column reference (qualified with alias `v`).
   - Timestamp→date mismatch (cast `v.day::date`).
   - bigint vs integer return type mismatch (explicit casts to int for aggregated columns).
   - Added defensive clamp for `p_days` (1..365) in final function version.

Final Function (conceptual form):

```sql
CREATE OR REPLACE FUNCTION public.get_model_sync_activity_daily(p_days integer DEFAULT 30)
RETURNS TABLE(day date, models_added int, models_marked_inactive int, models_reactivated int)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
   safe_days integer := LEAST(GREATEST(p_days,1),365);
BEGIN
   IF NOT public.is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'insufficient_privilege';
   END IF;
   RETURN QUERY
   SELECT v.day::date,
             v.models_added::int,
             v.models_marked_inactive::int,
             v.models_reactivated::int
   FROM public.v_model_sync_activity_daily v
   WHERE v.day::date >= (CURRENT_DATE - (safe_days - 1))
   ORDER BY v.day::date DESC;
END;$$;
```

Verification Checklist

- [x] Function returns expected rows (manual SQL test with admin claims).
- [x] API endpoint `/api/admin/analytics/models` returns populated `recent` array.
- [x] Non-admin call (without admin claims) raises `insufficient_privilege`.
- [x] Supabase Security Advisor no longer lists `v_model_sync_activity_daily`.
- [x] All type/ambiguity errors resolved.

Follow-up / Next Steps

- Merge consolidated patch into `database/schema/04-system.sql` (after user confirms consolidation file).
- Optional: Add automated negative test for non-admin RPC denial.
- Future: Consider zero-filling missing days via generate_series if UI needs continuity.

No open questions remain for this object.

---
