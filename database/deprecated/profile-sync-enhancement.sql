-- Enhanced Profile Management with Auto-Updates
-- Execute this SQL to replace the existing profile trigger with an enhanced version

-- =============================================================================
-- ENHANCED PROFILE SYNC FUNCTION
-- =============================================================================

-- Enhanced function to handle both profile creation and updates
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
        
        -- Log the profile update
        INSERT INTO public.user_activity_log (user_id, action, resource_type, resource_id, details)
        VALUES (
            NEW.id,
            'profile_synced',
            'profile',
            NEW.id,
            jsonb_build_object(
                'email_updated', OLD.email != NEW.email,
                'metadata_updated', OLD.raw_user_meta_data != NEW.raw_user_meta_data,
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
        INSERT INTO public.user_activity_log (user_id, action, resource_type, resource_id, details)
        VALUES (
            NEW.id,
            'profile_created',
            'profile',
            NEW.id,
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
-- UPDATE TRIGGERS
-- =============================================================================

-- Drop the old trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create new trigger that handles both creation and updates
CREATE TRIGGER on_auth_user_profile_sync
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_user_profile_sync();

-- =============================================================================
-- MANUAL PROFILE SYNC FUNCTION
-- =============================================================================

-- Function to manually sync profile data for existing users
CREATE OR REPLACE FUNCTION public.sync_profile_from_auth(user_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    auth_user RECORD;
    profile_updated INTEGER := 0;
    changes JSONB := '{}'::jsonb;
BEGIN
    -- Get user data from auth.users
    SELECT * INTO auth_user
    FROM auth.users 
    WHERE id = user_uuid;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found in auth.users'
        );
    END IF;
    
    -- Check if profile exists and update
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = user_uuid) THEN
        -- Update profile with auth data
        UPDATE public.profiles SET
            email = auth_user.email,
            full_name = COALESCE(
                auth_user.raw_user_meta_data->>'full_name',
                auth_user.raw_user_meta_data->>'name',
                full_name,
                split_part(auth_user.email, '@', 1)
            ),
            avatar_url = COALESCE(
                auth_user.raw_user_meta_data->>'avatar_url',
                avatar_url
            ),
            last_active = NOW(),
            updated_at = NOW()
        WHERE id = user_uuid
        AND (
            email != auth_user.email OR
            full_name != COALESCE(auth_user.raw_user_meta_data->>'full_name', auth_user.raw_user_meta_data->>'name', full_name) OR
            avatar_url != COALESCE(auth_user.raw_user_meta_data->>'avatar_url', avatar_url)
        );
        
        GET DIAGNOSTICS profile_updated = ROW_COUNT;
        
        IF profile_updated > 0 THEN
            changes := jsonb_build_object(
                'email_synced', true,
                'profile_synced', true,
                'synced_at', NOW()
            );
            
            -- Log the manual sync
            PERFORM public.log_user_activity(
                user_uuid,
                'profile_manual_sync',
                'profile',
                user_uuid,
                changes
            );
        END IF;
    ELSE
        -- Create profile if it doesn't exist
        INSERT INTO public.profiles (id, email, full_name, avatar_url, last_active)
        VALUES (
            user_uuid,
            auth_user.email,
            COALESCE(
                auth_user.raw_user_meta_data->>'full_name',
                auth_user.raw_user_meta_data->>'name',
                split_part(auth_user.email, '@', 1)
            ),
            auth_user.raw_user_meta_data->>'avatar_url',
            NOW()
        );
        
        profile_updated := 1;
        changes := jsonb_build_object(
            'profile_created', true,
            'created_at', NOW()
        );
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'updated', profile_updated > 0,
        'changes', changes
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- BATCH SYNC FUNCTION
-- =============================================================================

-- Function to sync all existing user profiles
CREATE OR REPLACE FUNCTION public.sync_all_profiles()
RETURNS TABLE (
    user_id UUID,
    sync_result JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        au.id as user_id,
        public.sync_profile_from_auth(au.id) as sync_result
    FROM auth.users au;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

-- Verify the enhanced trigger is installed
DO $$
BEGIN
    -- Check if the new trigger exists
    IF EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'on_auth_user_profile_sync'
        AND event_object_table = 'users'
    ) THEN
        RAISE NOTICE 'Enhanced profile sync trigger installed successfully!';
        RAISE NOTICE 'Features enabled:';
        RAISE NOTICE '  ✓ Auto profile creation on first sign-in';
        RAISE NOTICE '  ✓ Auto profile updates on subsequent sign-ins';
        RAISE NOTICE '  ✓ Manual sync function available';
        RAISE NOTICE '  ✓ Batch sync for existing users';
        RAISE NOTICE 'Profile data will now stay in sync with Google account changes!';
    ELSE
        RAISE EXCEPTION 'Enhanced profile sync trigger was not installed correctly';
    END IF;
END $$;

-- =============================================================================
-- USAGE EXAMPLES
-- =============================================================================

/*
-- Manual sync for a specific user:
SELECT public.sync_profile_from_auth('your-user-uuid-here');

-- Sync all existing user profiles:
SELECT * FROM public.sync_all_profiles();

-- Check recent profile sync activity:
SELECT * FROM public.user_activity_log 
WHERE action IN ('profile_created', 'profile_synced', 'profile_manual_sync')
ORDER BY timestamp DESC;
*/
