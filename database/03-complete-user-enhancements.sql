-- =============================================================================
-- COMPREHENSIVE DATABASE SCHEMA - PHASE 3: ADVANCED USER FEATURES
-- =============================================================================
-- Execute this after Phase 2 to add advanced user management features
-- Enhanced user tiers, usage tracking, credits, model access control

-- =============================================================================
-- ENHANCED USER FEATURES
-- =============================================================================

-- Add enhanced columns to profiles if they don't exist
DO $$
BEGIN
    -- Add model preferences
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'allowed_models') THEN
        ALTER TABLE public.profiles ADD COLUMN allowed_models TEXT[] DEFAULT ARRAY['deepseek/deepseek-r1-0528:free'];
    END IF;
    
    -- Add UI preferences
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'ui_preferences') THEN
        ALTER TABLE public.profiles ADD COLUMN ui_preferences JSONB DEFAULT '{
            "theme": "dark",
            "sidebar_width": 280,
            "code_highlighting": true,
            "auto_save": true,
            "show_token_count": true
        }'::jsonb;
    END IF;
    
    -- Add session preferences
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'session_preferences') THEN
        ALTER TABLE public.profiles ADD COLUMN session_preferences JSONB DEFAULT '{
            "max_history": 10,
            "auto_title": true,
            "save_anonymous": false
        }'::jsonb;
    END IF;
END $$;

-- =============================================================================
-- USAGE TRACKING TABLES
-- =============================================================================

-- Daily usage tracking
CREATE TABLE IF NOT EXISTS public.user_usage_daily (
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

-- Model access control
CREATE TABLE IF NOT EXISTS public.model_access (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    model_id VARCHAR(100) NOT NULL,
    tier VARCHAR(20) NOT NULL CHECK (tier IN ('free', 'pro', 'enterprise', 'admin')),
    is_active BOOLEAN DEFAULT true,
    
    -- Cost per token (for billing)
    input_cost_per_token DECIMAL(10,8) DEFAULT 0.0,
    output_cost_per_token DECIMAL(10,8) DEFAULT 0.0,
    
    -- Rate limits
    daily_limit INTEGER DEFAULT NULL, -- NULL = unlimited
    monthly_limit INTEGER DEFAULT NULL,
    
    -- Metadata
    model_name VARCHAR(255),
    model_description TEXT,
    model_tags TEXT[],
    
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    UNIQUE(model_id, tier)
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Usage tracking indexes
CREATE INDEX IF NOT EXISTS idx_usage_daily_user_date ON public.user_usage_daily(user_id, usage_date DESC);
CREATE INDEX IF NOT EXISTS idx_usage_daily_date ON public.user_usage_daily(usage_date DESC);

-- Model access indexes
CREATE INDEX IF NOT EXISTS idx_model_access_tier ON public.model_access(tier, is_active);
CREATE INDEX IF NOT EXISTS idx_model_access_model_id ON public.model_access(model_id, is_active);

-- =============================================================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- Enable RLS on new tables
ALTER TABLE public.user_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_access ENABLE ROW LEVEL SECURITY;

-- Usage daily policies
CREATE POLICY "Users can view their own usage" ON public.user_usage_daily
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own usage" ON public.user_usage_daily
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own usage" ON public.user_usage_daily
    FOR UPDATE USING (auth.uid() = user_id);

-- Model access policies (read-only for users)
CREATE POLICY "All authenticated users can view model access" ON public.model_access
    FOR SELECT USING (auth.role() = 'authenticated');

-- =============================================================================
-- ENHANCED UTILITY FUNCTIONS
-- =============================================================================

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

-- Function to get user's allowed models based on tier
CREATE OR REPLACE FUNCTION public.get_user_allowed_models(user_uuid UUID)
RETURNS TABLE (
    model_id VARCHAR(100),
    model_name VARCHAR(255),
    model_description TEXT,
    model_tags TEXT[],
    input_cost_per_token DECIMAL(10,8),
    output_cost_per_token DECIMAL(10,8),
    daily_limit INTEGER,
    monthly_limit INTEGER
) AS $$
DECLARE
    user_tier VARCHAR(20);
BEGIN
    -- Get user's subscription tier
    SELECT subscription_tier INTO user_tier
    FROM public.profiles
    WHERE id = user_uuid;
    
    -- If user not found, return free tier models
    IF user_tier IS NULL THEN
        user_tier := 'free';
    END IF;
    
    -- Return models available for user's tier and higher
    RETURN QUERY
    SELECT 
        ma.model_id,
        ma.model_name,
        ma.model_description,
        ma.model_tags,
        ma.input_cost_per_token,
        ma.output_cost_per_token,
        ma.daily_limit,
        ma.monthly_limit
    FROM public.model_access ma
    WHERE ma.is_active = true
    AND (
        (user_tier = 'free' AND ma.tier = 'free') OR
        (user_tier = 'pro' AND ma.tier IN ('free', 'pro')) OR
        (user_tier = 'enterprise' AND ma.tier IN ('free', 'pro', 'enterprise')) OR
        (user_tier = 'admin' AND ma.tier IN ('free', 'pro', 'enterprise', 'admin'))
    )
    ORDER BY 
        CASE ma.tier 
            WHEN 'free' THEN 1
            WHEN 'pro' THEN 2 
            WHEN 'enterprise' THEN 3
            WHEN 'admin' THEN 4
        END,
        ma.model_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can use a specific model
CREATE OR REPLACE FUNCTION public.can_user_use_model(
    user_uuid UUID,
    model_to_check VARCHAR(100)
)
RETURNS BOOLEAN AS $$
DECLARE
    user_tier VARCHAR(20);
    model_available BOOLEAN := false;
BEGIN
    -- Get user's subscription tier
    SELECT subscription_tier INTO user_tier
    FROM public.profiles
    WHERE id = user_uuid;
    
    -- If user not found, default to free tier
    IF user_tier IS NULL THEN
        user_tier := 'free';
    END IF;
    
    -- Check if model is available for user's tier
    SELECT EXISTS(
        SELECT 1 FROM public.model_access ma
        WHERE ma.model_id = model_to_check
        AND ma.is_active = true
        AND (
            (user_tier = 'free' AND ma.tier = 'free') OR
            (user_tier = 'pro' AND ma.tier IN ('free', 'pro')) OR
            (user_tier = 'enterprise' AND ma.tier IN ('free', 'pro', 'enterprise')) OR
            (user_tier = 'admin' AND ma.tier IN ('free', 'pro', 'enterprise', 'admin'))
        )
    ) INTO model_available;
    
    RETURN model_available;
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
    IF new_tier NOT IN ('free', 'pro', 'enterprise', 'admin') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid tier. Must be: free, pro, enterprise, or admin'
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

-- =============================================================================
-- SEED DATA - DEFAULT MODEL ACCESS
-- =============================================================================

-- Insert default model access rules
INSERT INTO public.model_access (model_id, tier, model_name, model_description, model_tags, is_active)
VALUES 
    -- Free tier models
    ('deepseek/deepseek-r1-0528:free', 'free', 'DeepSeek R1 Free', 'Advanced reasoning model - free tier', ARRAY['reasoning', 'free'], true),
    ('google/gemini-flash-1.5:free', 'free', 'Gemini Flash 1.5 Free', 'Fast multimodal model - free tier', ARRAY['multimodal', 'fast', 'free'], true),
    
    -- Pro tier models
    ('openai/gpt-4o-mini', 'pro', 'GPT-4o Mini', 'Efficient GPT-4 variant', ARRAY['reasoning', 'efficient'], true),
    ('anthropic/claude-3-haiku', 'pro', 'Claude 3 Haiku', 'Fast and efficient Claude model', ARRAY['reasoning', 'fast'], true),
    ('google/gemini-pro', 'pro', 'Gemini Pro', 'Advanced Google model', ARRAY['multimodal', 'advanced'], true),
    
    -- Enterprise tier models
    ('openai/gpt-4o', 'enterprise', 'GPT-4o', 'Most capable GPT-4 model', ARRAY['reasoning', 'advanced'], true),
    ('anthropic/claude-3-opus', 'enterprise', 'Claude 3 Opus', 'Most capable Claude model', ARRAY['reasoning', 'advanced'], true),
    ('openai/o1', 'enterprise', 'OpenAI o1', 'Advanced reasoning model', ARRAY['reasoning', 'premium'], true)
ON CONFLICT (model_id, tier) DO NOTHING;

-- =============================================================================
-- VERIFICATION & SETUP COMPLETE
-- =============================================================================

DO $$
DECLARE
    model_count INTEGER;
    usage_table_exists BOOLEAN;
BEGIN
    -- Check model access data
    SELECT COUNT(*) INTO model_count FROM public.model_access;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'user_usage_daily'
    ) INTO usage_table_exists;
    
    -- Success message
    RAISE NOTICE '============================================';
    RAISE NOTICE 'PHASE 3 SETUP COMPLETE!';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Enhanced features added:';
    RAISE NOTICE '  ✓ User tier management (%, %, %, %)', 'free', 'pro', 'enterprise', 'admin';
    RAISE NOTICE '  ✓ Model access control (% models configured)', model_count;
    RAISE NOTICE '  ✓ Usage tracking system';
    RAISE NOTICE '  ✓ UI and session preferences';
    RAISE NOTICE '  ✓ Daily usage analytics';
    RAISE NOTICE 'Functions available:';
    RAISE NOTICE '  ✓ track_user_usage()';
    RAISE NOTICE '  ✓ get_user_allowed_models()';
    RAISE NOTICE '  ✓ can_user_use_model()';
    RAISE NOTICE '  ✓ update_user_tier()';
    RAISE NOTICE 'Ready for Phase 4: Advanced Preferences';
    RAISE NOTICE '============================================';
END $$;
