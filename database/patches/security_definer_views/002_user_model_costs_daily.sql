-- Patch: Harden user_model_costs_daily access and add RPCs
-- - Enforce security_invoker on the view
-- - Restrict direct SELECT privileges
-- - Add user/admin RPC functions

BEGIN;

-- 1) Ensure invoker semantics for the view (idempotent)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='user_model_costs_daily'
  ) THEN
    EXECUTE 'ALTER VIEW public.user_model_costs_daily SET (security_invoker = true)';
  END IF;
END $$;

-- 2) Restrict privileges on the view: no PUBLIC, service_role only
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='user_model_costs_daily'
  ) THEN
    EXECUTE 'REVOKE ALL ON public.user_model_costs_daily FROM PUBLIC';
    -- Ensure owner retains privileges implicitly; grant explicit roles
    BEGIN
      EXECUTE 'GRANT SELECT ON public.user_model_costs_daily TO service_role';
    EXCEPTION WHEN undefined_object THEN
      -- Some environments might not have role service_role; ignore in local dev
      NULL;
    END;
  END IF;
END $$;

-- 3) User-facing RPC: current user daily model costs between dates (optional model filter)
--    SECURITY INVOKER; relies on RLS of message_token_costs
CREATE OR REPLACE FUNCTION public.get_user_model_costs_daily(
  p_start DATE,
  p_end   DATE,
  p_model_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  usage_date DATE,
  model_id   VARCHAR(100),
  total_tokens BIGINT,
  total_cost  DECIMAL(18,6)
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    (mtc.message_timestamp AT TIME ZONE 'UTC')::date AS usage_date,
    COALESCE(mtc.model_id, 'unknown') AS model_id,
    SUM(mtc.total_tokens)::bigint       AS total_tokens,
    ROUND(SUM(mtc.total_cost), 6)       AS total_cost
  FROM public.message_token_costs mtc
  WHERE mtc.user_id = auth.uid()
    AND mtc.message_timestamp >= p_start
    AND mtc.message_timestamp < (p_end + 1)
    AND (p_model_id IS NULL OR mtc.model_id = p_model_id)
  GROUP BY 1, 2
  ORDER BY 1 ASC;
$$;

COMMENT ON FUNCTION public.get_user_model_costs_daily(DATE, DATE, TEXT)
  IS 'Per-user RPC: daily model costs between dates inclusive; SECURITY INVOKER and respects RLS.';

-- 4) Admin RPC: all users daily aggregated messages/tokens between dates
--    SECURITY DEFINER; enforces admin check explicitly
CREATE OR REPLACE FUNCTION public.get_admin_user_model_costs_daily(
  p_start DATE,
  p_end   DATE
)
RETURNS TABLE (
  usage_date DATE,
  user_id UUID,
  assistant_messages BIGINT,
  total_tokens BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    (mtc.message_timestamp AT TIME ZONE 'UTC')::date AS usage_date,
    mtc.user_id,
    COUNT(*)::bigint         AS assistant_messages,
    SUM(mtc.total_tokens)::bigint AS total_tokens
  FROM public.message_token_costs mtc
  WHERE mtc.message_timestamp >= p_start
    AND mtc.message_timestamp < (p_end + 1)
  GROUP BY 1, 2
  ORDER BY 1 ASC;
END;
$$;

COMMENT ON FUNCTION public.get_admin_user_model_costs_daily(DATE, DATE)
  IS 'Admin RPC: per-user daily messages/tokens between dates inclusive; requires admin and uses SECURITY DEFINER.';

-- 5) Grants for RPCs
DO $$ BEGIN
  -- get_user_model_costs_daily is available to authenticated users
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_user_model_costs_daily(DATE, DATE, TEXT) TO authenticated';
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_user_model_costs_daily(DATE, DATE, TEXT) TO service_role';
  EXCEPTION WHEN undefined_object THEN NULL; END;

  -- admin function: authenticated (admin-checked inside) and service_role
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_admin_user_model_costs_daily(DATE, DATE) TO authenticated';
  EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_admin_user_model_costs_daily(DATE, DATE) TO service_role';
  EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;

COMMIT;
