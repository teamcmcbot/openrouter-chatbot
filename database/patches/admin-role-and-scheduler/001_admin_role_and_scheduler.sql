-- Patch: Admin role & scheduler groundwork
-- Safe, idempotent changes introducing profiles.account_type, admin policies, and related helpers.

-- 1) Add profiles.account_type with default 'user' and check constraint
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type TEXT;

-- Set default and backfill
ALTER TABLE public.profiles
  ALTER COLUMN account_type SET DEFAULT 'user';

UPDATE public.profiles
SET account_type = 'user'
WHERE account_type IS NULL;

-- Enforce NOT NULL
ALTER TABLE public.profiles
  ALTER COLUMN account_type SET NOT NULL;

-- Add check constraint if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_account_type_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_account_type_check
      CHECK (account_type IN ('user','admin'));
  END IF;
END$$;

-- Index to speed up admin lookups
CREATE INDEX IF NOT EXISTS idx_profiles_account_type_admin
  ON public.profiles(account_type)
  WHERE account_type = 'admin';


-- 2) Helper: is_admin(user_uuid) for RLS and server checks
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id
      AND account_type = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO PUBLIC;


-- 3) Model sync log: attribute who triggered (optional, nullable)
ALTER TABLE public.model_sync_log
  ADD COLUMN IF NOT EXISTS added_by_user_id UUID NULL;


-- 4) RLS: update admin-only access to sync logs to use account_type via is_admin()
-- Drop old policy if present (it referenced subscription_tier = 'admin')
DROP POLICY IF EXISTS "Only admins can view sync logs" ON public.model_sync_log;

CREATE POLICY "Only admins can view sync logs" ON public.model_sync_log
  FOR SELECT
  USING (public.is_admin(auth.uid()));


-- 5) RLS: allow admins to view/update any profile in addition to self policies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Admins can view any profile'
  ) THEN
    CREATE POLICY "Admins can view any profile" ON public.profiles
      FOR SELECT
      USING (public.is_admin(auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Admins can update any profile'
  ) THEN
    CREATE POLICY "Admins can update any profile" ON public.profiles
      FOR UPDATE
      USING (public.is_admin(auth.uid()));
  END IF;
END $$;


-- 6) Function: tighten update_user_tier to exclude 'admin' from subscription_tier
--   (Admin is now represented by profiles.account_type)
CREATE OR REPLACE FUNCTION public.update_user_tier(
    user_uuid UUID,
    new_tier VARCHAR(20)
)
RETURNS JSONB AS $$
DECLARE
    old_tier VARCHAR(20);
    tier_updated BOOLEAN := false;
BEGIN
    -- Validate tier (admin removed here)
    IF new_tier NOT IN ('free', 'pro', 'enterprise') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid tier. Must be: free, pro, or enterprise'
        );
    END IF;

    -- Update subscription_tier
    UPDATE public.profiles
    SET subscription_tier = new_tier,
        updated_at = NOW()
    WHERE id = user_uuid
    RETURNING subscription_tier INTO old_tier;

    GET DIAGNOSTICS tier_updated = ROW_COUNT;

    IF tier_updated = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found'
        );
    END IF;

    -- Log the tier change
    PERFORM public.log_user_activity(
        user_uuid,
        'tier_updated',
        'profile',
        user_uuid::text,
        jsonb_build_object(
            'old_tier', old_tier,
            'new_tier', new_tier
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'old_tier', old_tier,
        'new_tier', new_tier,
        'updated_at', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7) (Optional) future: consider adding admin-only policies for model_access UPDATE if needed later
-- For now, leave model_access RLS as read-only for users; admin endpoints can use service role.

-- End of patch
