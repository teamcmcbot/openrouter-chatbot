-- =============================================================================
-- REMOVE-IS-ACTIVE PATCH (STEP 02)
-- Drop RPC public.set_active_session if it exists
-- Safe to run multiple times
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'set_active_session'
          AND n.nspname = 'public'
    ) THEN
        -- Revoke grants before drop (ignore errors if not present)
        BEGIN
            REVOKE EXECUTE ON FUNCTION public.set_active_session(UUID, TEXT) FROM authenticated;
        EXCEPTION WHEN undefined_function THEN
            -- ignore
        END;
        
        -- Drop the function
        EXECUTE 'DROP FUNCTION IF EXISTS public.set_active_session(UUID, TEXT)';
    END IF;
END $$;