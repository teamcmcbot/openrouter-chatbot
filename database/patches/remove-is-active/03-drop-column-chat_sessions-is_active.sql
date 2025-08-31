-- =============================================================================
-- REMOVE-IS-ACTIVE PATCH (STEP 03)
-- Drop column public.chat_sessions.is_active if it exists
-- Safe to run multiple times
-- =============================================================================

-- Ensure no dependent views/functions still reference the column before this step
ALTER TABLE IF EXISTS public.chat_sessions
    DROP COLUMN IF EXISTS is_active;
