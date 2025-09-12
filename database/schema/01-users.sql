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

    -- Moderation (ban) fields
    is_banned BOOLEAN NOT NULL DEFAULT false,
    banned_at TIMESTAMPTZ,
    banned_until TIMESTAMPTZ,
    ban_reason TEXT,
    violation_strikes INTEGER NOT NULL DEFAULT 0,

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

-- Data integrity constraints for ban fields
ALTER TABLE public.profiles
    ADD CONSTRAINT chk_violation_strikes_nonnegative CHECK (violation_strikes >= 0);

ALTER TABLE public.profiles
    ADD CONSTRAINT chk_banned_until_after_banned_at
    CHECK (banned_until IS NULL OR banned_at IS NULL OR banned_until > banned_at);

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

-- Moderation actions audit table (admin-only)
CREATE TABLE public.moderation_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('warned','banned','unbanned','temporary_ban')),
    reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
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
    generation_ms BIGINT DEFAULT 0, -- Total assistant generation time (ms)

    -- Cost tracking (for paid models)
    estimated_cost DECIMAL(12,6) DEFAULT 0.000000,

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
-- Ban-related indexes
CREATE INDEX idx_profiles_is_banned_true ON public.profiles(is_banned) WHERE is_banned = true;
CREATE INDEX idx_profiles_banned_until ON public.profiles(banned_until) WHERE banned_until IS NOT NULL;

-- Activity log indexes
CREATE INDEX idx_activity_log_user_id ON public.user_activity_log(user_id);
CREATE INDEX idx_activity_log_timestamp ON public.user_activity_log(timestamp);
CREATE INDEX idx_activity_log_action ON public.user_activity_log(action);

-- Moderation actions indexes
CREATE INDEX idx_moderation_actions_user_date ON public.moderation_actions(user_id, created_at DESC);

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
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;

-- Consolidated profile policies
CREATE POLICY "View profiles" ON public.profiles
    FOR SELECT USING (
        public.is_admin((select auth.uid())) OR (select auth.uid()) = id
    );

CREATE POLICY "Update profiles" ON public.profiles
    FOR UPDATE USING (
        public.is_admin((select auth.uid())) OR (select auth.uid()) = id
    ) WITH CHECK (
        public.is_admin((select auth.uid())) OR (select auth.uid()) = id
    );

-- Insert remains separate (no admin-wide insert policy needed)
CREATE POLICY "Users can insert their own profile" ON public.profiles
    FOR INSERT WITH CHECK ((select auth.uid()) = id);

-- Activity log policies
CREATE POLICY "Users can view their own activity" ON public.user_activity_log
    FOR SELECT USING ((select auth.uid()) = user_id);

-- Usage daily policies
CREATE POLICY "Users can view their own usage" ON public.user_usage_daily
    FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert their own usage" ON public.user_usage_daily
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own usage" ON public.user_usage_daily
    FOR UPDATE USING ((select auth.uid()) = user_id);

-- Moderation actions policies (admins only)
CREATE POLICY "Admins can view moderation actions" ON public.moderation_actions
    FOR SELECT USING (public.is_admin((select auth.uid())));

CREATE POLICY "Admins can insert moderation actions" ON public.moderation_actions
    FOR INSERT WITH CHECK (public.is_admin((select auth.uid())));

CREATE POLICY "Admins can update moderation actions" ON public.moderation_actions
    FOR UPDATE USING (public.is_admin((select auth.uid()))) WITH CHECK (public.is_admin((select auth.uid())));

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
$$ LANGUAGE plpgsql SET search_path = 'pg_catalog, public';

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'pg_catalog, public';

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

-- Determine if a user is effectively banned (permanent or temporary)
CREATE OR REPLACE FUNCTION public.is_banned(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(p.is_banned, false)
           OR (p.banned_until IS NOT NULL AND p.banned_until > now())
    FROM public.profiles p
    WHERE p.id = p_user_id;
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'pg_catalog, public';

-- Ban a user (permanent when p_until is null, temporary otherwise)
CREATE OR REPLACE FUNCTION public.ban_user(
    p_user_id uuid,
    p_until timestamptz DEFAULT NULL,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_action text;
    v_updated int := 0;
BEGIN
    -- Require admin unless running with elevated service role (auth.uid() is null in service contexts)
    IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
    END IF;

    v_action := CASE WHEN p_until IS NULL THEN 'banned' ELSE 'temporary_ban' END;

    UPDATE public.profiles
       SET is_banned   = (p_until IS NULL), -- permanent bans set flag, temporary rely on banned_until
           banned_at   = now(),
           banned_until= p_until,
           ban_reason  = p_reason,
           updated_at  = now()
     WHERE id = p_user_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    -- Write moderation action (admin audit)
    INSERT INTO public.moderation_actions(user_id, action, reason, metadata, created_by)
    VALUES (
        p_user_id,
        v_action,
        p_reason,
        jsonb_build_object('until', p_until),
        auth.uid()
    );

    -- Write activity log (user-scoped audit trail)
    PERFORM public.log_user_activity(
        p_user_id,
        'user_banned',
        'profile',
        p_user_id::text,
        jsonb_build_object('until', p_until)
    );

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'action', v_action,
        'until', p_until,
        'updated_at', now()
    );
END;
$$;

-- Unban a user
CREATE OR REPLACE FUNCTION public.unban_user(
    p_user_id uuid,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated int := 0;
BEGIN
    -- Require admin unless running with elevated service role
    IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
    END IF;

    UPDATE public.profiles
       SET is_banned = false,
           banned_until = NULL,
           ban_reason = NULL,
           updated_at = now()
     WHERE id = p_user_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    INSERT INTO public.moderation_actions(user_id, action, reason, metadata, created_by)
    VALUES (
        p_user_id,
        'unbanned',
        p_reason,
        '{}'::jsonb,
        auth.uid()
    );

    PERFORM public.log_user_activity(
        p_user_id,
        'user_unbanned',
        'profile',
        p_user_id::text,
        '{}'::jsonb
    );

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'action', 'unbanned',
        'updated_at', now()
    );
END;
$$;

-- Execution grants
GRANT EXECUTE ON FUNCTION public.is_banned(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.ban_user(uuid, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unban_user(uuid, text) TO authenticated;

-- Hardening: prevent non-admins from editing ban columns directly via profile updates
CREATE OR REPLACE FUNCTION public.protect_ban_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Service role (no auth.uid) bypasses; admins allowed
    IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
        RETURN NEW;
    END IF;

    -- If any ban-related column changed by a non-admin, block the update
    IF (COALESCE(NEW.is_banned, false) IS DISTINCT FROM COALESCE(OLD.is_banned, false))
         OR (NEW.banned_until IS DISTINCT FROM OLD.banned_until)
         OR (NEW.banned_at IS DISTINCT FROM OLD.banned_at)
         OR (NEW.ban_reason IS DISTINCT FROM OLD.ban_reason)
    THEN
        RAISE EXCEPTION 'Insufficient privileges to modify ban fields' USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

-- Function to track user usage
CREATE OR REPLACE FUNCTION public.track_user_usage(
    p_user_id UUID,
    p_messages_sent INTEGER DEFAULT 0,
    p_messages_received INTEGER DEFAULT 0,
    p_input_tokens INTEGER DEFAULT 0,
    p_output_tokens INTEGER DEFAULT 0,
    p_model_used VARCHAR(100) DEFAULT NULL,
    p_session_created BOOLEAN DEFAULT false,
    p_generation_ms BIGINT DEFAULT 0
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
        sessions_created, generation_ms
    ) VALUES (
        p_user_id, today_date, p_messages_sent, p_messages_received,
        p_input_tokens, p_output_tokens, p_input_tokens + p_output_tokens,
        COALESCE(model_usage, '{}'::jsonb),
        CASE WHEN p_session_created THEN 1 ELSE 0 END,
        p_generation_ms
    )
    ON CONFLICT (user_id, usage_date) DO UPDATE SET
        messages_sent = user_usage_daily.messages_sent + EXCLUDED.messages_sent,
        messages_received = user_usage_daily.messages_received + EXCLUDED.messages_received,
        input_tokens = user_usage_daily.input_tokens + EXCLUDED.input_tokens,
        output_tokens = user_usage_daily.output_tokens + EXCLUDED.output_tokens,
        total_tokens = user_usage_daily.total_tokens + EXCLUDED.total_tokens,
        models_used = COALESCE(EXCLUDED.models_used, user_usage_daily.models_used),
        sessions_created = user_usage_daily.sessions_created + EXCLUDED.sessions_created,
        generation_ms = user_usage_daily.generation_ms + EXCLUDED.generation_ms,
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'pg_catalog, public';

-- Function to update user tier
CREATE OR REPLACE FUNCTION public.update_user_tier(
    user_uuid UUID,
    new_tier VARCHAR(20)
)
RETURNS JSONB AS $$
DECLARE
    old_tier VARCHAR(20);
    updated_count INTEGER := 0;
BEGIN
    -- Validate tier (admin tier is managed via profiles.account_type)
    IF new_tier NOT IN ('free', 'pro', 'enterprise') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid tier. Must be: free, pro, or enterprise'
        );
    END IF;

    -- Capture previous tier (for logging)
    SELECT subscription_tier INTO old_tier
    FROM public.profiles
    WHERE id = user_uuid;

    -- Update subscription_tier
    UPDATE public.profiles
    SET subscription_tier = new_tier,
        updated_at = NOW()
    WHERE id = user_uuid;

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    IF updated_count = 0 THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'pg_catalog, public';

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
    default_model, temperature, system_prompt,
    subscription_tier, account_type, credits,
    is_banned, banned_at, banned_until, ban_reason, violation_strikes,
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
    'generation_ms', COALESCE(generation_ms, 0)
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
            'generation_ms', 0
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
                    'generation_ms', generation_ms
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
    'account_type', profile_data.account_type,
    'credits', profile_data.credits,
    'is_banned', profile_data.is_banned,
    'banned_at', profile_data.banned_at,
    'banned_until', profile_data.banned_until,
    'ban_reason', profile_data.ban_reason,
    'violation_strikes', profile_data.violation_strikes,
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'pg_catalog, public';

-- (Removed) export_user_data(user_uuid UUID) function deprecated Sept 2025 (never used in application layer)

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

-- Trigger to protect ban columns from non-admin updates
CREATE TRIGGER trg_protect_ban_columns
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_ban_columns();
