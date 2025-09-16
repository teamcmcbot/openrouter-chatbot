-- 007_consolidated_v_model_sync_activity_daily.sql
-- Consolidated patch for v_model_sync_activity_daily remediation.
-- This file supersedes individual incremental patches 001–006 for deployment/merge.
-- Apply AFTER verifying in staging. Then fold into schema (04-system.sql) and remove older fragment patches.

-- 1. Recreate (idempotent) view WITHOUT ORDER BY
CREATE OR REPLACE VIEW public.v_model_sync_activity_daily AS
SELECT
    DATE_TRUNC('day', COALESCE(sync_completed_at, sync_started_at)) AS day,
    SUM(models_added) AS models_added,
    SUM(models_marked_inactive) AS models_marked_inactive,
    SUM(models_reactivated) AS models_reactivated,
    COUNT(*) AS runs
FROM public.model_sync_log
WHERE sync_status = 'completed'
  AND COALESCE(sync_completed_at, sync_started_at) >= NOW() - INTERVAL '30 days'
GROUP BY 1; -- Ordering applied by caller

-- 2. Ensure INVOKER semantics explicitly for linter clarity
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='v_model_sync_activity_daily'
    ) THEN
        EXECUTE 'ALTER VIEW public.v_model_sync_activity_daily SET (security_invoker = true)';
    END IF;
END$$;

-- 3. Restrict direct SELECT to service_role (and owner if needed)
REVOKE ALL ON TABLE public.v_model_sync_activity_daily FROM PUBLIC;
GRANT SELECT ON TABLE public.v_model_sync_activity_daily TO service_role;
-- (Optional) grant to postgres if different from service_role (harmless if already has)
GRANT SELECT ON TABLE public.v_model_sync_activity_daily TO postgres;

-- 4. Drop existing wrapper function (if present) prior to recreation
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public'
          AND p.proname='get_model_sync_activity_daily'
          AND pg_get_function_identity_arguments(p.oid) = 'p_days integer'
    ) THEN
        EXECUTE 'DROP FUNCTION public.get_model_sync_activity_daily(p_days integer)';
    END IF;
END$$;

-- 5. Create final SECURITY DEFINER wrapper with admin enforcement & safe days clamp
CREATE OR REPLACE FUNCTION public.get_model_sync_activity_daily(p_days integer DEFAULT 30)
RETURNS TABLE(day date, models_added int, models_marked_inactive int, models_reactivated int) AS $$
DECLARE
    safe_days integer := LEAST(GREATEST(p_days,1),365);
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'insufficient_privilege';
    END IF;
    RETURN QUERY
    SELECT v.day::date AS day,
           v.models_added::int,
           v.models_marked_inactive::int,
           v.models_reactivated::int
    FROM public.v_model_sync_activity_daily v
    WHERE v.day::date >= (CURRENT_DATE - (safe_days - 1))
    ORDER BY v.day::date DESC;
END;$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.get_model_sync_activity_daily(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_model_sync_activity_daily(integer) TO authenticated, service_role;

-- 6. Verification Hints (manual)
-- SELECT * FROM public.get_model_sync_activity_daily(30) LIMIT 5; -- as admin
-- Expect descending recent days with integer counts.
-- Non-admin (claims without admin) => error 'insufficient_privilege'.

-- End consolidated patch.
