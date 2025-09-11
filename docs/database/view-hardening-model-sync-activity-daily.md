# View Hardening: v_model_sync_activity_daily

Status: Complete (2025-09-11)

Objective

Convert legacy SECURITY DEFINER view access into an invoker-view + tightly scoped SECURITY DEFINER wrapper function pattern, enforcing admin-only access and clearing Supabase Security Advisor findings.

Summary of Changes

1. Removed implicit trusted context: ensured the view runs as invoker (`security_invoker=true`).
2. Privilege minimization: revoked PUBLIC SELECT; granted SELECT only to `service_role` (and owner implicitly).
3. Added wrapper function `public.get_model_sync_activity_daily(p_days integer default 30)` with:
   - SECURITY DEFINER
   - Admin authorization gate via `public.is_admin(auth.uid())`
   - Parameter clamp: `safe_days := LEAST(GREATEST(p_days,1),365)`
4. Adjusted API (`/api/admin/analytics/models`) to call RPC instead of selecting the view.
5. Resolved runtime issues: ambiguous column, date/timestamptz mismatch, bigint→int casts.
6. Consolidated iterative patches into schema (`database/schema/04-system.sql`).

Final Function

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

Privileges

```sql
REVOKE ALL ON TABLE public.v_model_sync_activity_daily FROM PUBLIC;
GRANT SELECT ON public.v_model_sync_activity_daily TO service_role;
GRANT EXECUTE ON FUNCTION public.get_model_sync_activity_daily(integer) TO authenticated, service_role;
```

Security Properties

- Least privilege: front-end callers cannot bypass admin check (only RPC exposed).
- Auditable: single enforced code path for access.
- Linter clean: explicit `security_invoker=true` avoids stale SECURITY DEFINER snapshot.
- Injection-safe: no dynamic SQL; parameter used only in arithmetic.

Testing / Verification Checklist

- [x] Admin RPC returns >=1 row when recent sync activity exists.
- [x] Non-admin caller receives `insufficient_privilege` error.
- [x] Security Advisor no longer flags `v_model_sync_activity_daily`.
- [x] API `/api/admin/analytics/models` returns populated `recent` array with fields: `day`, `models_added`, `models_marked_inactive`, `models_reactivated`.
- [x] Schema file contains final definition (fresh clone works without patch replay).

Operational Notes

- Performance: underlying view scans recent `model_sync_log` (30 days default). Index on `(sync_created_at)` or `(sync_completed_at)` keeps scan bounded; monitor if retention expands.
- Extensibility: zero-filled series (generate_series) omitted intentionally for simplicity; can be added later if UI needs continuous dates.
- Safety: clamp prevents large unbounded scans if client manipulates `p_days`.

Future Enhancements

- Add Jest integration test asserting non-admin denial path (optional).
- Consider materialized intermediate if daily aggregation cost grows.
- Apply same hardening template to remaining flagged views (`v_model_counts_public`, `user_model_costs_daily`, `v_user_usage_daily_metrics`).

Change Log

- 2025-09-11: Document created after consolidation into schema.
