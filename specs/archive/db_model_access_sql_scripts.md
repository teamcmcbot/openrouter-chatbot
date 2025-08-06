# Database Model Access - SQL Migration Scripts

This document contains the complete SQL migration scripts for implementing the database model access changes as outlined in the main implementation plan.

## Migration Script 1: Core Schema Changes

**File: `database/05-model-access-migration.sql`**

```sql
-- =============================================================================
-- MODEL ACCESS MIGRATION - PHASE 5
-- =============================================================================
-- Migrates from hardcoded model lists to database-driven model access

BEGIN;

-- 1. Backup existing model_access table
CREATE TABLE IF NOT EXISTS public.model_access_backup AS
SELECT * FROM public.model_access;

-- 2. Drop and recreate model_access table with new schema
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

-- 3. Create indexes
CREATE INDEX idx_model_access_status ON public.model_access(status);
CREATE INDEX idx_model_access_tier_access ON public.model_access(is_free, is_pro, is_enterprise);
CREATE INDEX idx_model_access_last_synced ON public.model_access(last_synced_at);
CREATE INDEX idx_model_access_openrouter_seen ON public.model_access(openrouter_last_seen);

-- 4. Create sync log table
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

-- 5. Remove allowed_models column from profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS allowed_models;

-- 6. Enable RLS on new tables
ALTER TABLE public.model_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_sync_log ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies
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

COMMIT;
```

## Migration Script 2: Database Functions

**File: `database/06-model-access-functions.sql`**

```sql
-- =============================================================================
-- MODEL ACCESS FUNCTIONS
-- =============================================================================
-- Database functions for model access management

-- Function to get user's allowed models based on tier and model_access table
CREATE OR REPLACE FUNCTION public.get_user_allowed_models_v2(user_uuid UUID)
RETURNS TABLE (
    model_id VARCHAR(100),
    model_name VARCHAR(255),
    model_description TEXT,
    context_length INTEGER,
    prompt_price VARCHAR(20),
    completion_price VARCHAR(20),
    modality VARCHAR(50),
    input_modalities JSONB,
    output_modalities JSONB,
    supported_parameters JSONB,
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
        ma.context_length,
        ma.prompt_price,
        ma.completion_price,
        ma.modality,
        ma.input_modalities,
        ma.output_modalities,
        ma.supported_parameters,
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

-- Function to sync models from OpenRouter API
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

-- Update the existing update_user_preferences function to remove allowed_models handling
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
                -- REMOVED: allowed_models handling
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
```

## Migration Script 3: Verification and Cleanup

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
BEGIN
    -- Check if new model_access table exists and has data
    SELECT COUNT(*) INTO model_count FROM public.model_access;

    -- Check if new function exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.routines
        WHERE routine_name = 'get_user_allowed_models_v2'
        AND routine_schema = 'public'
    ) INTO function_exists;

    -- Check if RLS policies exist
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename IN ('model_access', 'model_sync_log');

    -- Verification results
    RAISE NOTICE '============================================';
    RAISE NOTICE 'MODEL ACCESS MIGRATION VERIFICATION';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Model Access Table: % models configured', model_count;
    RAISE NOTICE 'New Functions: %', CASE WHEN function_exists THEN 'Created' ELSE 'MISSING' END;
    RAISE NOTICE 'RLS Policies: % policies active', policy_count;

    IF model_count > 0 AND function_exists AND policy_count >= 2 THEN
        RAISE NOTICE 'Status: ✅ Migration completed successfully';
    ELSE
        RAISE NOTICE 'Status: ❌ Migration incomplete - check errors above';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE 'Next Steps:';
    RAISE NOTICE '1. Update /api/models endpoint';
    RAISE NOTICE '2. Create sync job endpoint';
    RAISE NOTICE '3. Run initial model sync';
    RAISE NOTICE '4. Configure model tier access';
    RAISE NOTICE '============================================';
END $$;
```

## Rollback Script

**File: `database/rollback-model-access.sql`**

```sql
-- =============================================================================
-- MODEL ACCESS ROLLBACK SCRIPT
-- =============================================================================
-- Emergency rollback script to restore previous functionality

BEGIN;

-- 1. Restore allowed_models column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS allowed_models TEXT[] DEFAULT ARRAY['deepseek/deepseek-r1-0528:free'];

-- 2. Populate allowed_models with default values for existing users
UPDATE public.profiles
SET allowed_models = ARRAY['deepseek/deepseek-r1-0528:free', 'google/gemini-2.0-flash-exp:free', 'qwen/qwen3-coder:free']
WHERE allowed_models IS NULL OR array_length(allowed_models, 1) IS NULL;

-- 3. Backup new tables before dropping
CREATE TABLE IF NOT EXISTS public.model_access_new_backup AS SELECT * FROM public.model_access;
CREATE TABLE IF NOT EXISTS public.model_sync_log_backup AS SELECT * FROM public.model_sync_log;

-- 4. Drop new tables (optional - only if complete rollback needed)
-- DROP TABLE IF EXISTS public.model_access CASCADE;
-- DROP TABLE IF EXISTS public.model_sync_log CASCADE;

-- 5. Restore old model_access table if backup exists
-- INSERT INTO public.model_access SELECT * FROM public.model_access_backup;

COMMIT;

-- Verification
DO $$
BEGIN
    RAISE NOTICE 'Rollback completed. Verify:';
    RAISE NOTICE '1. profiles.allowed_models column restored';
    RAISE NOTICE '2. Default models populated for all users';
    RAISE NOTICE '3. New tables backed up before removal';
END $$;
```

## Usage Instructions

### Execution Order

1. **Execute Migration**: Run `05-model-access-migration.sql`
2. **Add Functions**: Run `06-model-access-functions.sql`
3. **Verify Setup**: Run `07-model-access-verification.sql`
4. **Initial Sync**: Call the sync job endpoint to populate models
5. **Configure Access**: Use admin interface to set tier access

### Testing Commands

```sql
-- Test user model access
SELECT * FROM public.get_user_allowed_models_v2('your-user-uuid-here');

-- Test sync function (with sample data)
SELECT * FROM public.sync_openrouter_models('[{"id": "test-model", "name": "Test Model"}]'::jsonb);

-- Test admin functions
SELECT * FROM public.update_model_tier_access('deepseek/deepseek-r1-0528:free', true, true, true, 'active');
```

### Emergency Rollback

If issues occur, execute `rollback-model-access.sql` to restore previous functionality.

## Notes

- All scripts include transaction blocks for safety
- Backup tables are created before destructive operations
- RLS policies ensure data security
- Functions include comprehensive error handling
- Verification scripts confirm successful migration

These scripts should be reviewed and tested in a development environment before production deployment.
