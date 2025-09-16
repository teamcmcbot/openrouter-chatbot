-- Patch: 004_drop_user_usage_daily_metrics.sql
-- Purpose: Remove unused SECURITY DEFINER view flagged by Supabase Security Advisor
-- Notes: View is not present in /database/schema and has no application references.
--        This patch is safe and idempotent.

DO $$ BEGIN
   IF EXISTS (
      SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'user_usage_daily_metrics'
   ) THEN
      -- Revoke privileges first (defensive)
      EXECUTE 'REVOKE ALL ON public.user_usage_daily_metrics FROM PUBLIC';
      EXECUTE 'REVOKE ALL ON public.user_usage_daily_metrics FROM anon';
      EXECUTE 'REVOKE ALL ON public.user_usage_daily_metrics FROM authenticated';
      EXECUTE 'REVOKE ALL ON public.user_usage_daily_metrics FROM service_role';

      -- Drop the view
      EXECUTE 'DROP VIEW public.user_usage_daily_metrics';
   END IF;
END $$;
