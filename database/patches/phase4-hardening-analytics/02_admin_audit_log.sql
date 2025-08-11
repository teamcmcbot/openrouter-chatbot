-- Phase 4: Admin audit log table and helpers (idempotent)
BEGIN;

-- Create audit table
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor ON public.admin_audit_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON public.admin_audit_log(action, created_at DESC);

-- Enable and force RLS
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log FORCE ROW LEVEL SECURITY;

-- Policy: Only admins can read audit logs
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='admin_audit_log' AND policyname='Only admins can read audit logs'
  ) THEN
    EXECUTE 'DROP POLICY "Only admins can read audit logs" ON public.admin_audit_log';
  END IF;
  EXECUTE 'CREATE POLICY "Only admins can read audit logs" ON public.admin_audit_log FOR SELECT USING (public.is_admin(auth.uid()))';
END$$;

-- Insert policy via SECURITY DEFINER function only (no direct INSERT allowed by RLS)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='admin_audit_log' AND policyname='Insert via definer only'
  ) THEN
    EXECUTE 'DROP POLICY "Insert via definer only" ON public.admin_audit_log';
  END IF;
  -- Deny INSERT via RLS; only our function can insert under definer
  EXECUTE 'CREATE POLICY "Insert via definer only" ON public.admin_audit_log FOR INSERT WITH CHECK (false)';
END$$;

-- Helper to write audit log under definer role
CREATE OR REPLACE FUNCTION public.write_admin_audit(
  p_actor_user_id UUID,
  p_action TEXT,
  p_target TEXT,
  p_payload JSONB DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.admin_audit_log(actor_user_id, action, target, payload)
  VALUES (p_actor_user_id, p_action, p_target, p_payload);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
