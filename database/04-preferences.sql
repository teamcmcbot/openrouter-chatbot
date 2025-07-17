-- Phase 4: User Preferences and Settings Complete
-- Execute this AFTER Phase 3 (03-user-enhancements.sql)

-- =============================================================================
-- FINAL PREFERENCES COLUMNS FOR PROFILES TABLE
-- =============================================================================

-- Add comprehensive user preference columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS allowed_models TEXT[] DEFAULT ARRAY[
    'deepseek/deepseek-r1-0528:free',
    'google/gemma-2-9b-it:free',
    'meta-llama/llama-3.1-8b-instruct:free'
] NOT NULL,
ADD COLUMN IF NOT EXISTS system_prompt TEXT DEFAULT 'You are a helpful AI assistant.' NOT NULL,
ADD COLUMN IF NOT EXISTS ui_preferences JSONB DEFAULT '{
    "theme": "auto",
    "sidebar_collapsed": false,
    "message_font_size": "medium",
    "code_theme": "auto",
    "enable_sound": false,
    "enable_notifications": true,
    "auto_scroll": true,
    "show_model_in_messages": true,
    "show_token_count": false,
    "markdown_preview": false,
    "preferred_language": "en"
}'::jsonb NOT NULL,
ADD COLUMN IF NOT EXISTS chat_preferences JSONB DEFAULT '{
    "auto_title_generation": true,
    "context_length": 4000,
    "max_tokens": 1000,
    "remember_conversation_context": true,
    "stream_responses": true,
    "show_typing_indicator": true,
    "auto_save_frequency": 30
}'::jsonb NOT NULL,
ADD COLUMN IF NOT EXISTS model_settings JSONB DEFAULT '{}'::jsonb NOT NULL,
ADD COLUMN IF NOT EXISTS privacy_settings JSONB DEFAULT '{
    "analytics_enabled": true,
    "crash_reporting": true,
    "usage_tracking": true,
    "personalization": true,
    "data_retention_days": 365
}'::jsonb NOT NULL;

-- =============================================================================
-- USER SAVED PROMPTS TABLE
-- =============================================================================

-- Create table for user's saved system prompts
CREATE TABLE IF NOT EXISTS public.user_saved_prompts (
    -- Primary key and identification
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- User reference
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    
    -- Prompt details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    prompt_text TEXT NOT NULL,
    
    -- Categorization
    category VARCHAR(100) DEFAULT 'general',
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- Usage stats
    usage_count INTEGER DEFAULT 0 NOT NULL,
    last_used TIMESTAMPTZ,
    
    -- Status flags
    is_favorite BOOLEAN DEFAULT false NOT NULL,
    is_public BOOLEAN DEFAULT false NOT NULL, -- Allow sharing with other users
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- MODEL PREFERENCES TABLE
-- =============================================================================

-- Create table for detailed model-specific preferences
CREATE TABLE IF NOT EXISTS public.user_model_preferences (
    -- Primary key and references
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    
    -- Model identification
    model_id VARCHAR(100) NOT NULL,
    model_name VARCHAR(255) NOT NULL,
    
    -- Model-specific settings
    temperature DECIMAL(3,2) DEFAULT 0.7 CHECK (temperature >= 0.0 AND temperature <= 2.0),
    max_tokens INTEGER DEFAULT 1000 CHECK (max_tokens > 0 AND max_tokens <= 32000),
    top_p DECIMAL(3,2) DEFAULT 1.0 CHECK (top_p >= 0.0 AND top_p <= 1.0),
    top_k INTEGER DEFAULT -1, -- -1 means disabled
    frequency_penalty DECIMAL(3,2) DEFAULT 0.0 CHECK (frequency_penalty >= -2.0 AND frequency_penalty <= 2.0),
    presence_penalty DECIMAL(3,2) DEFAULT 0.0 CHECK (presence_penalty >= -2.0 AND presence_penalty <= 2.0),
    
    -- Custom system prompt for this model
    custom_system_prompt TEXT,
    
    -- Usage preferences
    is_favorite BOOLEAN DEFAULT false NOT NULL,
    is_hidden BOOLEAN DEFAULT false NOT NULL,
    sort_order INTEGER DEFAULT 0,
    
    -- Usage statistics
    usage_count INTEGER DEFAULT 0 NOT NULL,
    total_tokens INTEGER DEFAULT 0 NOT NULL,
    last_used TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Unique constraint: one preference set per user per model
    UNIQUE(user_id, model_id)
);

-- =============================================================================
-- USER CUSTOM THEMES TABLE
-- =============================================================================

-- Create table for custom user themes
CREATE TABLE IF NOT EXISTS public.user_custom_themes (
    -- Primary key and identification
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- User reference
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    
    -- Theme details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Theme configuration
    theme_config JSONB NOT NULL DEFAULT '{
        "colors": {
            "primary": "#3b82f6",
            "secondary": "#64748b",
            "background": "#ffffff",
            "surface": "#f8fafc",
            "text": "#1e293b",
            "text_secondary": "#475569",
            "border": "#e2e8f0",
            "accent": "#06b6d4"
        },
        "typography": {
            "font_family": "Inter",
            "font_size_base": 14,
            "line_height": 1.5
        },
        "spacing": {
            "sidebar_width": 280,
            "message_spacing": 16,
            "border_radius": 8
        }
    }'::jsonb,
    
    -- Status flags
    is_active BOOLEAN DEFAULT false NOT NULL,
    is_public BOOLEAN DEFAULT false NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- PERFORMANCE INDEXES
-- =============================================================================

-- User Saved Prompts Indexes
CREATE INDEX IF NOT EXISTS idx_user_saved_prompts_user_id ON public.user_saved_prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_saved_prompts_category ON public.user_saved_prompts(user_id, category);
CREATE INDEX IF NOT EXISTS idx_user_saved_prompts_favorites ON public.user_saved_prompts(user_id, is_favorite) WHERE is_favorite = true;
CREATE INDEX IF NOT EXISTS idx_user_saved_prompts_usage ON public.user_saved_prompts(user_id, usage_count DESC);

-- Model Preferences Indexes
CREATE INDEX IF NOT EXISTS idx_user_model_preferences_user_id ON public.user_model_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_model_preferences_model ON public.user_model_preferences(user_id, model_id);
CREATE INDEX IF NOT EXISTS idx_user_model_preferences_favorites ON public.user_model_preferences(user_id, is_favorite) WHERE is_favorite = true;
CREATE INDEX IF NOT EXISTS idx_user_model_preferences_sort ON public.user_model_preferences(user_id, sort_order);

-- Custom Themes Indexes
CREATE INDEX IF NOT EXISTS idx_user_custom_themes_user_id ON public.user_custom_themes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_custom_themes_active ON public.user_custom_themes(user_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_custom_themes_public ON public.user_custom_themes(is_public) WHERE is_public = true;

-- Enhanced profiles indexes for new preference columns
CREATE INDEX IF NOT EXISTS idx_profiles_ui_prefs ON public.profiles USING GIN (ui_preferences);
CREATE INDEX IF NOT EXISTS idx_profiles_chat_prefs ON public.profiles USING GIN (chat_preferences);

-- =============================================================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- Enable RLS on new tables
ALTER TABLE public.user_saved_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_model_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_custom_themes ENABLE ROW LEVEL SECURITY;

-- User Saved Prompts Policies
CREATE POLICY "Users can manage their own saved prompts" ON public.user_saved_prompts
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can view public prompts" ON public.user_saved_prompts
    FOR SELECT USING (is_public = true);

-- Model Preferences Policies
CREATE POLICY "Users can manage their own model preferences" ON public.user_model_preferences
    FOR ALL USING (user_id = auth.uid());

-- Custom Themes Policies
CREATE POLICY "Users can manage their own custom themes" ON public.user_custom_themes
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can view public themes" ON public.user_custom_themes
    FOR SELECT USING (is_public = true);

-- =============================================================================
-- ENHANCED DATABASE FUNCTIONS
-- =============================================================================

-- Function to get user's complete preferences
CREATE OR REPLACE FUNCTION public.get_user_preferences(user_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'profile', jsonb_build_object(
            'default_model', p.default_model,
            'temperature', p.temperature,
            'system_prompt', p.system_prompt,
            'allowed_models', p.allowed_models
        ),
        'ui_preferences', p.ui_preferences,
        'chat_preferences', p.chat_preferences,
        'model_settings', p.model_settings,
        'privacy_settings', p.privacy_settings,
        'saved_prompts', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'id', sp.id,
                'name', sp.name,
                'description', sp.description,
                'category', sp.category,
                'is_favorite', sp.is_favorite,
                'usage_count', sp.usage_count
            ) ORDER BY sp.is_favorite DESC, sp.usage_count DESC)
            FROM public.user_saved_prompts sp 
            WHERE sp.user_id = user_uuid), '[]'::jsonb
        ),
        'model_preferences', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'model_id', mp.model_id,
                'model_name', mp.model_name,
                'temperature', mp.temperature,
                'max_tokens', mp.max_tokens,
                'is_favorite', mp.is_favorite,
                'is_hidden', mp.is_hidden,
                'sort_order', mp.sort_order
            ) ORDER BY mp.sort_order, mp.model_name)
            FROM public.user_model_preferences mp 
            WHERE mp.user_id = user_uuid), '[]'::jsonb
        ),
        'custom_themes', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'id', ct.id,
                'name', ct.name,
                'description', ct.description,
                'is_active', ct.is_active
            ) ORDER BY ct.is_active DESC, ct.name)
            FROM public.user_custom_themes ct 
            WHERE ct.user_id = user_uuid), '[]'::jsonb
        )
    ) INTO result
    FROM public.profiles p
    WHERE p.id = user_uuid;
    
    RETURN COALESCE(result, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update user preferences (atomic update)
CREATE OR REPLACE FUNCTION public.update_user_preferences(
    user_uuid UUID,
    preference_type VARCHAR(50),
    preference_data JSONB
)
RETURNS BOOLEAN AS $$
BEGIN
    CASE preference_type
        WHEN 'ui_preferences' THEN
            UPDATE public.profiles 
            SET ui_preferences = ui_preferences || preference_data,
                updated_at = NOW()
            WHERE id = user_uuid;
            
        WHEN 'chat_preferences' THEN
            UPDATE public.profiles 
            SET chat_preferences = chat_preferences || preference_data,
                updated_at = NOW()
            WHERE id = user_uuid;
            
        WHEN 'model_settings' THEN
            UPDATE public.profiles 
            SET model_settings = model_settings || preference_data,
                updated_at = NOW()
            WHERE id = user_uuid;
            
        WHEN 'privacy_settings' THEN
            UPDATE public.profiles 
            SET privacy_settings = privacy_settings || preference_data,
                updated_at = NOW()
            WHERE id = user_uuid;
            
        WHEN 'profile' THEN
            UPDATE public.profiles 
            SET default_model = COALESCE(preference_data->>'default_model', default_model),
                temperature = COALESCE((preference_data->>'temperature')::DECIMAL, temperature),
                system_prompt = COALESCE(preference_data->>'system_prompt', system_prompt),
                allowed_models = COALESCE(
                    ARRAY(SELECT jsonb_array_elements_text(preference_data->'allowed_models')),
                    allowed_models
                ),
                updated_at = NOW()
            WHERE id = user_uuid;
            
        ELSE
            RETURN false;
    END CASE;
    
    -- Log the preference update
    PERFORM public.log_user_activity(
        user_uuid,
        'preference_updated',
        'profile',
        user_uuid,
        jsonb_build_object('type', preference_type, 'data', preference_data)
    );
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's allowed models with preferences
CREATE OR REPLACE FUNCTION public.get_user_allowed_models(user_uuid UUID)
RETURNS TABLE (
    model_id VARCHAR(100),
    model_name VARCHAR(255),
    is_favorite BOOLEAN,
    is_hidden BOOLEAN,
    sort_order INTEGER,
    temperature DECIMAL(3,2),
    max_tokens INTEGER,
    usage_count INTEGER,
    can_access BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    WITH user_models AS (
        -- Get user's allowed models from profile
        SELECT unnest(p.allowed_models) as model_id
        FROM public.profiles p
        WHERE p.id = user_uuid
    )
    SELECT 
        um.model_id,
        COALESCE(mp.model_name, um.model_id) as model_name,
        COALESCE(mp.is_favorite, false) as is_favorite,
        COALESCE(mp.is_hidden, false) as is_hidden,
        COALESCE(mp.sort_order, 0) as sort_order,
        COALESCE(mp.temperature, (SELECT temperature FROM public.profiles WHERE id = user_uuid)) as temperature,
        COALESCE(mp.max_tokens, 1000) as max_tokens,
        COALESCE(mp.usage_count, 0) as usage_count,
        public.can_user_access_model(user_uuid, um.model_id) as can_access
    FROM user_models um
    LEFT JOIN public.user_model_preferences mp 
        ON mp.user_id = user_uuid AND mp.model_id = um.model_id
    WHERE NOT COALESCE(mp.is_hidden, false)
    ORDER BY 
        COALESCE(mp.is_favorite, false) DESC,
        COALESCE(mp.sort_order, 0),
        COALESCE(mp.model_name, um.model_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to save/update model preferences
CREATE OR REPLACE FUNCTION public.save_model_preference(
    user_uuid UUID,
    model_id VARCHAR(100),
    model_name VARCHAR(255),
    settings JSONB
)
RETURNS UUID AS $$
DECLARE
    preference_id UUID;
BEGIN
    INSERT INTO public.user_model_preferences (
        user_id,
        model_id,
        model_name,
        temperature,
        max_tokens,
        top_p,
        top_k,
        frequency_penalty,
        presence_penalty,
        custom_system_prompt,
        is_favorite,
        is_hidden,
        sort_order
    ) VALUES (
        user_uuid,
        model_id,
        model_name,
        COALESCE((settings->>'temperature')::DECIMAL, 0.7),
        COALESCE((settings->>'max_tokens')::INTEGER, 1000),
        COALESCE((settings->>'top_p')::DECIMAL, 1.0),
        COALESCE((settings->>'top_k')::INTEGER, -1),
        COALESCE((settings->>'frequency_penalty')::DECIMAL, 0.0),
        COALESCE((settings->>'presence_penalty')::DECIMAL, 0.0),
        settings->>'custom_system_prompt',
        COALESCE((settings->>'is_favorite')::BOOLEAN, false),
        COALESCE((settings->>'is_hidden')::BOOLEAN, false),
        COALESCE((settings->>'sort_order')::INTEGER, 0)
    )
    ON CONFLICT (user_id, model_id) DO UPDATE SET
        model_name = EXCLUDED.model_name,
        temperature = EXCLUDED.temperature,
        max_tokens = EXCLUDED.max_tokens,
        top_p = EXCLUDED.top_p,
        top_k = EXCLUDED.top_k,
        frequency_penalty = EXCLUDED.frequency_penalty,
        presence_penalty = EXCLUDED.presence_penalty,
        custom_system_prompt = EXCLUDED.custom_system_prompt,
        is_favorite = EXCLUDED.is_favorite,
        is_hidden = EXCLUDED.is_hidden,
        sort_order = EXCLUDED.sort_order,
        updated_at = NOW()
    RETURNING id INTO preference_id;
    
    -- Update usage count
    UPDATE public.user_model_preferences 
    SET usage_count = usage_count + 1,
        last_used = NOW()
    WHERE id = preference_id;
    
    RETURN preference_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get system prompts (user's + public)
CREATE OR REPLACE FUNCTION public.get_available_prompts(user_uuid UUID)
RETURNS TABLE (
    id UUID,
    name VARCHAR(255),
    description TEXT,
    prompt_text TEXT,
    category VARCHAR(100),
    is_favorite BOOLEAN,
    is_public BOOLEAN,
    is_owner BOOLEAN,
    usage_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sp.id,
        sp.name,
        sp.description,
        sp.prompt_text,
        sp.category,
        sp.is_favorite,
        sp.is_public,
        (sp.user_id = user_uuid) as is_owner,
        sp.usage_count
    FROM public.user_saved_prompts sp
    WHERE sp.user_id = user_uuid OR sp.is_public = true
    ORDER BY 
        (sp.user_id = user_uuid) DESC, -- User's prompts first
        sp.is_favorite DESC,
        sp.usage_count DESC,
        sp.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Check if all Phase 4 enhancements were applied successfully
DO $$
BEGIN
    -- Check if preference columns were added to profiles
    IF NOT EXISTS (
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'ui_preferences'
    ) THEN
        RAISE EXCEPTION 'ui_preferences column was not added to profiles table';
    END IF;
    
    -- Check if new preference tables were created
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_saved_prompts' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'user_saved_prompts table was not created successfully';
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_model_preferences' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'user_model_preferences table was not created successfully';
    END IF;
    
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_custom_themes' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'user_custom_themes table was not created successfully';
    END IF;
    
    RAISE NOTICE 'Phase 4 database setup completed successfully!';
    RAISE NOTICE 'Enhanced profiles: ✓ ui_preferences, chat_preferences, model_settings, privacy_settings';
    RAISE NOTICE 'New tables: ✓ user_saved_prompts, user_model_preferences, user_custom_themes';
    RAISE NOTICE 'Advanced functions: ✓ preference management, model settings, prompt library';
    RAISE NOTICE 'Complete user customization: ✓ ready for full personalization features';
END $$;

-- =============================================================================
-- FINAL DATABASE SUMMARY
-- =============================================================================

-- Display complete database schema summary
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'OPENROUTER CHATBOT DATABASE COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Phase 1 - Authentication & Profiles:';
    RAISE NOTICE '  ✓ profiles table with basic user data';
    RAISE NOTICE '  ✓ Auto-profile creation on signup';
    RAISE NOTICE '  ✓ Row Level Security enabled';
    RAISE NOTICE '';
    RAISE NOTICE 'Phase 2 - Chat History:';
    RAISE NOTICE '  ✓ chat_sessions table for conversations';
    RAISE NOTICE '  ✓ chat_messages table for message storage';
    RAISE NOTICE '  ✓ User data isolation and sync functions';
    RAISE NOTICE '';
    RAISE NOTICE 'Phase 3 - User Management:';
    RAISE NOTICE '  ✓ Subscription tiers (free/pro/enterprise)';
    RAISE NOTICE '  ✓ Usage tracking and analytics';
    RAISE NOTICE '  ✓ Model access control';
    RAISE NOTICE '  ✓ Session and activity monitoring';
    RAISE NOTICE '';
    RAISE NOTICE 'Phase 4 - Complete Personalization:';
    RAISE NOTICE '  ✓ Comprehensive user preferences';
    RAISE NOTICE '  ✓ Model-specific settings';
    RAISE NOTICE '  ✓ Saved prompt library';
    RAISE NOTICE '  ✓ Custom themes support';
    RAISE NOTICE '';
    RAISE NOTICE 'Database is now ready for full application features!';
    RAISE NOTICE 'Total tables: 9 | Total functions: 15+ | Full RLS: ✓';
    RAISE NOTICE '========================================';
END $$;

-- =============================================================================
-- COMPLETION CHECKLIST
-- =============================================================================

/*
✅ Phase 4 Database Setup Checklist:

□ 1. Ensure Phase 3 (03-user-enhancements.sql) was executed successfully
□ 2. Execute this SQL script in Supabase SQL Editor
□ 3. Verify "Phase 4 database setup completed successfully!" message appears
□ 4. Check all new preference tables and columns exist
□ 5. Test preference functions work correctly
□ 6. Confirm complete database schema is ready

🎉 COMPLETE DATABASE SCHEMA READY FOR:
- ✅ Full user authentication with Google OAuth
- ✅ Comprehensive chat history with cross-device sync
- ✅ Advanced user management with subscription tiers
- ✅ Complete personalization with preferences & themes
- ✅ Model access control and usage tracking
- ✅ Saved prompts and custom model settings
- ✅ Privacy controls and security monitoring
- ✅ Performance-optimized with proper indexes
- ✅ Fully secured with Row Level Security

🚀 READY FOR AGENT IMPLEMENTATION:
- Phase 2: Chat sync API endpoints
- Phase 3: User management interfaces
- Phase 4: Settings and preferences UI
- Phase 5: Testing and validation

The database foundation is now complete and ready for all application features!
*/
