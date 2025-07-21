-- =============================================================================
-- ROLLBACK: Multiple Profile Sync Logging Issue Fix
-- =============================================================================
-- This script restores the original handle_user_profile_sync() function
-- in case the fix needs to be reverted.
--
-- Use this if the fix causes any issues or unexpected behavior.
-- =============================================================================

-- Restore the original function (without deduplication logic)
CREATE OR REPLACE FUNCTION public.handle_user_profile_sync()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if profile already exists
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
        -- Profile exists, update with latest information from Google
        UPDATE public.profiles SET
            email = NEW.email,
            full_name = COALESCE(
                NEW.raw_user_meta_data->>'full_name', 
                NEW.raw_user_meta_data->>'name', 
                full_name,  -- Keep existing if no new data
                split_part(NEW.email, '@', 1)
            ),
            avatar_url = COALESCE(
                NEW.raw_user_meta_data->>'avatar_url',
                avatar_url  -- Keep existing if no new data
            ),
            last_active = NOW(),
            updated_at = NOW()
        WHERE id = NEW.id;
        
        -- Log the profile update (ORIGINAL BEHAVIOR - logs every time)
        PERFORM public.log_user_activity(
            NEW.id,
            'profile_synced',
            'profile',
            NEW.id::text,
            jsonb_build_object(
                'email_updated', (SELECT email FROM public.profiles WHERE id = NEW.id) != NEW.email,
                'sync_source', 'google_oauth'
            )
        );
    ELSE
        -- Profile doesn't exist, create new one
        INSERT INTO public.profiles (id, email, full_name, avatar_url, last_active)
        VALUES (
            NEW.id,
            NEW.email,
            COALESCE(
                NEW.raw_user_meta_data->>'full_name', 
                NEW.raw_user_meta_data->>'name', 
                split_part(NEW.email, '@', 1)
            ),
            NEW.raw_user_meta_data->>'avatar_url',
            NOW()
        );
        
        -- Log the profile creation
        PERFORM public.log_user_activity(
            NEW.id,
            'profile_created',
            'profile',
            NEW.id::text,
            jsonb_build_object(
                'sync_source', 'google_oauth',
                'created_from_oauth', true
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

-- Verify the rollback was successful
DO $$
BEGIN
    -- Check if the function exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.routines 
        WHERE routine_name = 'handle_user_profile_sync'
        AND routine_type = 'FUNCTION'
    ) THEN
        RAISE EXCEPTION 'handle_user_profile_sync function was not found after rollback';
    END IF;
    
    -- Success message
    RAISE NOTICE '============================================';
    RAISE NOTICE 'ROLLBACK COMPLETED SUCCESSFULLY!';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Changes reverted:';
    RAISE NOTICE '  ✓ Restored original handle_user_profile_sync() function';
    RAISE NOTICE '  ✓ Removed deduplication logic';
    RAISE NOTICE '  ✓ Back to original behavior';
    RAISE NOTICE '';
    RAISE NOTICE 'Current behavior (original):';
    RAISE NOTICE '  • NEW users: 1 profile_created + 7 profile_synced';
    RAISE NOTICE '  • EXISTING users: 3 profile_synced per sign-in';
    RAISE NOTICE '============================================';
END $$;
