-- Phase 4: RLS tighten for model tables (idempotent)
BEGIN;

-- Ensure RLS is enabled and forced
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='model_access'
  ) THEN
    RAISE NOTICE 'model_access table missing, skipping';
  ELSE
    EXECUTE 'ALTER TABLE public.model_access ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.model_access FORCE ROW LEVEL SECURITY';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='model_sync_log'
  ) THEN
    RAISE NOTICE 'model_sync_log table missing, skipping';
  ELSE
    EXECUTE 'ALTER TABLE public.model_sync_log ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.model_sync_log FORCE ROW LEVEL SECURITY';
  END IF;
END$$;

-- Recreate policies idempotently for model_sync_log
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='model_sync_log' AND policyname='Only admins can view sync logs'
  ) THEN
    EXECUTE 'DROP POLICY "Only admins can view sync logs" ON public.model_sync_log';
  END IF;
  EXECUTE 'CREATE POLICY "Only admins can view sync logs" ON public.model_sync_log FOR SELECT USING (public.is_admin(auth.uid()))';

  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='model_sync_log' AND policyname='Admins can insert sync logs'
  ) THEN
    EXECUTE 'DROP POLICY "Admins can insert sync logs" ON public.model_sync_log';
  END IF;
  EXECUTE 'CREATE POLICY "Admins can insert sync logs" ON public.model_sync_log FOR INSERT WITH CHECK (public.is_admin(auth.uid()))';

  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='model_sync_log' AND policyname='Admins can update sync logs'
  ) THEN
    EXECUTE 'DROP POLICY "Admins can update sync logs" ON public.model_sync_log';
  END IF;
  EXECUTE 'CREATE POLICY "Admins can update sync logs" ON public.model_sync_log FOR UPDATE USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()))';
END$$;

COMMIT;
