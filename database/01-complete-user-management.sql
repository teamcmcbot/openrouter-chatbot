-- =============================================================================
-- COMPREHENSIVE DATABASE SCHEMA - PHASE 1: USER PROFILES & AUTHENTICATION
-- =============================================================================
-- Execute this first to set up user management and authentication
-- Includes all enhancements: profile sync, activity logging, preferences

-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- User profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    -- Primary key and user reference
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    
    -- Basic profile information (auto-synced from Google OAuth)
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    avatar_url TEXT,
    
    -- User preferences
    default_model VARCHAR(100) DEFAULT 'deepseek/deepseek-r1-0528:free',
    temperature DECIMAL(3,2) DEFAULT 0.7 CHECK (temperature >= 0.0 AND temperature <= 2.0),
    system_prompt TEXT DEFAULT 'You are a helpful AI assistant.',
    
    -- User tier and credits
    subscription_tier VARCHAR(20) DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
    credits INTEGER DEFAULT 0 NOT NULL,
    
    -- Activity tracking
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    last_active TIMESTAMPTZ DEFAULT NOW(),
    
    -- Usage statistics (initialized after insert)
    usage_stats JSONB DEFAULT '{"total_messages": 0, "total_tokens": 0, "sessions_created": 0}'::jsonb
);

-- User activity log for audit trail
CREATE TABLE IF NOT EXISTS public.user_activity_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50),
    resource_id TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    ip_address INET,
    user_agent TEXT
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Profile indexes
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_last_active ON public.profiles(last_active);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_tier ON public.profiles(subscription_tier);

-- Activity log indexes
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON public.user_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON public.user_activity_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON public.user_activity_log(action);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;

-- Profile policies
CREATE POLICY "Users can view their own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Activity log policies
CREATE POLICY "Users can view their own activity" ON public.user_activity_log
    FOR SELECT USING (auth.uid() = user_id);

-- =============================================================================
-- UTILITY FUNCTIONS
-- =============================================================================

-- Function to update updated_at timestamp and initialize usage stats
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    
    -- Initialize last_reset timestamp if it's a new profile
    IF TG_OP = 'INSERT' THEN
        NEW.usage_stats = NEW.usage_stats || jsonb_build_object('last_reset', NOW()::text);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to log user activity
CREATE OR REPLACE FUNCTION public.log_user_activity(
    p_user_id UUID,
    p_action VARCHAR(50),
    p_resource_type VARCHAR(50) DEFAULT NULL,
    p_resource_id TEXT DEFAULT NULL,
    p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    activity_id UUID;
BEGIN
    INSERT INTO public.user_activity_log (user_id, action, resource_type, resource_id, details)
    VALUES (p_user_id, p_action, p_resource_type, p_resource_id, p_details)
    RETURNING id INTO activity_id;
    
    RETURN activity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced profile sync function (handles both creation and updates)
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
        -- This allows new users to get one profile_synced after profile_created
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
-- TRIGGERS
-- =============================================================================

-- Trigger to update updated_at timestamp and initialize usage stats
CREATE TRIGGER update_profiles_updated_at
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for automatic profile sync from auth.users
CREATE OR REPLACE TRIGGER on_auth_user_profile_sync
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_user_profile_sync();

-- =============================================================================
-- MANUAL SYNC FUNCTIONS
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
        WHERE id = user_uuid;
        
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
                user_uuid::text,
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
-- VERIFICATION & SETUP COMPLETE
-- =============================================================================

-- Verify everything is set up correctly
DO $$
BEGIN
    -- Check if tables exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
        RAISE EXCEPTION 'profiles table was not created';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_activity_log') THEN
        RAISE EXCEPTION 'user_activity_log table was not created';
    END IF;
    
    -- Check if trigger exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'on_auth_user_profile_sync'
    ) THEN
        RAISE EXCEPTION 'Profile sync trigger was not created';
    END IF;
    
    -- Success message
    RAISE NOTICE '============================================';
    RAISE NOTICE 'PHASE 1 SETUP COMPLETE!';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Tables created:';
    RAISE NOTICE '  ✓ profiles (with enhanced fields)';
    RAISE NOTICE '  ✓ user_activity_log (audit trail)';
    RAISE NOTICE 'Features enabled:';
    RAISE NOTICE '  ✓ Google OAuth profile sync';
    RAISE NOTICE '  ✓ User tier management';
    RAISE NOTICE '  ✓ Credits and usage tracking';
    RAISE NOTICE '  ✓ Activity logging';
    RAISE NOTICE '  ✓ Manual sync functions';
    RAISE NOTICE 'Ready for Phase 2: Chat History Tables';
    RAISE NOTICE '============================================';
END $$;
