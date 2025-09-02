-- Drop legacy view now replaced by v_model_sync_activity_daily
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'v_model_recent_activity_admin'
  ) THEN
    EXECUTE 'DROP VIEW public.v_model_recent_activity_admin';
  END IF;
END $$;
