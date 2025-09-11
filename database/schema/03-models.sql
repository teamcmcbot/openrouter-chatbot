-- =============================================================================
-- FINAL MODEL SCHEMA
-- =============================================================================
-- This file contains the final structure for model-related tables,
-- functions, triggers, and RLS policies.

-- =============================================================================
-- MODEL ACCESS TABLE
-- =============================================================================

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
    prompt_price VARCHAR(32) DEFAULT '0',
    completion_price VARCHAR(32) DEFAULT '0',
    request_price VARCHAR(32) DEFAULT '0',
    image_price VARCHAR(32) DEFAULT '0',
    output_image_price VARCHAR(32) DEFAULT '0',
    web_search_price VARCHAR(32) DEFAULT '0',
    internal_reasoning_price VARCHAR(32) DEFAULT '0',
    input_cache_read_price VARCHAR(32),
    input_cache_write_price VARCHAR(32),

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

-- =============================================================================
-- MODEL SYNC LOG TABLE
-- =============================================================================

CREATE TABLE public.model_sync_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sync_started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    sync_completed_at TIMESTAMPTZ,

    -- Sync statistics
    total_openrouter_models INTEGER DEFAULT 0,
    models_added INTEGER DEFAULT 0,
    models_updated INTEGER DEFAULT 0,
    models_marked_inactive INTEGER DEFAULT 0,
    models_reactivated INTEGER DEFAULT 0,

    -- Status and error tracking
    sync_status VARCHAR(20) DEFAULT 'running' CHECK (sync_status IN ('running', 'completed', 'failed')),
    error_message TEXT,
    error_details JSONB,

    -- Performance metrics (duration_ms = total elapsed incl. fetch; db_duration_ms = in-DB work only)
    duration_ms BIGINT,
    db_duration_ms BIGINT,

    -- Attribution
    added_by_user_id UUID,

    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

CREATE INDEX idx_model_access_status ON public.model_access(status);
CREATE INDEX idx_model_access_tier_access ON public.model_access(is_free, is_pro, is_enterprise);
CREATE INDEX idx_model_access_last_synced ON public.model_access(last_synced_at);
CREATE INDEX idx_model_access_openrouter_seen ON public.model_access(openrouter_last_seen);
CREATE INDEX idx_model_sync_log_status ON public.model_sync_log(sync_status, sync_started_at DESC);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on new tables
ALTER TABLE public.model_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_access FORCE ROW LEVEL SECURITY;
ALTER TABLE public.model_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_sync_log FORCE ROW LEVEL SECURITY;

-- Model access policies
CREATE POLICY "All users can view model access" ON public.model_access
    FOR SELECT USING (true);

CREATE POLICY "Only admins can view sync logs" ON public.model_sync_log
    FOR SELECT USING (public.is_admin(auth.uid()));

-- Allow admins to insert sync logs (used by sync function invoked under user context)
CREATE POLICY "Admins can insert sync logs" ON public.model_sync_log
    FOR INSERT WITH CHECK (public.is_admin(auth.uid()));

-- Allow admins to update sync logs (to mark completed/failed)
CREATE POLICY "Admins can update sync logs" ON public.model_sync_log
    FOR UPDATE USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- =============================================================================
-- UTILITY FUNCTIONS
-- =============================================================================

-- Function to get user's allowed models based on tier
CREATE OR REPLACE FUNCTION public.get_user_allowed_models(user_uuid UUID)
RETURNS TABLE (
    model_id VARCHAR(100),
    model_name VARCHAR(255),
    model_description TEXT,
    model_tags TEXT[], -- Keep for backward compatibility
    input_cost_per_token DECIMAL(10,8), -- Keep for backward compatibility
    output_cost_per_token DECIMAL(10,8), -- Keep for backward compatibility
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

    -- Return models available for user's tier
    RETURN QUERY
    SELECT
        ma.model_id,
        ma.model_name,
        ma.model_description,
        ARRAY[]::TEXT[] as model_tags, -- Empty array for backward compatibility
        COALESCE(ma.prompt_price::DECIMAL(10,8), 0.0) as input_cost_per_token,
        COALESCE(ma.completion_price::DECIMAL(10,8), 0.0) as output_cost_per_token,
        ma.daily_limit,
        ma.monthly_limit
    FROM public.model_access ma
    WHERE ma.status = 'active'
    AND (
        (user_tier = 'free' AND ma.is_free = true) OR
        (user_tier = 'pro' AND (ma.is_free = true OR ma.is_pro = true)) OR
        (user_tier = 'enterprise' AND (ma.is_free = true OR ma.is_pro = true OR ma.is_enterprise = true))
    )
    ORDER BY
        CASE
            WHEN ma.is_free THEN 1
            WHEN ma.is_pro THEN 2
            WHEN ma.is_enterprise THEN 3
            ELSE 4
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
        AND ma.status = 'active'
        AND (
            (user_tier = 'free' AND ma.is_free = true) OR
            (user_tier = 'pro' AND (ma.is_free = true OR ma.is_pro = true)) OR
            (user_tier = 'enterprise' AND (ma.is_free = true OR ma.is_pro = true OR ma.is_enterprise = true))
        )
    ) INTO model_available;

    RETURN model_available;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to sync models from OpenRouter API
CREATE OR REPLACE FUNCTION public.sync_openrouter_models(
    models_data JSONB,
    p_added_by_user_id UUID DEFAULT NULL,
    p_external_start TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    model_record JSONB;
    sync_log_id UUID;
    count_models_added INTEGER := 0;
    count_models_updated INTEGER := 0;
    count_models_marked_inactive INTEGER := 0;
    count_models_reactivated INTEGER := 0;
    total_models INTEGER;
    db_start_time TIMESTAMPTZ := NOW();
    effective_start TIMESTAMPTZ;
    current_model_ids TEXT[];
    previous_status VARCHAR(20);
    updated_rows INTEGER;
    total_duration_ms BIGINT;
    db_only_duration_ms BIGINT;
BEGIN
    IF p_external_start IS NOT NULL AND p_external_start < db_start_time THEN
        effective_start := p_external_start;
    ELSE
        effective_start := db_start_time;
    END IF;

    INSERT INTO public.model_sync_log (sync_status, total_openrouter_models, added_by_user_id, sync_started_at)
    VALUES ('running', jsonb_array_length(models_data), p_added_by_user_id, effective_start)
    RETURNING id INTO sync_log_id;

    total_models := jsonb_array_length(models_data);

    SELECT array_agg(model_element->>'id') INTO current_model_ids
    FROM jsonb_array_elements(models_data) AS model_element;

    FOR model_record IN SELECT * FROM jsonb_array_elements(models_data)
    LOOP
        SELECT status INTO previous_status
        FROM public.model_access
        WHERE model_id = model_record->>'id';

        UPDATE public.model_access
        SET
            canonical_slug = model_record->>'canonical_slug',
            hugging_face_id = model_record->>'hugging_face_id',
            model_name = model_record->>'name',
            model_description = model_record->>'description',
            context_length = COALESCE((model_record->>'context_length')::integer, 8192),
            modality = model_record->'architecture'->>'modality',
            input_modalities = COALESCE(model_record->'architecture'->'input_modalities', '[]'::jsonb),
            output_modalities = COALESCE(model_record->'architecture'->'output_modalities', '[]'::jsonb),
            tokenizer = model_record->'architecture'->>'tokenizer',
            prompt_price = COALESCE(model_record->'pricing'->>'prompt', '0'),
            completion_price = COALESCE(model_record->'pricing'->>'completion', '0'),
            request_price = COALESCE(model_record->'pricing'->>'request', '0'),
            image_price = COALESCE(model_record->'pricing'->>'image', '0'),
            web_search_price = COALESCE(model_record->'pricing'->>'web_search', '0'),
            internal_reasoning_price = COALESCE(model_record->'pricing'->>'internal_reasoning', '0'),
            input_cache_read_price = model_record->'pricing'->>'input_cache_read',
            input_cache_write_price = model_record->'pricing'->>'input_cache_write',
            max_completion_tokens = (model_record->'top_provider'->>'max_completion_tokens')::integer,
            is_moderated = COALESCE((model_record->'top_provider'->>'is_moderated')::boolean, false),
            supported_parameters = COALESCE(model_record->'supported_parameters', '[]'::jsonb),
            openrouter_last_seen = NOW(),
            last_synced_at = NOW(),
            status = CASE
                WHEN previous_status = 'inactive' THEN 'new'
                WHEN previous_status = 'disabled' THEN 'disabled'
                ELSE status
            END,
            updated_at = NOW()
        WHERE model_id = model_record->>'id';

        GET DIAGNOSTICS updated_rows = ROW_COUNT;

        IF updated_rows > 0 THEN
            count_models_updated := count_models_updated + 1;
            IF previous_status = 'inactive' THEN
                count_models_reactivated := count_models_reactivated + 1;
            END IF;
        ELSE
            INSERT INTO public.model_access (
                model_id,
                canonical_slug,
                hugging_face_id,
                model_name,
                model_description,
                context_length,
                created_timestamp,
                modality,
                input_modalities,
                output_modalities,
                tokenizer,
                prompt_price,
                completion_price,
                request_price,
                image_price,
                web_search_price,
                internal_reasoning_price,
                input_cache_read_price,
                input_cache_write_price,
                max_completion_tokens,
                is_moderated,
                supported_parameters,
                openrouter_last_seen,
                last_synced_at
            ) VALUES (
                model_record->>'id',
                model_record->>'canonical_slug',
                model_record->>'hugging_face_id',
                model_record->>'name',
                model_record->>'description',
                COALESCE((model_record->>'context_length')::integer, 8192),
                COALESCE((model_record->>'created')::bigint, extract(epoch from now())::bigint),
                model_record->'architecture'->>'modality',
                COALESCE(model_record->'architecture'->'input_modalities', '[]'::jsonb),
                COALESCE(model_record->'architecture'->'output_modalities', '[]'::jsonb),
                model_record->'architecture'->>'tokenizer',
                COALESCE(model_record->'pricing'->>'prompt', '0'),
                COALESCE(model_record->'pricing'->>'completion', '0'),
                COALESCE(model_record->'pricing'->>'request', '0'),
                COALESCE(model_record->'pricing'->>'image', '0'),
                COALESCE(model_record->'pricing'->>'web_search', '0'),
                COALESCE(model_record->'pricing'->>'internal_reasoning', '0'),
                model_record->'pricing'->>'input_cache_read',
                model_record->'pricing'->>'input_cache_write',
                (model_record->'top_provider'->>'max_completion_tokens')::integer,
                COALESCE((model_record->'top_provider'->>'is_moderated')::boolean, false),
                COALESCE(model_record->'supported_parameters', '[]'::jsonb),
                NOW(),
                NOW()
            );

            count_models_added := count_models_added + 1;
        END IF;
    END LOOP;

    UPDATE public.model_access
    SET status = 'inactive', updated_at = NOW()
    WHERE model_id NOT IN (SELECT unnest(current_model_ids))
      AND status != 'inactive';

    GET DIAGNOSTICS count_models_marked_inactive = ROW_COUNT;

    db_only_duration_ms := CEIL(EXTRACT(EPOCH FROM (NOW() - db_start_time)) * 1000)::bigint;
    total_duration_ms := CEIL(EXTRACT(EPOCH FROM (NOW() - effective_start)) * 1000)::bigint;

    UPDATE public.model_sync_log
    SET
        sync_status = 'completed',
        sync_completed_at = NOW(),
        models_added = count_models_added,
        models_updated = count_models_updated,
        models_marked_inactive = count_models_marked_inactive,
        models_reactivated = count_models_reactivated,
        duration_ms = total_duration_ms,
        db_duration_ms = db_only_duration_ms
    WHERE id = sync_log_id;

    RETURN jsonb_build_object(
        'success', true,
        'sync_log_id', sync_log_id,
        'total_processed', total_models,
        'models_added', count_models_added,
        'models_updated', count_models_updated,
        'models_marked_inactive', count_models_marked_inactive,
        'models_reactivated', count_models_reactivated,
        'duration_ms', total_duration_ms,
        'db_duration_ms', db_only_duration_ms
    );

EXCEPTION WHEN OTHERS THEN
    db_only_duration_ms := CEIL(EXTRACT(EPOCH FROM (NOW() - db_start_time)) * 1000)::bigint;
    total_duration_ms := CEIL(EXTRACT(EPOCH FROM (NOW() - effective_start)) * 1000)::bigint;

    UPDATE public.model_sync_log
    SET
        sync_status = 'failed',
        sync_completed_at = NOW(),
        error_message = SQLERRM,
        error_details = jsonb_build_object('sqlstate', SQLSTATE),
        duration_ms = total_duration_ms,
        db_duration_ms = db_only_duration_ms
    WHERE id = sync_log_id;

    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'sync_log_id', sync_log_id,
        'duration_ms', total_duration_ms,
        'db_duration_ms', db_only_duration_ms
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aggregated sync stats view (mirrors patch logic)
CREATE OR REPLACE VIEW public.v_sync_stats AS
WITH base AS (
    SELECT id, sync_status, sync_started_at, sync_completed_at, duration_ms, db_duration_ms
    FROM public.model_sync_log
), last_success AS (
    SELECT id AS last_success_id, sync_completed_at AS last_success_at
    FROM base
    WHERE sync_status = 'completed'
    ORDER BY sync_completed_at DESC NULLS LAST
    LIMIT 1
), agg AS (
    SELECT
        (SELECT last_success_id FROM last_success) AS last_success_id,
        (SELECT last_success_at FROM last_success) AS last_success_at,
        CASE WHEN COUNT(*) FILTER (WHERE sync_started_at >= now() - interval '30 days') = 0 THEN 0::numeric
             ELSE ROUND(
                 (SUM(CASE WHEN sync_status='completed' AND sync_started_at >= now() - interval '30 days' THEN 1 ELSE 0 END)::numeric
                    * 100
                    / COUNT(*) FILTER (WHERE sync_started_at >= now() - interval '30 days')
                 ), 2)
        END AS success_rate_30d,
        ROUND( (AVG(duration_ms) FILTER (WHERE sync_status='completed' AND sync_started_at >= now() - interval '30 days'))::numeric, 2) AS avg_duration_ms_30d,
        ROUND( (AVG(db_duration_ms) FILTER (WHERE sync_status='completed' AND sync_started_at >= now() - interval '30 days'))::numeric, 2) AS avg_db_duration_ms_30d,
        COUNT(*) FILTER (WHERE sync_started_at >= now() - interval '24 hours') AS runs_24h,
        COUNT(*) FILTER (WHERE sync_status='failed' AND sync_started_at >= now() - interval '24 hours') AS failures_24h
    FROM base
)
SELECT * FROM agg;

REVOKE ALL ON TABLE public.v_sync_stats FROM PUBLIC;
GRANT SELECT ON TABLE public.v_sync_stats TO service_role;

CREATE OR REPLACE FUNCTION public.get_sync_stats()
RETURNS public.v_sync_stats
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    r public.v_sync_stats%ROWTYPE;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'insufficient_privilege';
    END IF;
    SELECT * INTO r FROM public.v_sync_stats;
    RETURN r;
END;$$;

REVOKE ALL ON FUNCTION public.get_sync_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sync_stats() TO authenticated, service_role;

-- Function to update model tier access (for admin use)
CREATE OR REPLACE FUNCTION public.update_model_tier_access(
    p_model_id VARCHAR(100),
    p_is_free BOOLEAN DEFAULT NULL,
    p_is_pro BOOLEAN DEFAULT NULL,
    p_is_enterprise BOOLEAN DEFAULT NULL,
    p_status VARCHAR(20) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    -- Validate status if provided
    IF p_status IS NOT NULL AND p_status NOT IN ('active', 'inactive', 'disabled', 'new') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid status. Must be: active, inactive, disabled, or new'
        );
    END IF;

    -- Update model access
    UPDATE public.model_access
    SET
        is_free = COALESCE(p_is_free, is_free),
        is_pro = COALESCE(p_is_pro, is_pro),
        is_enterprise = COALESCE(p_is_enterprise, is_enterprise),
        status = COALESCE(p_status, status),
        updated_at = NOW()
    WHERE model_id = p_model_id;

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    IF updated_count = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Model not found'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'model_id', p_model_id,
        'updated_at', NOW()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- SEED DATA
-- =============================================================================

-- Insert seed data for common free models
INSERT INTO public.model_access (
    model_id, model_name, model_description, status, is_free, is_pro, is_enterprise,
    prompt_price, completion_price, context_length
) VALUES
    ('deepseek/deepseek-r1-0528:free', 'DeepSeek R1 Free', 'Advanced reasoning model - free tier', 'active', true, true, true, '0', '0', 32768),
    ('google/gemini-2.0-flash-exp:free', 'Gemini 2.0 Flash Free', 'Fast multimodal model - free tier', 'active', true, true, true, '0', '0', 1048576),
    ('qwen/qwen3-coder:free', 'Qwen3 Coder Free', 'Code generation model - free tier', 'active', true, true, true, '0', '0', 262144)
ON CONFLICT (model_id) DO NOTHING;
