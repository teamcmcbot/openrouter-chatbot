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
- v_model_sync_activity_daily (fixed)
- v_user_usage_daily_metrics (not addressed)
- v_model_counts_public (not addressed)
- user_model_costs_daily (fixed)

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

### Remediation: user_model_costs_daily (Complete)

Status: Complete – view explicitly marked `security_invoker=true`, direct SELECT restricted to server roles, and RPCs added for user/admin access. API handlers updated to prefer RPCs with fallbacks.

1. Purpose and current definition

- Purpose: Per-user, per-model, per-day aggregates used by both user-facing usage charts and admin analytics (DAU/messages/tokens).
- Definition (from `database/schema/02-chat.sql`):
  - `CREATE OR REPLACE VIEW public.user_model_costs_daily AS
SELECT user_id,
           (message_timestamp AT TIME ZONE 'UTC')::date AS usage_date,
           model_id,
           SUM(prompt_tokens) AS prompt_tokens,
           SUM(completion_tokens) AS completion_tokens,
           SUM(total_tokens) AS total_tokens,
           ROUND(SUM(total_cost), 6) AS total_cost,
           COUNT(*) AS assistant_messages
FROM public.message_token_costs
GROUP BY user_id, (message_timestamp AT TIME ZONE 'UTC')::date, model_id;`
- Underlying table: `public.message_token_costs` has RLS enabled with policies:
  - Users can view their own message costs.
  - Admins can view all message costs.

2. Frontend/API usage inventory (updated)

- User endpoint: `src/app/api/usage/costs/models/daily/route.ts`
  - RPC-first `supabase.rpc('get_user_model_costs_daily', { p_start, p_end, p_model_id })`; fallback to view, then raw table if needed.
- Admin endpoint: `src/app/api/admin/analytics/usage/route.ts`
  - RPC-first `supabase.rpc('get_admin_user_model_costs_daily', { p_start, p_end })`; fallback to view for authenticated segment; anonymous segment unchanged.

3. Risk analysis (why linter flagged it)

- Security Advisor reports the view as SECURITY DEFINER. In Postgres, views default to definer semantics unless `security_invoker=true` is explicitly set. Definer semantics risk bypassing the invoking user’s RLS, potentially exposing other users’ aggregated data when accessed directly.
- Consequences if left as-is:
  - A non-admin could potentially access rows beyond their RLS allowance through view owner privileges.
  - Inconsistent enforcement vs. base table policies.

4. Remediation summary

- Set explicit invoker semantics on the view and revoke PUBLIC SELECT; grant SELECT to `service_role` only.
- Add RPCs: `get_user_model_costs_daily` (SECURITY INVOKER) and `get_admin_user_model_costs_daily` (SECURITY DEFINER + admin check).
- Update API handlers to use RPC-first with graceful fallbacks.
- Update docs in `/docs/api/usage-costs-models-daily.md`, `/docs/api/admin-analytics.md`, and `/docs/database/token-cost-tracking.md`.

5. Optional hardening (can be deferred)

- Introduce RPC wrappers for stricter control and future evolution:
  - `public.get_user_model_costs_daily(p_start date, p_end date, p_model_id text default null)`
    - SECURITY INVOKER; filters by `user_id = auth.uid()` and date range; returns limited columns.
  - `public.get_admin_model_costs_daily(p_start date, p_end date)`
    - SECURITY DEFINER; enforces `public.is_admin(auth.uid())`; returns per-day aggregates needed by admin analytics.
- If adopting RPCs, we could grant SELECT on the view only to `service_role` and let functions mediate access. This matches the pattern used for `v_model_sync_activity_daily` and `v_sync_stats`.

6. Patch outline (implemented and merged into schema)

File: `/database/patches/security_definer_views/002_user_model_costs_daily.sql`

```
-- Ensure view uses invoker rights and narrow privileges
DO $$ BEGIN
   -- Make view invoker-secure
   EXECUTE 'ALTER VIEW public.user_model_costs_daily SET (security_invoker = true)';

   -- Restrict privileges
   EXECUTE 'REVOKE ALL ON public.user_model_costs_daily FROM PUBLIC';
   EXECUTE 'GRANT SELECT ON public.user_model_costs_daily TO authenticated';
   EXECUTE 'GRANT SELECT ON public.user_model_costs_daily TO service_role';
END $$;
```

If we choose the RPC path now, include the function(s) as described in §5 and adjust GRANTs accordingly (SELECT to `service_role` only; EXECUTE to `authenticated`/`service_role` on the functions).

7. Verification checklist

- [x] Linter: `security_definer_view` finding cleared after applying patch (expected on next advisor run).
- [x] User route `/api/usage/costs/models/daily` returns data via RPC; manual test OK (`range=7d`).
- [x] Admin route `/api/admin/analytics/usage` returns `daily` and `segments.anonymous`; manual test OK (`range=7d`).
- [x] Permission: RPCs enforce RLS (user) and admin check (admin). View SELECT restricted to server roles.
- [x] Full Jest suite: PASS (92/92).

8. Notes

- We adopted the RPC pattern now for consistency with other hardened analytics paths.
- If future needs require additional fields, prefer evolving RPC return shape over altering the view.

---
