-- =============================================================================
-- MODEL ACCESS MIGRATION - PHASE 5
-- =============================================================================
-- Migrates from hardcoded model lists to database-driven model access
-- IMPORTANT: Handles function dependencies properly

BEGIN;

-- 1. Backup existing model_access table
CREATE TABLE IF NOT EXISTS public.model_access_backup AS
SELECT * FROM public.model_access;

-- 2. Drop dependent functions first (to avoid CASCADE issues)
-- These will be recreated with same names but new implementations
DROP FUNCTION IF EXISTS public.get_user_complete_profile(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_allowed_models(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.can_user_use_model(UUID, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS public.update_user_preferences(UUID, VARCHAR, JSONB) CASCADE;
-- View depending on profiles.allowed_models
DROP VIEW IF EXISTS public.api_user_summary CASCADE;

-- 3. Drop and recreate model_access table with new schema
DROP TABLE IF EXISTS public.model_access CASCADE;

CREATE TABLE public.model_access (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- OpenRouter model identification
    model_id VARCHAR(100) NOT NULL UNIQUE,
    canonical_slug VARCHAR(255),
    hugging_face_id VARCHAR(255),

    -- Model metadata from OpenRouter
    model_name VARCHAR(255) NOT NULL,
    model_description TEXT,
    context_length INTEGER DEFAULT 8192,
    created_timestamp BIGINT,

    -- Architecture information
    modality VARCHAR(50),
    input_modalities JSONB DEFAULT '[]'::jsonb,
    output_modalities JSONB DEFAULT '[]'::jsonb,
    tokenizer VARCHAR(100),

    -- Pricing information
    prompt_price VARCHAR(20) DEFAULT '0',
    completion_price VARCHAR(20) DEFAULT '0',
    request_price VARCHAR(20) DEFAULT '0',
    image_price VARCHAR(20) DEFAULT '0',
    web_search_price VARCHAR(20) DEFAULT '0',
    internal_reasoning_price VARCHAR(20) DEFAULT '0',
    input_cache_read_price VARCHAR(20),
    input_cache_write_price VARCHAR(20),

    -- Provider information
    max_completion_tokens INTEGER,
    is_moderated BOOLEAN DEFAULT false,
    supported_parameters JSONB DEFAULT '[]'::jsonb,

    -- Status tracking
    status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('active', 'inactive', 'disabled', 'new')),

    -- Tier access control
    is_free BOOLEAN DEFAULT false,
    is_pro BOOLEAN DEFAULT false,
    is_enterprise BOOLEAN DEFAULT false,

    -- Rate limits
    daily_limit INTEGER DEFAULT NULL,
    monthly_limit INTEGER DEFAULT NULL,

    -- Sync tracking
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    openrouter_last_seen TIMESTAMPTZ DEFAULT NOW(),

    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 4. Create indexes
CREATE INDEX idx_model_access_status ON public.model_access(status);
CREATE INDEX idx_model_access_tier_access ON public.model_access(is_free, is_pro, is_enterprise);
CREATE INDEX idx_model_access_last_synced ON public.model_access(last_synced_at);
CREATE INDEX idx_model_access_openrouter_seen ON public.model_access(openrouter_last_seen);

-- 5. Create sync log table
CREATE TABLE public.model_sync_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sync_started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    sync_completed_at TIMESTAMPTZ,

    -- Sync statistics
    total_openrouter_models INTEGER DEFAULT 0,
    models_added INTEGER DEFAULT 0,
    models_updated INTEGER DEFAULT 0,
    models_marked_inactive INTEGER DEFAULT 0,

    -- Status and error tracking
    sync_status VARCHAR(20) DEFAULT 'running' CHECK (sync_status IN ('running', 'completed', 'failed')),
    error_message TEXT,
    error_details JSONB,

    -- Performance metrics
    duration_ms INTEGER,

    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_model_sync_log_status ON public.model_sync_log(sync_status, sync_started_at DESC);

-- 6. Remove allowed_models column from profiles (since models come from model_access table now)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS allowed_models;

-- 7. Make default_model nullable (user's favorite model, not required)
ALTER TABLE public.profiles ALTER COLUMN default_model DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN default_model DROP DEFAULT;

-- 8. Enable RLS on new tables
ALTER TABLE public.model_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_sync_log ENABLE ROW LEVEL SECURITY;

-- 9. Create RLS policies
CREATE POLICY "All authenticated users can view model access" ON public.model_access
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Only admins can view sync logs" ON public.model_sync_log
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND subscription_tier = 'admin'
        )
    );

-- 10. Insert seed data for common free models
INSERT INTO public.model_access (
    model_id, model_name, model_description, status, is_free, is_pro, is_enterprise,
    prompt_price, completion_price, context_length
) VALUES
    ('deepseek/deepseek-r1-0528:free', 'DeepSeek R1 Free', 'Advanced reasoning model - free tier', 'active', true, true, true, '0', '0', 32768),
    ('google/gemini-2.0-flash-exp:free', 'Gemini 2.0 Flash Free', 'Fast multimodal model - free tier', 'active', true, true, true, '0', '0', 1048576),
    ('qwen/qwen3-coder:free', 'Qwen3 Coder Free', 'Code generation model - free tier', 'active', true, true, true, '0', '0', 262144)
ON CONFLICT (model_id) DO NOTHING;

COMMIT;
