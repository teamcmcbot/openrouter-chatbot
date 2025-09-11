-- Patch: Harden public.v_model_counts_public
-- Purpose: Make invoker semantics explicit and set clear, minimal privileges for a public-safe aggregate view.
-- Notes:
--   - View reads only aggregate counts from public.model_access (no PII).
--   - We keep it accessible to anon/authenticated for potential landing/marketing widgets.
--   - This clears the Supabase Security Advisor "security_definer_view" finding by setting security_invoker.

DO $$
BEGIN
  -- Ensure invoker semantics (explicit to avoid stale linter snapshots)
  IF EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'v_model_counts_public'
  ) THEN
    EXECUTE 'ALTER VIEW public.v_model_counts_public SET (security_invoker = true)';
  END IF;

  -- Reset privileges and apply explicit, intentional grants
  EXECUTE 'REVOKE ALL ON public.v_model_counts_public FROM PUBLIC';
  EXECUTE 'GRANT SELECT ON public.v_model_counts_public TO anon';
  EXECUTE 'GRANT SELECT ON public.v_model_counts_public TO authenticated';
  EXECUTE 'GRANT SELECT ON public.v_model_counts_public TO service_role';
END$$;

-- End of patch 003_v_model_counts_public.sql
