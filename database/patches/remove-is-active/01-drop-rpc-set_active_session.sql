-- =============================================================================
-- REMOVE-IS-ACTIVE PATCH (STEP 01)
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
        -- Attempt to revoke common grants before drop (ignore if signature differs)
        BEGIN
            REVOKE EXECUTE ON FUNCTION public.set_active_session(UUID, TEXT) FROM authenticated;
        EXCEPTION WHEN undefined_function THEN
            -- ignore (function or signature not found)
        END;

        -- Drop by known signature; if schema had a different signature, the EXISTS guard ensures we only try when present
        EXECUTE 'DROP FUNCTION IF EXISTS public.set_active_session(UUID, TEXT)';
    END IF;
END $$;
