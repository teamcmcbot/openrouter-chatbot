-- =====================================================================================
-- Migration: Add AI Personality Presets Support
-- =====================================================================================
-- Description: Add personality_preset column to support preset personality styles.
--              Both personality_preset and system_prompt are separate, composable fields.
-- Created: 2025-10-02
-- Author: AI Assistant
-- Related: /backlog/personality-feature.md
-- =====================================================================================

BEGIN;

-- =====================================================================================
-- STEP 1: Add personality_preset column (nullable for backward compatibility)
-- =====================================================================================

ALTER TABLE public.profiles 
ADD COLUMN personality_preset TEXT;

-- Add helpful documentation
COMMENT ON COLUMN public.profiles.personality_preset IS 
  'AI personality preset text. When set, this is prepended to system_prompt in chat completions. Can be combined with system_prompt for layered customization.';

COMMENT ON COLUMN public.profiles.system_prompt IS 
  'Custom system prompt (user instructions). Combined with personality_preset if both are set. Default: "You are a helpful AI assistant."';

-- =====================================================================================
-- STEP 2: Create index for personality_preset (optional, for analytics/filtering)
-- =====================================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_personality_preset 
ON public.profiles(personality_preset) 
WHERE personality_preset IS NOT NULL;

-- =====================================================================================
-- Verification Queries (for manual testing)
-- =====================================================================================

-- Uncomment these queries to verify the migration results:

-- Check column was added successfully
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'profiles'
--   AND column_name = 'personality_preset';

-- Check users with personality presets set
-- SELECT COUNT(*) as preset_users
-- FROM public.profiles 
-- WHERE personality_preset IS NOT NULL;

-- Check users with system prompts
-- SELECT COUNT(*) as system_prompt_users
-- FROM public.profiles 
-- WHERE system_prompt IS NOT NULL 
--   AND system_prompt != 'You are a helpful AI assistant.';

-- Sample users to verify schema
-- SELECT id, 
--        LEFT(personality_preset, 50) as preset_preview,
--        LEFT(system_prompt, 50) as system_prompt_preview,
--        created_at
-- FROM public.profiles 
-- ORDER BY created_at DESC 
-- LIMIT 10;

COMMIT;

-- =====================================================================================
-- Rollback Instructions
-- =====================================================================================
-- If this migration needs to be rolled back, run the following:
--
-- BEGIN;
-- 
-- -- Drop the index
-- DROP INDEX IF EXISTS public.idx_profiles_personality_preset;
-- 
-- -- Drop personality_preset column
-- ALTER TABLE public.profiles 
-- DROP COLUMN IF EXISTS personality_preset;
-- 
-- COMMIT;
-- =====================================================================================
