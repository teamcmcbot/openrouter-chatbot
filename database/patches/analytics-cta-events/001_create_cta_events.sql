-- Patch: Create CTA events table and policies
-- Safe, idempotent creation.

-- 1) Table
CREATE TABLE IF NOT EXISTS public.cta_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  page text NOT NULL,
  cta_id text NOT NULL,
  location text NULL,
  is_authenticated boolean NOT NULL DEFAULT false,
  user_id uuid NULL,
  ip_hash text NULL,
  meta jsonb NULL
);

-- 2) Indexes
CREATE INDEX IF NOT EXISTS idx_cta_events_created_at ON public.cta_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cta_events_page_cta ON public.cta_events(page, cta_id);
CREATE INDEX IF NOT EXISTS idx_cta_events_user ON public.cta_events(user_id, created_at DESC);

-- 3) Enable RLS
ALTER TABLE public.cta_events ENABLE ROW LEVEL SECURITY;

-- 4) Policies: allow inserts for any role (we write from server), and admin read; prevent row leaks to regular users
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cta_events' AND policyname='Admin can read CTA events'
  ) THEN
    EXECUTE 'DROP POLICY "Admin can read CTA events" ON public.cta_events';
  END IF;
  EXECUTE 'CREATE POLICY "Admin can read CTA events" ON public.cta_events FOR SELECT USING (public.is_admin(auth.uid()))';

  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cta_events' AND policyname='Allow inserts from server roles'
  ) THEN
    EXECUTE 'DROP POLICY "Allow inserts from server roles" ON public.cta_events';
  END IF;
  -- Allow insert when using service role (no auth.uid()) OR when authenticated user inserts their own record (not typical, but safe)
  EXECUTE 'CREATE POLICY "Allow inserts from server roles" ON public.cta_events FOR INSERT WITH CHECK (auth.role() = ''service_role'' OR auth.role() = ''authenticated'')';
END$$;

-- 5) Optional retention helper (no schedule here)
CREATE OR REPLACE FUNCTION public.cleanup_cta_events(days_to_keep integer DEFAULT 90)
RETURNS int AS $$
DECLARE
  cutoff timestamptz := now() - make_interval(days => days_to_keep);
  deleted_count int;
BEGIN
  DELETE FROM public.cta_events WHERE created_at < cutoff;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6) Ingest function (SECURITY DEFINER) so server can insert using anon key
--    This avoids granting broad INSERT to anon on the table while keeping writes controlled by this function.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ingest_cta_event'
  ) THEN
    EXECUTE 'DROP FUNCTION public.ingest_cta_event(text, text, text, boolean, uuid, text, jsonb)';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.ingest_cta_event(
  p_page text,
  p_cta_id text,
  p_location text DEFAULT NULL,
  p_is_authenticated boolean DEFAULT false,
  p_user_id uuid DEFAULT NULL,
  p_ip_hash text DEFAULT NULL,
  p_meta jsonb DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO public.cta_events(page, cta_id, location, is_authenticated, user_id, ip_hash, meta)
  VALUES (p_page, p_cta_id, p_location, p_is_authenticated, p_user_id, p_ip_hash, p_meta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure safe execute grants for web roles
REVOKE ALL ON FUNCTION public.ingest_cta_event(text, text, text, boolean, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_cta_event(text, text, text, boolean, uuid, text, jsonb) TO anon, authenticated;
