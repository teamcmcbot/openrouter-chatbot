# Database Model Access - Corrected Migration Scripts

This document contains the corrected SQL migration scripts that properly handle function dependencies and avoid creating v2 functions.

## Key Corrections Made

1. **No v2 functions** - Update existing functions in place with same names
2. **Handle function dependencies** - Drop dependent functions first, then recreate
3. **Remove `allowed_models` column** - Models come from `model_access` table filtered by tier
4. **Make `default_model` nullable** - User's favorite model, not required

## Migration Script 1: Core Schema Changes with Function Dependencies

**File: `database/05-model-access-migration.sql`**

```sql
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
```

## Migration Script 2: Recreate Functions (Same Names)

**File: `database/06-model-access-functions.sql`**

```sql
-- =============================================================================
-- MODEL ACCESS FUNCTIONS - RECREATE WITH SAME NAMES
-- =============================================================================
-- Recreates existing functions to work with new model_access table structure

-- Function to get user's allowed models based on tier (SAME NAME, NEW IMPLEMENTATION)
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

-- Function to check if user can use a specific model (SAME NAME, NEW IMPLEMENTATION)
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

-- Function to update user preferences (SAME NAME, UPDATED IMPLEMENTATION)
-- REMOVED: allowed_models handling since models come from model_access table
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
                -- REMOVED: allowed_models handling - models now come from model_access table
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

-- Function to get user's complete profile (SAME NAME, UPDATED IMPLEMENTATION)
-- UPDATED: Remove allowed_models from profile data since it comes from model_access table
CREATE OR REPLACE FUNCTION public.get_user_complete_profile(user_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    profile_data RECORD;
    allowed_models_data JSONB;
    usage_stats_data JSONB;
BEGIN
    -- Get main profile data (REMOVED allowed_models from SELECT)
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

    -- Get allowed models with details from new model_access table
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

    -- Get recent usage stats
    SELECT jsonb_build_object(
        'today', (
            SELECT jsonb_agg(
                jsonb_build_object(
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
        'total', profile_data.usage_stats
    ) INTO usage_stats_data;

    -- Return complete profile (REMOVED allowed_models from preferences.model)
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
                -- REMOVED: 'allowed_models' - now comes from model_access table
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

-- Function to sync models from OpenRouter API (NEW FUNCTION)
CREATE OR REPLACE FUNCTION public.sync_openrouter_models(
    models_data JSONB
)
RETURNS JSONB AS $$
DECLARE
    model_record JSONB;
    sync_log_id UUID;
    models_added INTEGER := 0;
    models_updated INTEGER := 0;
    models_marked_inactive INTEGER := 0;
    total_models INTEGER;
    start_time TIMESTAMPTZ := NOW();
    current_model_ids TEXT[];
BEGIN
    -- Start sync log
    INSERT INTO public.model_sync_log (sync_status, total_openrouter_models)
    VALUES ('running', jsonb_array_length(models_data))
    RETURNING id INTO sync_log_id;

    -- Get total count
    total_models := jsonb_array_length(models_data);

    -- Collect all current model IDs from OpenRouter
    SELECT array_agg(model_record->>'id') INTO current_model_ids
    FROM jsonb_array_elements(models_data) AS model_record;

    -- Process each model from OpenRouter
    FOR model_record IN SELECT * FROM jsonb_array_elements(models_data)
    LOOP
        -- Insert or update model
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
        )
        ON CONFLICT (model_id) DO UPDATE SET
            canonical_slug = EXCLUDED.canonical_slug,
            hugging_face_id = EXCLUDED.hugging_face_id,
            model_name = EXCLUDED.model_name,
            model_description = EXCLUDED.model_description,
            context_length = EXCLUDED.context_length,
            modality = EXCLUDED.modality,
            input_modalities = EXCLUDED.input_modalities,
            output_modalities = EXCLUDED.output_modalities,
            tokenizer = EXCLUDED.tokenizer,
            prompt_price = EXCLUDED.prompt_price,
            completion_price = EXCLUDED.completion_price,
            request_price = EXCLUDED.request_price,
            image_price = EXCLUDED.image_price,
            web_search_price = EXCLUDED.web_search_price,
            internal_reasoning_price = EXCLUDED.internal_reasoning_price,
            input_cache_read_price = EXCLUDED.input_cache_read_price,
            input_cache_write_price = EXCLUDED.input_cache_write_price,
            max_completion_tokens = EXCLUDED.max_completion_tokens,
            is_moderated = EXCLUDED.is_moderated,
            supported_parameters = EXCLUDED.supported_parameters,
            openrouter_last_seen = EXCLUDED.openrouter_last_seen,
            last_synced_at = EXCLUDED.last_synced_at,
            updated_at = NOW();

        -- Count if this was an insert or update
        IF FOUND THEN
            models_updated := models_updated + 1;
        ELSE
            models_added := models_added + 1;
        END IF;
    END LOOP;

    -- Mark models as inactive if they're no longer in OpenRouter
    UPDATE public.model_access
    SET status = 'inactive', updated_at = NOW()
    WHERE model_id NOT IN (SELECT unnest(current_model_ids))
    AND status != 'inactive';

    GET DIAGNOSTICS models_marked_inactive = ROW_COUNT;

    -- Complete sync log
    UPDATE public.model_sync_log
    SET
        sync_status = 'completed',
        sync_completed_at = NOW(),
        models_added = sync_openrouter_models.models_added,
        models_updated = sync_openrouter_models.models_updated,
        models_marked_inactive = sync_openrouter_models.models_marked_inactive,
        duration_ms = EXTRACT(EPOCH FROM (NOW() - start_time)) * 1000
    WHERE id = sync_log_id;

    RETURN jsonb_build_object(
        'success', true,
        'sync_log_id', sync_log_id,
        'total_processed', total_models,
        'models_added', models_added,
        'models_updated', models_updated,
        'models_marked_inactive', models_marked_inactive,
        'duration_ms', EXTRACT(EPOCH FROM (NOW() - start_time)) * 1000
    );

EXCEPTION WHEN OTHERS THEN
    -- Log error
    UPDATE public.model_sync_log
    SET
        sync_status = 'failed',
        sync_completed_at = NOW(),
        error_message = SQLERRM,
        error_details = jsonb_build_object('sqlstate', SQLSTATE),
        duration_ms = EXTRACT(EPOCH FROM (NOW() - start_time)) * 1000
    WHERE id = sync_log_id;

    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'sync_log_id', sync_log_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update model tier access (NEW FUNCTION for admin use)
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
```

## Migration Script 3: Verification

**File: `database/07-model-access-verification.sql`**

```sql
-- =============================================================================
-- MODEL ACCESS VERIFICATION
-- =============================================================================
-- Verification script to ensure migration completed successfully

DO $$
DECLARE
    model_count INTEGER;
    function_exists BOOLEAN;
    policy_count INTEGER;
    allowed_models_exists BOOLEAN;
    default_model_nullable BOOLEAN;
BEGIN
    -- Check if new model_access table exists and has data
    SELECT COUNT(*) INTO model_count FROM public.model_access;

    -- Check if functions exist with correct names (no v2)
    SELECT EXISTS (
        SELECT 1 FROM information_schema.routines
        WHERE routine_name = 'get_user_allowed_models'
        AND routine_schema = 'public'
    ) INTO function_exists;

    -- Check if RLS policies exist
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename IN ('model_access', 'model_sync_log');

    -- Check if allowed_models column was removed
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'allowed_models'
    ) INTO allowed_models_exists;

    -- Check if default_model is nullable
    SELECT is_nullable = 'YES' INTO default_model_nullable
    FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'default_model';

    -- Verification results
    RAISE NOTICE '============================================';
    RAISE NOTICE 'MODEL ACCESS MIGRATION VERIFICATION';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Model Access Table: % models configured', model_count;
    RAISE NOTICE 'Functions: %', CASE WHEN function_exists THEN 'Updated (same names)' ELSE 'MISSING' END;
    RAISE NOTICE 'RLS Policies: % policies active', policy_count;
    RAISE NOTICE 'Allowed Models Column: %', CASE WHEN allowed_models_exists THEN 'STILL EXISTS (ERROR)' ELSE 'Removed ✓' END;
    RAISE NOTICE 'Default Model Nullable: %', CASE WHEN default_model_nullable THEN 'Yes ✓' ELSE 'No (ERROR)' END;

    IF model_count > 0 AND function_exists AND policy_count >= 2 AND NOT allowed_models_exists AND default_model_nullable THEN
        RAISE NOTICE 'Status: ✅ Migration completed successfully';
    ELSE
        RAISE NOTICE 'Status: ❌ Migration incomplete - check errors above';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE 'Next Steps:';
    RAISE NOTICE '1. Update /api/models endpoint to use database';
    RAISE NOTICE '2. Create sync job endpoint';
    RAISE NOTICE '3. Run initial model sync';
    RAISE NOTICE '4. Configure model tier access via admin interface';
    RAISE NOTICE '============================================';
END $$;
```

## Key Changes Summary

### Function Dependencies Handled

- ✅ `get_user_complete_profile()` calls `get_user_allowed_models()` - both updated
- ✅ All functions recreated with **same names** (no v2)
- ✅ Functions dropped first, then recreated to avoid CASCADE issues

### Schema Changes

- ✅ `allowed_models` column removed from `profiles` table
- ✅ `default_model` made nullable (user's favorite, not required)
- ✅ New `model_access` table with tier access fields
- ✅ Status tracking (`active`, `inactive`, `disabled`, `new`)

### Backward Compatibility

- ✅ Function signatures maintained for existing callers
- ✅ Return types kept compatible where possible
- ✅ Empty arrays returned for removed fields

This corrected migration properly handles all function dependencies and implements the requirements without creating v2 functions.
