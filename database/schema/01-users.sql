-- =============================================================================
-- FINAL USER SCHEMA
-- =============================================================================
-- This file contains the final structure for user-related tables,
-- functions, triggers, and RLS policies.

-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- User profiles table (extends Supabase auth.users)
CREATE TABLE public.profiles (
    -- Primary key and user reference
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,

    -- Basic profile information (auto-synced from Google OAuth)
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    avatar_url TEXT,

    -- User preferences
    default_model VARCHAR(100), -- Made nullable, no default
    temperature DECIMAL(3,2) DEFAULT 0.7 CHECK (temperature >= 0.0 AND temperature <= 2.0),
    system_prompt TEXT DEFAULT 'You are a helpful AI assistant.',

    -- User tier and credits
    subscription_tier VARCHAR(20) DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
    account_type TEXT NOT NULL DEFAULT 'user' CHECK (account_type IN ('user','admin')),
    credits INTEGER DEFAULT 0 NOT NULL,

    -- Activity tracking
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    last_active TIMESTAMPTZ DEFAULT NOW(),

    -- Usage statistics (initialized after insert)
    usage_stats JSONB DEFAULT '{"total_messages": 0, "total_tokens": 0, "sessions_created": 0}'::jsonb,

    -- UI preferences
    ui_preferences JSONB DEFAULT '{
        "theme": "dark",
        "sidebar_width": 280,
        "code_highlighting": true,
        "auto_save": true,
        "show_token_count": true,
        "compact_mode": false,
        "show_model_info": true,
        "auto_scroll": true,
        "message_grouping": true
    }'::jsonb,

    -- Session preferences
    session_preferences JSONB DEFAULT '{
        "max_history": 10,
        "auto_title": true,
        "save_anonymous": false,
        "auto_save_interval": 30,
        "confirm_delete": true,
        "show_timestamps": true,
        "export_format": "markdown"
    }'::jsonb
    -- allowed_models column removed as per migration 05
);

-- User activity log for audit trail
CREATE TABLE public.user_activity_log (
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

-- Daily usage tracking
CREATE TABLE public.user_usage_daily (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    usage_date DATE NOT NULL,

    -- Message statistics
    messages_sent INTEGER DEFAULT 0,
    messages_received INTEGER DEFAULT 0,

    -- Token usage
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,

    -- Model usage
    models_used JSONB DEFAULT '{}'::jsonb,

    -- Session statistics
    sessions_created INTEGER DEFAULT 0,
    active_minutes INTEGER DEFAULT 0,

    -- Cost tracking (for paid models)
    estimated_cost DECIMAL(10,4) DEFAULT 0.0000,

    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    UNIQUE(user_id, usage_date)
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Profile indexes
CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_profiles_last_active ON public.profiles(last_active);
CREATE INDEX idx_profiles_subscription_tier ON public.profiles(subscription_tier);
CREATE INDEX idx_profiles_account_type_admin ON public.profiles(account_type) WHERE account_type = 'admin';

-- Activity log indexes
CREATE INDEX idx_activity_log_user_id ON public.user_activity_log(user_id);
CREATE INDEX idx_activity_log_timestamp ON public.user_activity_log(timestamp);
CREATE INDEX idx_activity_log_action ON public.user_activity_log(action);

-- Usage tracking indexes
CREATE INDEX idx_usage_daily_user_date ON public.user_usage_daily(user_id, usage_date DESC);
CREATE INDEX idx_usage_daily_date ON public.user_usage_daily(usage_date DESC);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_usage_daily ENABLE ROW LEVEL SECURITY;

-- Profile policies
CREATE POLICY "Users can view their own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Admin override policies
CREATE POLICY "Admins can view any profile" ON public.profiles
    FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update any profile" ON public.profiles
    FOR UPDATE USING (public.is_admin(auth.uid()));

-- Activity log policies
CREATE POLICY "Users can view their own activity" ON public.user_activity_log
    FOR SELECT USING (auth.uid() = user_id);

-- Usage daily policies
CREATE POLICY "Users can view their own usage" ON public.user_usage_daily
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own usage" ON public.user_usage_daily
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own usage" ON public.user_usage_daily
    FOR UPDATE USING (auth.uid() = user_id);

-- =============================================================================
-- UTILITY FUNCTIONS
-- =============================================================================

-- Helper function for jsonb deep merge
CREATE OR REPLACE FUNCTION jsonb_deep_merge(a jsonb, b jsonb)
RETURNS jsonb AS $$
DECLARE
    result jsonb := a;
    key text;
    value jsonb;
BEGIN
    FOR key, value IN SELECT * FROM jsonb_each(b)
    LOOP
        IF jsonb_typeof(value) = 'object' AND result ? key AND jsonb_typeof(result -> key) = 'object' THEN
            result := jsonb_set(result, ARRAY[key], jsonb_deep_merge(result -> key, value));
        ELSE
            result := jsonb_set(result, ARRAY[key], value);
        END IF;
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

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

-- Helper: check if a user is admin
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_user_id
            AND account_type = 'admin'
    );
$$;

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

-- Function to track user usage
CREATE OR REPLACE FUNCTION public.track_user_usage(
    p_user_id UUID,
    p_messages_sent INTEGER DEFAULT 0,
    p_messages_received INTEGER DEFAULT 0,
    p_input_tokens INTEGER DEFAULT 0,
    p_output_tokens INTEGER DEFAULT 0,
    p_model_used VARCHAR(100) DEFAULT NULL,
    p_session_created BOOLEAN DEFAULT false,
    p_active_minutes INTEGER DEFAULT 0
)
RETURNS VOID AS $$
DECLARE
    today_date DATE := CURRENT_DATE;
    model_usage JSONB;
BEGIN
    -- Get current model usage for today
    SELECT models_used INTO model_usage
    FROM public.user_usage_daily
    WHERE user_id = p_user_id AND usage_date = today_date;

    -- Update model usage if a model was used
    IF p_model_used IS NOT NULL THEN
        IF model_usage IS NULL THEN
            model_usage := jsonb_build_object(p_model_used, 1);
        ELSE
            model_usage := jsonb_set(
                model_usage,
                ARRAY[p_model_used],
                (COALESCE((model_usage->>p_model_used)::integer, 0) + 1)::text::jsonb
            );
        END IF;
    END IF;

    -- Insert or update daily usage
    INSERT INTO public.user_usage_daily (
        user_id, usage_date, messages_sent, messages_received,
        input_tokens, output_tokens, total_tokens, models_used,
        sessions_created, active_minutes
    ) VALUES (
        p_user_id, today_date, p_messages_sent, p_messages_received,
        p_input_tokens, p_output_tokens, p_input_tokens + p_output_tokens,
        COALESCE(model_usage, '{}'::jsonb),
        CASE WHEN p_session_created THEN 1 ELSE 0 END,
        p_active_minutes
    )
    ON CONFLICT (user_id, usage_date) DO UPDATE SET
        messages_sent = user_usage_daily.messages_sent + EXCLUDED.messages_sent,
        messages_received = user_usage_daily.messages_received + EXCLUDED.messages_received,
        input_tokens = user_usage_daily.input_tokens + EXCLUDED.input_tokens,
        output_tokens = user_usage_daily.output_tokens + EXCLUDED.output_tokens,
        total_tokens = user_usage_daily.total_tokens + EXCLUDED.total_tokens,
        models_used = COALESCE(EXCLUDED.models_used, user_usage_daily.models_used),
        sessions_created = user_usage_daily.sessions_created + EXCLUDED.sessions_created,
        active_minutes = user_usage_daily.active_minutes + EXCLUDED.active_minutes,
        updated_at = NOW();

    -- Update profile usage stats
    UPDATE public.profiles SET
        usage_stats = jsonb_set(
            jsonb_set(
                jsonb_set(
                    usage_stats,
                    '{total_messages}',
                    ((COALESCE((usage_stats->>'total_messages')::integer, 0) + p_messages_sent + p_messages_received))::text::jsonb
                ),
                '{total_tokens}',
                ((COALESCE((usage_stats->>'total_tokens')::integer, 0) + p_input_tokens + p_output_tokens))::text::jsonb
            ),
            '{sessions_created}',
            ((COALESCE((usage_stats->>'sessions_created')::integer, 0) + CASE WHEN p_session_created THEN 1 ELSE 0 END))::text::jsonb
        ),
        last_active = NOW()
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update user tier
CREATE OR REPLACE FUNCTION public.update_user_tier(
    user_uuid UUID,
    new_tier VARCHAR(20)
)
RETURNS JSONB AS $$
DECLARE
    old_tier VARCHAR(20);
    tier_updated BOOLEAN := false;
BEGIN
    -- Validate tier
    IF new_tier NOT IN ('free', 'pro', 'enterprise') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid tier. Must be: free, pro, or enterprise'
        );
    END IF;

    -- Get current tier and update
    UPDATE public.profiles
    SET subscription_tier = new_tier,
        updated_at = NOW()
    WHERE id = user_uuid
    RETURNING subscription_tier INTO old_tier;

    GET DIAGNOSTICS tier_updated = ROW_COUNT;

    IF tier_updated = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found'
        );
    END IF;

    -- Log the tier change
    PERFORM public.log_user_activity(
        user_uuid,
        'tier_updated',
        'profile',
        user_uuid::text,
        jsonb_build_object(
            'old_tier', old_tier,
            'new_tier', new_tier
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'old_tier', old_tier,
        'new_tier', new_tier,
        'updated_at', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update user preferences
CREATE OR REPLACE FUNCTION public.update_user_preferences(
    user_uuid UUID,
    preference_type VARCHAR(50), -- 'ui', 'session', 'model'
    preferences JSONB
)
RETURNS JSONB AS $$
DECLARE
    updated_count INTEGER;
    current_prefs JSONB;
BEGIN
    -- Validate preference type
    IF preference_type NOT IN ('ui', 'session', 'model') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid preference type. Must be: ui, session, or model'
        );
    END IF;

    -- Update based on preference type
    CASE preference_type
        WHEN 'ui' THEN
            UPDATE public.profiles
            SET ui_preferences = jsonb_deep_merge(COALESCE(ui_preferences, '{}'::jsonb), preferences),
                updated_at = NOW()
            WHERE id = user_uuid;

        WHEN 'session' THEN
            UPDATE public.profiles
            SET session_preferences = jsonb_deep_merge(COALESCE(session_preferences, '{}'::jsonb), preferences),
                updated_at = NOW()
            WHERE id = user_uuid;

        WHEN 'model' THEN
            UPDATE public.profiles
            SET default_model = COALESCE(preferences->>'default_model', default_model),
                temperature = COALESCE((preferences->>'temperature')::decimal, temperature),
                system_prompt = COALESCE(preferences->>'system_prompt', system_prompt),
                updated_at = NOW()
            WHERE id = user_uuid;
    END CASE;

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    IF updated_count = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found'
        );
    END IF;

    -- Log the preference update
    PERFORM public.log_user_activity(
        user_uuid,
        'preferences_updated',
        'profile',
        user_uuid::text,
        jsonb_build_object(
            'preference_type', preference_type,
            'updated_fields', preferences
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'preference_type', preference_type,
        'updated_at', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's complete profile with enhanced analytics
CREATE OR REPLACE FUNCTION public.get_user_complete_profile(user_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    profile_data RECORD;
    allowed_models_data JSONB;
    usage_stats_data JSONB;
    today_usage_data JSONB;
BEGIN
    -- Get main profile data
    SELECT
        id, email, full_name, avatar_url,
        default_model, temperature, system_prompt, subscription_tier, credits,
        ui_preferences, session_preferences,
        created_at, updated_at, last_active, usage_stats
    INTO profile_data
    FROM public.profiles
    WHERE id = user_uuid;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'User not found');
    END IF;

    -- Get allowed models with details (from model_access table)
    SELECT jsonb_agg(
        jsonb_build_object(
            'model_id', model_id,
            'model_name', model_name,
            'model_description', model_description,
            'model_tags', model_tags,
            'daily_limit', daily_limit,
            'monthly_limit', monthly_limit
        )
    ) INTO allowed_models_data
    FROM public.get_user_allowed_models(user_uuid);

    -- Get today's usage data specifically
    SELECT jsonb_build_object(
        'messages_sent', COALESCE(messages_sent, 0),
        'messages_received', COALESCE(messages_received, 0),
        'total_tokens', COALESCE(total_tokens, 0),
        'input_tokens', COALESCE(input_tokens, 0),
        'output_tokens', COALESCE(output_tokens, 0),
        'models_used', COALESCE(models_used, '{}'::jsonb),
        'sessions_created', COALESCE(sessions_created, 0),
        'active_minutes', COALESCE(active_minutes, 0)
    ) INTO today_usage_data
    FROM public.user_usage_daily
    WHERE user_id = user_uuid
    AND usage_date = CURRENT_DATE;

    -- If no data for today, return zeros
    IF today_usage_data IS NULL THEN
        today_usage_data := jsonb_build_object(
            'messages_sent', 0,
            'messages_received', 0,
            'total_tokens', 0,
            'input_tokens', 0,
            'output_tokens', 0,
            'models_used', '{}'::jsonb,
            'sessions_created', 0,
            'active_minutes', 0
        );
    END IF;

    -- Get recent usage stats (last 7 days for backwards compatibility)
    SELECT jsonb_build_object(
        'recent_days', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'usage_date', usage_date,
                    'messages_sent', messages_sent,
                    'messages_received', messages_received,
                    'total_tokens', total_tokens,
                    'models_used', models_used,
                    'sessions_created', sessions_created,
                    'active_minutes', active_minutes
                ) ORDER BY usage_date DESC
            )
            FROM public.user_usage_daily
            WHERE user_id = user_uuid
            AND usage_date >= CURRENT_DATE - INTERVAL '7 days'
        ),
        'today', today_usage_data,
        'all_time', profile_data.usage_stats
    ) INTO usage_stats_data;

    -- Return complete profile with enhanced analytics
    RETURN jsonb_build_object(
        'id', profile_data.id,
        'email', profile_data.email,
        'full_name', profile_data.full_name,
        'avatar_url', profile_data.avatar_url,
        'subscription_tier', profile_data.subscription_tier,
        'credits', profile_data.credits,
        'preferences', jsonb_build_object(
            'model', jsonb_build_object(
                'default_model', profile_data.default_model,
                'temperature', profile_data.temperature,
                'system_prompt', profile_data.system_prompt
            ),
            'ui', profile_data.ui_preferences,
            'session', profile_data.session_preferences
        ),
        'available_models', allowed_models_data,
        'usage_stats', usage_stats_data,
        'timestamps', jsonb_build_object(
            'created_at', profile_data.created_at,
            'updated_at', profile_data.updated_at,
            'last_active', profile_data.last_active
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to export user data (GDPR compliance)
CREATE OR REPLACE FUNCTION public.export_user_data(user_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    profile_data JSONB;
    conversations_data JSONB;
    activity_data JSONB;
    usage_data JSONB;
BEGIN
    -- Get profile data
    SELECT to_jsonb(p.*) INTO profile_data
    FROM public.profiles p
    WHERE id = user_uuid;

    -- Get conversations data
    SELECT jsonb_agg(
        jsonb_build_object(
            'session', to_jsonb(s.*),
            'messages', (
                SELECT jsonb_agg(to_jsonb(m.*))
                FROM public.chat_messages m
                WHERE m.session_id = s.id
                ORDER BY m.message_timestamp
            )
        )
    ) INTO conversations_data
    FROM public.chat_sessions s
    WHERE s.user_id = user_uuid;

    -- Get activity data
    SELECT jsonb_agg(to_jsonb(a.*)) INTO activity_data
    FROM public.user_activity_log a
    WHERE a.user_id = user_uuid
    ORDER BY a.timestamp DESC;

    -- Get usage data
    SELECT jsonb_agg(to_jsonb(u.*)) INTO usage_data
    FROM public.user_usage_daily u
    WHERE u.user_id = user_uuid
    ORDER BY u.usage_date DESC;

    RETURN jsonb_build_object(
        'export_date', NOW(),
        'user_id', user_uuid,
        'profile', profile_data,
        'conversations', COALESCE(conversations_data, '[]'::jsonb),
        'activity_log', COALESCE(activity_data, '[]'::jsonb),
        'usage_stats', COALESCE(usage_data, '[]'::jsonb)
    );
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
CREATE TRIGGER on_auth_user_profile_sync
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_user_profile_sync();
