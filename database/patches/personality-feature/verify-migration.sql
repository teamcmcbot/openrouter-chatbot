-- =====================================================================================
-- Verification Script for Personality Preset Migration
-- =====================================================================================
-- Run this to verify the migration was successful
-- =====================================================================================

-- 1. Check that personality_preset column exists
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name = 'personality_preset';

-- Expected: 1 row with data_type='text', is_nullable='YES'

-- 2. Check both columns are present
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN ('personality_preset', 'system_prompt')
ORDER BY column_name;

-- Expected: 2 rows

-- 3. Check the partial index was created
SELECT 
  indexname, 
  indexdef
FROM pg_indexes
WHERE tablename = 'profiles'
  AND indexname = 'idx_profiles_personality_preset';

-- Expected: 1 row with partial index definition

-- 4. Check column comments
SELECT 
  col_description('profiles'::regclass::oid, ordinal_position) as column_comment,
  column_name
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN ('personality_preset', 'system_prompt')
ORDER BY column_name;

-- Expected: 2 rows with helpful comments

-- 5. Verify all existing users have personality_preset = NULL
SELECT
  COUNT(*) as total_users,
  COUNT(personality_preset) as users_with_preset,
  COUNT(system_prompt) as users_with_system_prompt
FROM public.profiles;

-- Expected: users_with_preset = 0 (all NULL initially)

-- 6. Test inserting a personality preset value
BEGIN;

-- Create test profile (or update existing)
INSERT INTO public.profiles (id, personality_preset, system_prompt, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Be professional and concise in all responses.',
  'You are a helpful AI assistant.',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Verify insert worked
SELECT 
  id,
  LEFT(personality_preset, 50) as preset_preview,
  LEFT(system_prompt, 50) as prompt_preview
FROM public.profiles
WHERE personality_preset IS NOT NULL
LIMIT 1;

ROLLBACK; -- Don't actually save the test data

-- 7. Sample existing user data (verify no data was lost or modified)
SELECT
  id,
  LEFT(personality_preset, 30) as preset,
  LEFT(system_prompt, 30) as prompt,
  created_at
FROM public.profiles
ORDER BY created_at DESC
LIMIT 5;

-- Expected: All personality_preset should be NULL, system_prompt should be unchanged

-- =====================================================================================
-- Summary
-- =====================================================================================
-- If all queries above return expected results, migration is successful!
-- 
-- Next steps:
-- 1. Mark Phase 1 complete in /backlog/personality-feature.md
-- 2. Proceed to Phase 2: Backend implementation
-- =====================================================================================
