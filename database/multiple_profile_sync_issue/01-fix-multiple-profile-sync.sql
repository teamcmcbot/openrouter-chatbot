-- =============================================================================
-- FIX: Multiple Profile Sync Logging Issue
-- =============================================================================
-- This script updates the handle_user_profile_sync() function to prevent
-- multiple profile_synced entries from being logged during OAuth authentication.
--
-- Issue: During Google OAuth, Supabase performs multiple updates to auth.users
-- which triggers the sync function multiple times, creating duplicate log entries.
--
-- Solution: Add deduplication logic to check for recent sync activities
-- before logging new profile_synced entries.
-- =============================================================================

-- Backup the current function (for reference)
-- The original function will be replaced, but this comment shows what we're changing from

-- Updated function with deduplication logic
CREATE OR REPLACE FUNCTION public.handle_user_profile_sync()
RETURNS TRIGGER AS $$
DECLARE
    last_sync_time TIMESTAMPTZ;
    sync_threshold INTERVAL := '1 minute';
    profile_email_before VARCHAR(255);
    email_changed BOOLEAN := false;
    profile_created_recently BOOLEAN := false;
BEGIN
    -- Check if profile already exists
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
        -- Get current profile email for comparison
        SELECT email INTO profile_email_before 
        FROM public.profiles 
        WHERE id = NEW.id;
        
        -- Check if email will change
        email_changed := (profile_email_before != NEW.email);
        
        -- Check if profile was created recently (within last 2 minutes)
        -- This is used for logging purposes only
        SELECT EXISTS(
            SELECT 1 FROM public.user_activity_log
            WHERE user_id = NEW.id 
            AND action = 'profile_created'
            AND timestamp > NOW() - INTERVAL '2 minutes'
        ) INTO profile_created_recently;
        
        -- Check for recent sync to avoid duplicates
        -- Always check for recent syncs, regardless of profile creation status
        SELECT MAX(timestamp) INTO last_sync_time
        FROM public.user_activity_log
        WHERE user_id = NEW.id 
        AND action = 'profile_synced'
        AND timestamp > NOW() - sync_threshold;
        
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
        
        -- Log the profile update only if:
        -- 1. No recent sync occurred (within threshold), OR
        -- 2. Email has changed (important changes should always be logged)
        IF last_sync_time IS NULL OR email_changed THEN
            PERFORM public.log_user_activity(
                NEW.id,
                'profile_synced',
                'profile',
                NEW.id::text,
                jsonb_build_object(
                    'email_updated', email_changed,
                    'sync_source', 'google_oauth',
                    'deduplication_applied', last_sync_time IS NOT NULL AND NOT email_changed,
                    'new_user_sync', profile_created_recently
                )
            );
        END IF;
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
        
        -- Log the profile creation (always log new profile creation)
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

-- Verify the function was updated successfully
DO $$
BEGIN
    -- Check if the function exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.routines 
        WHERE routine_name = 'handle_user_profile_sync'
        AND routine_type = 'FUNCTION'
    ) THEN
        RAISE EXCEPTION 'handle_user_profile_sync function was not found after update';
    END IF;
    
    -- Success message
    RAISE NOTICE '============================================';
    RAISE NOTICE 'MULTIPLE PROFILE SYNC FIX APPLIED!';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Changes made:';
    RAISE NOTICE '  ✓ Updated handle_user_profile_sync() function';
    RAISE NOTICE '  ✓ Added 1-minute deduplication window';
    RAISE NOTICE '  ✓ Email changes still logged immediately';
    RAISE NOTICE '  ✓ Profile creation always logged';
    RAISE NOTICE '  ✓ New users get one sync after creation';
    RAISE NOTICE '';
    RAISE NOTICE 'Expected behavior:';
    RAISE NOTICE '  • NEW users: 1 profile_created + 1 profile_synced';
    RAISE NOTICE '  • EXISTING users: 1 profile_synced per sign-in';
    RAISE NOTICE '============================================';
END $$;
