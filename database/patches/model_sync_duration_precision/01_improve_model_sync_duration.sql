-- Patch: Improve model sync duration precision and accuracy
-- 1. Add db_duration_ms to capture DB processing time only
-- 2. Change duration_ms to BIGINT for higher precision (milliseconds, can store large values)
-- 3. Update sync_openrouter_models to optionally accept external start timestamp (captured before network fetch)
-- 4. Avoid 0ms truncation by using CEIL() and explicit casting
-- 5. Maintain backward compatibility: if external start not passed, falls back to DB start

BEGIN;

-- Ensure we can alter model_sync_log.duration_ms by removing dependent view/function first
-- (they will be recreated later in this patch). This avoids: cannot alter type of a column used by a view or rule
DROP FUNCTION IF EXISTS public.get_sync_stats();
DROP VIEW IF EXISTS public.v_sync_stats; -- safe: recreated below

-- 1. Add new column if not exists
ALTER TABLE public.model_sync_log
    ADD COLUMN IF NOT EXISTS db_duration_ms BIGINT;

-- 2. Alter duration_ms to BIGINT (idempotent-ish: only if type not already BIGINT)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'model_sync_log'
          AND column_name = 'duration_ms'
          AND data_type <> 'bigint'
    ) THEN
        ALTER TABLE public.model_sync_log
            ALTER COLUMN duration_ms TYPE BIGINT USING duration_ms::bigint;
    END IF;
END; $$;

-- 3. Replace function with improved version
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
    effective_start TIMESTAMPTZ; -- earliest of external vs db start (if provided)
    current_model_ids TEXT[];
    previous_status VARCHAR(20);
    updated_rows INTEGER;
    total_duration_ms BIGINT;
    db_only_duration_ms BIGINT;
BEGIN
    -- Decide effective start (use external if provided and earlier)
    IF p_external_start IS NOT NULL AND p_external_start < db_start_time THEN
        effective_start := p_external_start;
    ELSE
        effective_start := db_start_time;
    END IF;

    -- Start sync log (store sync_started_at = effective start for consistency)
    INSERT INTO public.model_sync_log (sync_status, total_openrouter_models, added_by_user_id, sync_started_at)
    VALUES ('running', jsonb_array_length(models_data), p_added_by_user_id, effective_start)
    RETURNING id INTO sync_log_id;

    total_models := jsonb_array_length(models_data);

    -- Collect all current model IDs from OpenRouter
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

    -- Mark inactive
    UPDATE public.model_access
    SET status = 'inactive', updated_at = NOW()
    WHERE model_id NOT IN (SELECT unnest(current_model_ids))
      AND status != 'inactive';

    GET DIAGNOSTICS count_models_marked_inactive = ROW_COUNT;

    -- Compute durations
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

-- Recreate optimized sync stats view (same logic as hardening patch; updated to work after type change)
-- Including the new db_duration_ms (optional exposure) and using duration_ms as total duration
CREATE OR REPLACE VIEW public.v_sync_stats AS
WITH base AS (
    SELECT
        id,
        sync_status,
        sync_started_at,
        sync_completed_at,
        duration_ms,
        db_duration_ms
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

-- Reset privileges (same stance as before: restrict direct access)
REVOKE ALL ON TABLE public.v_sync_stats FROM PUBLIC;
GRANT SELECT ON TABLE public.v_sync_stats TO service_role;

-- Recreate wrapper function with admin check
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

COMMIT;
