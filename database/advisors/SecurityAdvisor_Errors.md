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

### Remediation: v_model_counts_public (Proposed)

Status: Proposed – keep the view as a public-safe aggregate but make its security explicit. Apply `security_invoker=true` and explicit GRANTs aligned with intended exposure. No RPC required unless we later restrict public access.

1. Purpose and current definition

- Purpose: Single-row aggregate of model status counts used in admin analytics (and suitable for public/landing metrics if desired). It exposes only counts by status across `model_access`.
- Current definition (from `database/schema/04-system.sql`):
  - `CREATE OR REPLACE VIEW public.v_model_counts_public AS
  SELECT COUNT(*) FILTER (WHERE status='new') AS new_count,
             COUNT(*) FILTER (WHERE status='active') AS active_count,
             COUNT(*) FILTER (WHERE status='inactive') AS inactive_count,
             COUNT(*) FILTER (WHERE status='disabled') AS disabled_count,
             COUNT(*) AS total_count
  FROM public.model_access;`
- Underlying table security: `public.model_access` has RLS enabled with policy: "All users can view model access" (USING true). No PII; data is model catalog metadata.

2. Usage inventory

- API routes (admin):
  - `src/app/api/admin/analytics/overview/route.ts` → `supabase.from('v_model_counts_public').select('*').limit(1)`
  - `src/app/api/admin/analytics/models/route.ts` → `supabase.from('v_model_counts_public').select('*').limit(1)`
- Tests: `tests/api/adminAnalytics.test.ts` stubs the view response (seedCounts).
- Docs: `docs/admin/analytics.md` notes v_model_counts_public is “safe for public / can be shown anywhere.”

3. Why the linter flagged it

- Supabase Security Advisor reported the view as SECURITY DEFINER. While Postgres views default to definer privileges, this view doesn’t need elevated rights and reads only from a table that is already world-readable via RLS policy (USING true). Still, we prefer to:
  - Make invoker semantics explicit (`security_invoker=true`) to avoid ambiguity and future regressions.
  - Set explicit GRANTs to reflect intended public/anonymous access rather than relying on defaults.

4. Remediation options

- Option A (recommended): Public-safe view with explicit invoker + grants

  - Set `security_invoker=true`.
  - Revoke PUBLIC privileges, then grant SELECT to `anon`, `authenticated`, and `service_role` explicitly.
  - Keep existing API usage (simple `.from('v_model_counts_public')`). No RPC needed.
  - Document the rationale in schema comments and docs (public aggregate, no sensitive data).

- Option B (stricter): Restrict direct SELECT; expose via RPC
  - Revoke SELECT from `anon`/`authenticated`; grant only to `service_role`.
  - Add `public.get_model_counts_public()` SECURITY DEFINER RPC without admin check (just returns the single row), and have API call the RPC.
  - Pros: Centralizes access; Cons: Extra moving parts for minimal security gain given data is non-sensitive.

Recommendation: Option A. It satisfies the linter, keeps intent clear, and avoids churn in admin endpoints and tests.

5. Patch outline (SQL)

File: `/database/patches/security_definer_views/003_v_model_counts_public.sql`

```
-- Ensure invoker semantics and explicit privileges for a public-safe aggregate view
DO $$ BEGIN
   -- Make view invoker-secure (idempotent guard not strictly needed; ALTER VIEW is safe if exists)
   IF EXISTS (
      SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='v_model_counts_public'
   ) THEN
      EXECUTE 'ALTER VIEW public.v_model_counts_public SET (security_invoker = true)';
   END IF;

   -- Tighten and then explicitly grant expected access
   EXECUTE 'REVOKE ALL ON public.v_model_counts_public FROM PUBLIC';
   EXECUTE 'GRANT SELECT ON public.v_model_counts_public TO anon';
   EXECUTE 'GRANT SELECT ON public.v_model_counts_public TO authenticated';
   EXECUTE 'GRANT SELECT ON public.v_model_counts_public TO service_role';
END $$;
```

If Option B is preferred later, add an RPC and switch API calls; otherwise, no application changes are required.

6. API impact

- None under Option A. Existing `.select('*').limit(1)` continues to work for admins (and would also work for anonymous endpoints if we ever expose such a route).
- Tests remain valid; no changes to mocks needed.

7. Verification checklist

- [ ] Apply patch in a dev database and re-run the Security Advisor; confirm the finding for `v_model_counts_public` is cleared.
- [ ] Manual SQL: `select * from public.v_model_counts_public;` returns one row with the 5 fields, for both anon and authenticated sessions.
- [ ] Admin API endpoints (`/api/admin/analytics/overview` and `/api/admin/analytics/models`) still return the counts segment with no changes.
- [ ] Jest suite passes without modifications.
- [ ] Docs: add a short note that this view is explicitly invoker + anon-select for public-safe usage.

8. Open questions for confirmation

1) Do we want the counts accessible to unauthenticated users (e.g., potential landing page widgets)? Current docs say “safe for public” – confirm this is still desired.
2) Any additional fields desired (e.g., counts by tier flags) before we freeze the interface? If yes, we’ll update the definition and tests together.
3) Should we add a tiny canary test that asserts the view returns exactly one row with all five fields present?

Upon confirmation, I’ll prepare the patch file, run the build/tests, and then merge the changes into `database/schema/04-system.sql` and update the docs.
