-- ============================================================================
-- Patch: account-banning / 002-temp-ban-permanent-flag.sql
-- Purpose: Ensure temporary bans auto-expire without background jobs by
--          only setting profiles.is_banned for permanent bans.
--          Also normalize existing rows where temp bans had is_banned=true.
-- Safety: Idempotent where possible; uses CREATE OR REPLACE for functions.
-- ============================================================================

-- 1) Normalize existing data: clear is_banned when a temporary ban is in effect
--    (past or future). Temporary bans are represented solely by banned_until.
UPDATE public.profiles
   SET is_banned = false
 WHERE banned_until IS NOT NULL
   AND is_banned = true;

-- 2) Update ban_user to only set is_banned for permanent bans
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
     SET is_banned   = (p_until IS NULL), -- permanent only
         banned_at   = now(),
         banned_until= p_until,
         ban_reason  = p_reason,
         updated_at  = now()
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

-- 3) Unban function already clears is_banned and banned_until; keep as-is

-- End of patch
