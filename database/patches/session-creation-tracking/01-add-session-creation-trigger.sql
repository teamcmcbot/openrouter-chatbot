-- =============================================================================
-- SESSION CREATION TRACKING PATCH
-- =============================================================================
-- This patch adds a trigger to track user usage when new chat sessions are created.
-- It calls the existing public.track_user_usage() function with p_session_created=true.
--
-- DEPENDENCIES:
-- - public.chat_sessions table (defined in 02-chat.sql)
-- - public.track_user_usage() function (defined in 01-users.sql)
--
-- IDEMPOTENCY: This script can be run multiple times safely.
-- =============================================================================

-- Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS on_session_created ON public.chat_sessions;

-- Drop existing function if it exists (for idempotency)
DROP FUNCTION IF EXISTS public.track_session_creation();

-- Create function to track session creation
CREATE OR REPLACE FUNCTION public.track_session_creation()
RETURNS TRIGGER AS $$
BEGIN
    -- Call track_user_usage with session_created = true
    -- All other parameters are set to 0/default since this is just session creation
    PERFORM public.track_user_usage(
        NEW.user_id,           -- p_user_id
        0,                     -- p_messages_sent (0 for new session)
        0,                     -- p_messages_received (0 for new session)
        0,                     -- p_input_tokens (0 for new session)
        0,                     -- p_output_tokens (0 for new session)
        NULL,                  -- p_model_used (NULL for new session)
        true,                  -- p_session_created (TRUE - this is the key parameter)
        0                      -- p_active_minutes (0 for new session)
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for INSERT operations on chat_sessions
CREATE TRIGGER on_session_created
    AFTER INSERT ON public.chat_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.track_session_creation();

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- Run these queries to verify the trigger was created successfully:
--
-- 1. Check if trigger exists:
-- SELECT tgname, tgrelid::regclass, tgtype 
-- FROM pg_trigger 
-- WHERE tgname = 'on_session_created';
--
-- 2. Check if function exists:
-- SELECT proname, prosrc 
-- FROM pg_proc 
-- WHERE proname = 'track_session_creation';
--
-- 3. Test the trigger (replace with actual user_id):
-- INSERT INTO public.chat_sessions (id, user_id, title) 
-- VALUES ('test_session_' || extract(epoch from now()), 'your-user-uuid-here', 'Test Session');
--
-- 4. Check if usage was tracked:
-- SELECT * FROM public.user_usage_daily 
-- WHERE user_id = 'your-user-uuid-here' 
-- AND usage_date = CURRENT_DATE;
-- =============================================================================
