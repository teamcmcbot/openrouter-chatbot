-- =============================================================================
-- ACTIVE SESSION MANAGEMENT PATCH
-- =============================================================================
-- Creates function to manage active session status without triggering 
-- unnecessary timestamp updates for simple status switches

-- Function to set one session active and all others inactive for a user
CREATE OR REPLACE FUNCTION public.set_active_session(
    target_user_id UUID,
    target_session_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    session_exists BOOLEAN;
BEGIN
    -- Verify session exists and belongs to user
    SELECT EXISTS (
        SELECT 1 FROM public.chat_sessions 
        WHERE id = target_session_id AND user_id = target_user_id
    ) INTO session_exists;
    
    IF NOT session_exists THEN
        RAISE EXCEPTION 'Session % not found for user %', target_session_id, target_user_id;
    END IF;
    
    -- Begin transaction for atomic update
    BEGIN
        -- First, set all user sessions to inactive
        UPDATE public.chat_sessions 
        SET is_active = false 
        WHERE user_id = target_user_id AND is_active = true;
        
        -- Then, set target session to active
        UPDATE public.chat_sessions 
        SET is_active = true 
        WHERE id = target_session_id AND user_id = target_user_id;
        
        -- Log the change for debugging
        RAISE NOTICE 'Set session % active for user %', target_session_id, target_user_id;
        
        RETURN TRUE;
        
    EXCEPTION WHEN OTHERS THEN
        -- Log error and re-raise
        RAISE EXCEPTION 'Failed to set active session: %', SQLERRM;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.set_active_session(UUID, TEXT) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.set_active_session IS 
'Sets specified session as active for a user and all other sessions as inactive. '
'Performs atomic update to maintain consistency. '
'Only updates is_active field to avoid triggering timestamp updates for session switching.';
