-- =====================================================================================
-- Patch: Add AI Personality Presets Support
-- =====================================================================================
-- Issue: Personality Feature Implementation
-- Related: /backlog/personality-feature.md
-- Migration: /supabase/migrations/20251002000000_add_personality_presets.sql
-- =====================================================================================

-- This is a copy of the migration for database/patches/ structure
-- The canonical migration is in /supabase/migrations/

BEGIN;

-- Add personality_preset column (nullable, stores actual preset text)
ALTER TABLE public.profiles 
ADD COLUMN personality_preset TEXT;

-- Add documentation
COMMENT ON COLUMN public.profiles.personality_preset IS 
  'AI personality preset text. When set, this is prepended to system_prompt in chat completions. Can be combined with system_prompt for layered customization.';

COMMENT ON COLUMN public.profiles.system_prompt IS 
  'Custom system prompt (user instructions). Combined with personality_preset if both are set. Default: "You are a helpful AI assistant."';

-- Create index for analytics/filtering
CREATE INDEX IF NOT EXISTS idx_profiles_personality_preset 
ON public.profiles(personality_preset) 
WHERE personality_preset IS NOT NULL;

COMMIT;
