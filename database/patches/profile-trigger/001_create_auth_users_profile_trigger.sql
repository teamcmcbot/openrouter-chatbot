-- Patch: Create trigger on auth.users to sync/create profile rows
-- Safe and idempotent

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE t.tgname = 'on_auth_user_profile_sync'
      AND n.nspname = 'auth'
  ) THEN
  CREATE TRIGGER on_auth_user_profile_sync
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_user_profile_sync();
  END IF;
END
$$;

-- Backfill missing profiles for existing users
WITH missing AS (
  SELECT u.id, u.email, u.raw_user_meta_data
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE p.id IS NULL
)
INSERT INTO public.profiles (id, email, full_name, avatar_url, last_active)
SELECT 
  id,
  email,
  COALESCE(
    NULLIF(raw_user_meta_data->>'full_name',''),
    NULLIF(raw_user_meta_data->>'name',''),
    split_part(email, '@', 1)
  ) AS full_name,
  NULLIF(raw_user_meta_data->>'avatar_url','') AS avatar_url,
  NOW()
FROM missing
ON CONFLICT DO NOTHING;
