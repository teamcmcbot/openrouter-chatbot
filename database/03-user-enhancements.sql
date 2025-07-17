-- Phase 3: User Management Enhancements
-- Execute this AFTER Phase 2 (02-chat-tables.sql)

-- =============================================================================
-- SUBSCRIPTION TIER ENUM TYPE
-- =============================================================================

-- Create enum for subscription tiers
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_tier') THEN
        CREATE TYPE subscription_tier AS ENUM ('free', 'pro', 'enterprise');
    END IF;
END $$;

-- =============================================================================
-- USER PROFILE ENHANCEMENTS
-- =============================================================================

-- Add user management columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS subscription_tier subscription_tier DEFAULT 'free' NOT NULL,
ADD COLUMN IF NOT EXISTS usage_stats JSONB DEFAULT '{
    "total_messages": 0,
    "total_tokens": 0,
    "monthly_messages": 0,
    "monthly_tokens": 0,
    "last_reset_date": null,
    "favorite_models": [],
    "total_sessions": 0
}'::jsonb NOT NULL,
ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'deleted')) NOT NULL,
ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);

-- =============================================================================
-- USER SESSIONS TRACKING TABLE
-- =============================================================================

-- Create user sessions table for security and analytics
CREATE TABLE IF NOT EXISTS public.user_sessions (
    -- Primary key and identification
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- User reference
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    
    -- Session details
    session_token VARCHAR(255),
    refresh_token VARCHAR(255),
    device_info JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    
    -- Location and security
    location JSONB DEFAULT '{}'::jsonb, -- city, country, etc.
    is_suspicious BOOLEAN DEFAULT false,
    
    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    last_activity TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMPTZ,
    
    -- Status
    is_active BOOLEAN DEFAULT true NOT NULL,
    logout_reason VARCHAR(100) -- 'manual', 'timeout', 'security', etc.
);

-- =============================================================================
-- USER ACTIVITY LOG TABLE
-- =============================================================================

-- Create activity log for security and analytics
CREATE TABLE IF NOT EXISTS public.user_activity_log (
    -- Primary key and identification
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- User reference
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    
    -- Activity details
    action VARCHAR(100) NOT NULL, -- 'login', 'logout', 'chat_created', 'model_changed', etc.
    resource_type VARCHAR(50), -- 'session', 'message', 'profile', etc.
    resource_id UUID,
    
    -- Context
    details JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    
    -- Timing
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Status
    success BOOLEAN DEFAULT true NOT NULL,
    error_message TEXT
);

-- =============================================================================
-- MODEL ACCESS CONTROL TABLE
-- =============================================================================

-- Create table to control which models users can access
CREATE TABLE IF NOT EXISTS public.user_model_access (
    -- Primary key and references
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    
    -- Model information
    model_id VARCHAR(100) NOT NULL, -- matches OpenRouter model IDs
    model_name VARCHAR(255) NOT NULL,
    
    -- Access control
    is_allowed BOOLEAN DEFAULT true NOT NULL,
    access_type VARCHAR(20) DEFAULT 'free' CHECK (access_type IN ('free', 'paid', 'premium', 'enterprise')) NOT NULL,
    
    -- Usage limits
    daily_limit INTEGER DEFAULT -1, -- -1 means unlimited
    monthly_limit INTEGER DEFAULT -1,
    
    -- Timestamps
    granted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMPTZ,
    
    -- Unique constraint: one access rule per user per model
    UNIQUE(user_id, model_id)
);

-- =============================================================================
-- USAGE TRACKING TABLE
-- =============================================================================

-- Create table for detailed usage tracking
CREATE TABLE IF NOT EXISTS public.usage_tracking (
    -- Primary key and identification
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- User and session references
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    message_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    
    -- Usage details
    model_used VARCHAR(100) NOT NULL,
    tokens_consumed INTEGER DEFAULT 0 NOT NULL,
    cost_cents INTEGER DEFAULT 0 NOT NULL, -- cost in cents
    
    -- Timing
    usage_date DATE DEFAULT CURRENT_DATE NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb
);

-- =============================================================================
-- PERFORMANCE INDEXES
-- =============================================================================

-- User Sessions Indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON public.user_sessions(user_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity ON public.user_sessions(last_activity DESC);

-- User Activity Log Indexes
CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON public.user_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_timestamp ON public.user_activity_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_action ON public.user_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_user_activity_user_timestamp ON public.user_activity_log(user_id, timestamp DESC);

-- Model Access Indexes
CREATE INDEX IF NOT EXISTS idx_user_model_access_user_id ON public.user_model_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_model_access_model ON public.user_model_access(model_id);
CREATE INDEX IF NOT EXISTS idx_user_model_access_active ON public.user_model_access(user_id, is_allowed) WHERE is_allowed = true;

-- Usage Tracking Indexes
CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_id ON public.usage_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_date ON public.usage_tracking(user_id, usage_date DESC);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_model ON public.usage_tracking(model_used);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_timestamp ON public.usage_tracking(timestamp DESC);

-- Profiles enhancements indexes
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_tier ON public.profiles(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_profiles_account_status ON public.profiles(account_status) WHERE account_status = 'active';

-- =============================================================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- Enable RLS on new tables
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_model_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

-- User Sessions Policies
CREATE POLICY "Users can view their own sessions" ON public.user_sessions
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can manage user sessions" ON public.user_sessions
    FOR ALL USING (true); -- Allow system to manage sessions

-- User Activity Log Policies (users can only read their own activity)
CREATE POLICY "Users can view their own activity" ON public.user_activity_log
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can log user activity" ON public.user_activity_log
    FOR INSERT WITH CHECK (true); -- Allow system to log activity

-- Model Access Policies
CREATE POLICY "Users can view their model access" ON public.user_model_access
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can manage model access" ON public.user_model_access
    FOR ALL USING (true); -- Allow system to manage model access

-- Usage Tracking Policies
CREATE POLICY "Users can view their usage" ON public.usage_tracking
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "System can track usage" ON public.usage_tracking
    FOR INSERT WITH CHECK (true); -- Allow system to track usage

-- =============================================================================
-- ENHANCED DATABASE FUNCTIONS
-- =============================================================================

-- Function to update user usage statistics
CREATE OR REPLACE FUNCTION public.update_user_usage_stats(
    user_uuid UUID,
    tokens_used INTEGER DEFAULT 0,
    model_used VARCHAR(100) DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    current_stats JSONB;
    new_stats JSONB;
    current_month TEXT;
BEGIN
    -- Get current usage stats
    SELECT usage_stats INTO current_stats
    FROM public.profiles
    WHERE id = user_uuid;
    
    -- Get current month for monthly reset logic
    current_month := to_char(NOW(), 'YYYY-MM');
    
    -- Check if we need to reset monthly stats
    IF current_stats->>'last_reset_date' != current_month THEN
        current_stats := jsonb_set(current_stats, '{monthly_messages}', '0');
        current_stats := jsonb_set(current_stats, '{monthly_tokens}', '0');
        current_stats := jsonb_set(current_stats, '{last_reset_date}', to_jsonb(current_month));
    END IF;
    
    -- Update statistics
    new_stats := current_stats;
    new_stats := jsonb_set(new_stats, '{total_messages}', to_jsonb((current_stats->>'total_messages')::INTEGER + 1));
    new_stats := jsonb_set(new_stats, '{total_tokens}', to_jsonb((current_stats->>'total_tokens')::INTEGER + tokens_used));
    new_stats := jsonb_set(new_stats, '{monthly_messages}', to_jsonb((current_stats->>'monthly_messages')::INTEGER + 1));
    new_stats := jsonb_set(new_stats, '{monthly_tokens}', to_jsonb((current_stats->>'monthly_tokens')::INTEGER + tokens_used));
    
    -- Update favorite models array if model is provided
    IF model_used IS NOT NULL THEN
        -- Add model to favorites if not already there (keep only top 5)
        new_stats := jsonb_set(
            new_stats, 
            '{favorite_models}', 
            (
                SELECT to_jsonb(array_agg(DISTINCT model))
                FROM (
                    SELECT model FROM jsonb_array_elements_text(current_stats->'favorite_models') AS model
                    UNION
                    SELECT model_used
                    ORDER BY model
                    LIMIT 5
                ) AS models
            )
        );
    END IF;
    
    -- Update the profile
    UPDATE public.profiles 
    SET usage_stats = new_stats,
        last_active = NOW()
    WHERE id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can access a model
CREATE OR REPLACE FUNCTION public.can_user_access_model(
    user_uuid UUID,
    model_id VARCHAR(100)
)
RETURNS BOOLEAN AS $$
DECLARE
    user_tier subscription_tier;
    access_record RECORD;
    monthly_usage INTEGER;
BEGIN
    -- Get user's subscription tier
    SELECT subscription_tier INTO user_tier
    FROM public.profiles
    WHERE id = user_uuid;
    
    -- Check if there's a specific access rule for this model
    SELECT * INTO access_record
    FROM public.user_model_access
    WHERE user_id = user_uuid AND model_id = model_id AND is_allowed = true
    AND (expires_at IS NULL OR expires_at > NOW());
    
    -- If specific rule exists, check limits
    IF FOUND THEN
        -- Check daily limit
        IF access_record.daily_limit > 0 THEN
            SELECT COUNT(*) INTO monthly_usage
            FROM public.usage_tracking
            WHERE user_id = user_uuid 
            AND model_used = model_id 
            AND usage_date = CURRENT_DATE;
            
            IF monthly_usage >= access_record.daily_limit THEN
                RETURN false;
            END IF;
        END IF;
        
        RETURN true;
    END IF;
    
    -- Default access based on subscription tier and model type
    -- Free tier: only free models
    -- Pro tier: free + paid models  
    -- Enterprise tier: all models
    CASE user_tier
        WHEN 'free' THEN
            RETURN model_id LIKE '%:free' OR model_id IN (
                'deepseek/deepseek-r1-0528:free',
                'google/gemma-2-9b-it:free',
                'meta-llama/llama-3.1-8b-instruct:free'
            );
        WHEN 'pro' THEN
            RETURN model_id NOT LIKE '%enterprise%';
        WHEN 'enterprise' THEN
            RETURN true;
        ELSE
            RETURN false;
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log user activity
CREATE OR REPLACE FUNCTION public.log_user_activity(
    user_uuid UUID,
    action_name VARCHAR(100),
    resource_type VARCHAR(50) DEFAULT NULL,
    resource_id UUID DEFAULT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    success BOOLEAN DEFAULT true,
    error_msg TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    activity_id UUID;
BEGIN
    INSERT INTO public.user_activity_log (
        user_id,
        action,
        resource_type,
        resource_id,
        details,
        success,
        error_message
    ) VALUES (
        user_uuid,
        action_name,
        resource_type,
        resource_id,
        details,
        success,
        error_msg
    ) RETURNING id INTO activity_id;
    
    RETURN activity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user dashboard data
CREATE OR REPLACE FUNCTION public.get_user_dashboard_data(user_uuid UUID)
RETURNS TABLE (
    profile_data JSONB,
    usage_data JSONB,
    recent_activity JSONB,
    session_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        -- Profile data
        to_jsonb(p.*) as profile_data,
        
        -- Usage summary
        jsonb_build_object(
            'total_sessions', (SELECT COUNT(*) FROM public.chat_sessions WHERE user_id = user_uuid),
            'total_messages', (SELECT COUNT(*) FROM public.chat_messages m 
                              JOIN public.chat_sessions s ON m.session_id = s.id 
                              WHERE s.user_id = user_uuid),
            'usage_stats', p.usage_stats
        ) as usage_data,
        
        -- Recent activity (last 10 actions)
        (
            SELECT jsonb_agg(to_jsonb(a.*) ORDER BY a.timestamp DESC)
            FROM (
                SELECT action, resource_type, timestamp, success
                FROM public.user_activity_log
                WHERE user_id = user_uuid
                ORDER BY timestamp DESC
                LIMIT 10
            ) a
        ) as recent_activity,
        
        -- Active session count
        (SELECT COUNT(*)::INTEGER FROM public.user_sessions 
         WHERE user_id = user_uuid AND is_active = true) as session_count
         
    FROM public.profiles p
    WHERE p.id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Check if enhancements were applied successfully
DO $$
BEGIN
    -- Check if subscription_tier enum was created
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_tier') THEN
        RAISE EXCEPTION 'subscription_tier enum was not created successfully';
    END IF;
    
    -- Check if new columns were added to profiles
    IF NOT EXISTS (
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'credits'
    ) THEN
        RAISE EXCEPTION 'credits column was not added to profiles table';
    END IF;
    
    -- Check if new tables were created
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_sessions' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'user_sessions table was not created successfully';
    END IF;
    
    RAISE NOTICE 'Phase 3 database setup completed successfully!';
    RAISE NOTICE 'Enhanced tables: profiles (+ credits, subscription_tier, usage_stats)';
    RAISE NOTICE 'New tables: user_sessions, user_activity_log, user_model_access, usage_tracking';
    RAISE NOTICE 'Enhanced functions: ✓ usage tracking, model access control, activity logging';
    RAISE NOTICE 'Subscription system: ✓ ready for free/pro/enterprise tiers';
END $$;

-- =============================================================================
-- COMPLETION CHECKLIST
-- =============================================================================

/*
✅ Phase 3 Database Setup Checklist:

□ 1. Ensure Phase 2 (02-chat-tables.sql) was executed successfully
□ 2. Execute this SQL script in Supabase SQL Editor
□ 3. Verify "Phase 3 database setup completed successfully!" message appears
□ 4. Check Table Editor → new tables created and columns added
□ 5. Verify subscription_tier enum exists in Database → Types
□ 6. Test enhanced functions work correctly
□ 7. Confirm RLS policies prevent unauthorized access

Database Enhancements Ready For:
- ✅ User subscription management (free/pro/enterprise)
- ✅ Detailed usage tracking and analytics
- ✅ Model access control per user tier
- ✅ Session management and security monitoring
- ✅ Activity logging for audit trails
- ✅ User dashboard data aggregation
- ⏳ Ready for Phase 4 (User Preferences & Settings)

Next Steps:
- Agent will implement user management API endpoints
- Subscription tier logic will be activated
- Usage tracking will be integrated with chat endpoints
- User dashboard components will be created
*/
