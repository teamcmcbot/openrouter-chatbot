-- ============================================================================
-- Patch: account-banning / 001-ban-schema.sql
-- Purpose: Introduce ban fields, moderation actions table, and helper functions
-- Safety: Idempotent where possible (IF NOT EXISTS, OR REPLACE)
-- ============================================================================

-- 1) Extend profiles with banning-related columns (idempotent)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned_at timestamptz,
  ADD COLUMN IF NOT EXISTS banned_until timestamptz,
  ADD COLUMN IF NOT EXISTS ban_reason text,
  ADD COLUMN IF NOT EXISTS violation_strikes integer NOT NULL DEFAULT 0;

-- Helpful indexes for admin queries and enforcement
CREATE INDEX IF NOT EXISTS idx_profiles_is_banned_true
  ON public.profiles(is_banned) WHERE is_banned = true;

CREATE INDEX IF NOT EXISTS idx_profiles_banned_until
  ON public.profiles(banned_until) WHERE banned_until IS NOT NULL;


-- 2) Moderation actions audit table (admin-only)
CREATE TABLE IF NOT EXISTS public.moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('warned','banned','unbanned','temporary_ban')),
  reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_moderation_actions_user_date
  ON public.moderation_actions(user_id, created_at DESC);

-- Enable RLS and restrict to admins
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'moderation_actions' AND policyname = 'Admins can view moderation actions'
  ) THEN
    CREATE POLICY "Admins can view moderation actions"
      ON public.moderation_actions
      FOR SELECT
      USING (public.is_admin(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'moderation_actions' AND policyname = 'Admins can insert moderation actions'
  ) THEN
    CREATE POLICY "Admins can insert moderation actions"
      ON public.moderation_actions
      FOR INSERT
      WITH CHECK (public.is_admin(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'moderation_actions' AND policyname = 'Admins can update moderation actions'
  ) THEN
    CREATE POLICY "Admins can update moderation actions"
      ON public.moderation_actions
      FOR UPDATE
      USING (public.is_admin(auth.uid()))
      WITH CHECK (public.is_admin(auth.uid()));
  END IF;
END$$;


-- 3) Helper functions
-- Determine if a user is effectively banned (permanent or temporary)
CREATE OR REPLACE FUNCTION public.is_banned(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(p.is_banned, false)
         OR (p.banned_until IS NOT NULL AND p.banned_until > now())
  FROM public.profiles p
  WHERE p.id = p_user_id;
$$;

-- Ban a user (permanent when p_until is null, temporary otherwise)
CREATE OR REPLACE FUNCTION public.ban_user(
  p_user_id uuid,
  p_until timestamptz DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_updated int := 0;
BEGIN
  -- Require admin unless running with elevated service role (auth.uid() is null in service contexts)
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;

  v_action := CASE WHEN p_until IS NULL THEN 'banned' ELSE 'temporary_ban' END;

  UPDATE public.profiles
     SET is_banned = true,
         banned_at = now(),
         banned_until = p_until,
         ban_reason = p_reason,
         updated_at = now()
   WHERE id = p_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Write moderation action (admin audit)
  INSERT INTO public.moderation_actions(user_id, action, reason, metadata, created_by)
  VALUES (
    p_user_id,
    v_action,
    p_reason,
    jsonb_build_object('until', p_until),
    auth.uid()
  );

  -- Write activity log (user-scoped audit trail)
  PERFORM public.log_user_activity(
    p_user_id,
    'user_banned',
    'profile',
    p_user_id::text,
    jsonb_build_object('until', p_until)
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'action', v_action,
    'until', p_until,
    'updated_at', now()
  );
END;
$$;

-- Unban a user
CREATE OR REPLACE FUNCTION public.unban_user(
  p_user_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int := 0;
BEGIN
  -- Require admin unless running with elevated service role
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
     SET is_banned = false,
         banned_until = NULL,
         ban_reason = NULL,
         updated_at = now()
   WHERE id = p_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  INSERT INTO public.moderation_actions(user_id, action, reason, metadata, created_by)
  VALUES (
    p_user_id,
    'unbanned',
    p_reason,
    '{}'::jsonb,
    auth.uid()
  );

  PERFORM public.log_user_activity(
    p_user_id,
    'user_unbanned',
    'profile',
    p_user_id::text,
    '{}'::jsonb
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'action', 'unbanned',
    'updated_at', now()
  );
END;
$$;

-- Grants: allow reads of is_banned, but restrict ban/unban to authenticated (and enforced by admin check)
GRANT EXECUTE ON FUNCTION public.is_banned(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.ban_user(uuid, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unban_user(uuid, text) TO authenticated;

-- 4) Hardening: prevent non-admins from editing ban columns directly via profile updates
CREATE OR REPLACE FUNCTION public.protect_ban_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role (no auth.uid) bypasses; admins allowed
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- If any ban-related column changed by a non-admin, block the update
  IF (COALESCE(NEW.is_banned, false) IS DISTINCT FROM COALESCE(OLD.is_banned, false))
     OR (NEW.banned_until IS DISTINCT FROM OLD.banned_until)
     OR (NEW.banned_at IS DISTINCT FROM OLD.banned_at)
     OR (NEW.ban_reason IS DISTINCT FROM OLD.ban_reason)
  THEN
    RAISE EXCEPTION 'Insufficient privileges to modify ban fields' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_ban_columns'
  ) THEN
    CREATE TRIGGER trg_protect_ban_columns
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.protect_ban_columns();
  END IF;
END$$;

-- End of patch
