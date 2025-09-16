-- Patch: Optimize and secure v_sync_stats
-- Rationale:
-- 1. Performance: original view used multiple independent scalar subqueries (potential repeated scans)
-- 2. Security: advisor flagged SECURITY DEFINER usage. We instead expose data via a SECURITY DEFINER function
--    that verifies admin role, and keep the view itself simple without SECURITY DEFINER (plain view) and
--    revoke direct access from non-admin roles.
-- 3. Consistency: provide stable RPC (get_sync_stats) for API layer.

BEGIN;

-- Recreate optimized view (single-pass aggregation) - plain VIEW (no SECURITY DEFINER)
CREATE OR REPLACE VIEW public.v_sync_stats AS
WITH base AS (
  SELECT
    id,
    sync_status,
    sync_started_at,
    sync_completed_at,
    duration_ms
  FROM public.model_sync_log
), last_success AS (
  SELECT id AS last_success_id, sync_completed_at AS last_success_at
  FROM base
  WHERE sync_status = 'completed'
  ORDER BY sync_completed_at DESC NULLS LAST
  LIMIT 1
), agg AS (
  SELECT
    (SELECT last_success_id FROM last_success) AS last_success_id,
    (SELECT last_success_at FROM last_success) AS last_success_at,
    CASE WHEN COUNT(*) FILTER (WHERE sync_started_at >= now() - interval '30 days') = 0 THEN 0::numeric
         ELSE ROUND(
           (SUM(CASE WHEN sync_status='completed' AND sync_started_at >= now() - interval '30 days' THEN 1 ELSE 0 END)::numeric
            * 100
            / COUNT(*) FILTER (WHERE sync_started_at >= now() - interval '30 days')
           ), 2)
    END AS success_rate_30d,
    ROUND(AVG(duration_ms)::numeric FILTER (WHERE sync_status='completed' AND sync_started_at >= now() - interval '30 days'), 2) AS avg_duration_ms_30d,
    COUNT(*) FILTER (WHERE sync_started_at >= now() - interval '24 hours') AS runs_24h,
    COUNT(*) FILTER (WHERE sync_status='failed' AND sync_started_at >= now() - interval '24 hours') AS failures_24h
  FROM base
)
SELECT * FROM agg;

-- Revoke broad access; only allow authenticated & service roles explicit select if needed.
REVOKE ALL ON TABLE public.v_sync_stats FROM PUBLIC;
GRANT SELECT ON TABLE public.v_sync_stats TO service_role; -- internal service
-- NOTE: we intentionally do NOT grant to authenticated/anon; admin-only access will go through function.

-- Helper function performing admin check and returning row
CREATE OR REPLACE FUNCTION public.get_sync_stats()
RETURNS public.v_sync_stats%ROWTYPE
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r public.v_sync_stats%ROWTYPE;
BEGIN
  -- Ensure caller is admin; relies on existing is_admin(uid) helper (assumed present)
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;
  SELECT * INTO r FROM public.v_sync_stats;
  RETURN r;
END;$$;

-- Restrict function execution
REVOKE ALL ON FUNCTION public.get_sync_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sync_stats() TO authenticated, service_role;

COMMIT;
