-- 001_fix_models_added_count.sql
-- Purpose: Fix models_added count in sync_openrouter_models by reliably distinguishing INSERT vs UPDATE
-- Context: FOUND after INSERT ... ON CONFLICT DO UPDATE is true for both paths, so added count remained 0.
-- Approach: Use UPDATE-first with ROW_COUNT; if 0 rows updated, perform INSERT. Keep reactivation logic based on previous_status.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_openrouter_models(
    models_data JSONB,
    p_added_by_user_id UUID DEFAULT NULL
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
    start_time TIMESTAMPTZ := NOW();
    current_model_ids TEXT[];
    previous_status VARCHAR(20);
    updated_rows INTEGER;
BEGIN
    -- Start sync log with attribution
    INSERT INTO public.model_sync_log (sync_status, total_openrouter_models, added_by_user_id)
    VALUES ('running', jsonb_array_length(models_data), p_added_by_user_id)
    RETURNING id INTO sync_log_id;

    -- Get total count
    total_models := jsonb_array_length(models_data);

    -- Collect all current model IDs from OpenRouter
    SELECT array_agg(model_element->>'id') INTO current_model_ids
    FROM jsonb_array_elements(models_data) AS model_element;

    -- Process each model from OpenRouter
    FOR model_record IN SELECT * FROM jsonb_array_elements(models_data)
    LOOP
        -- Capture previous status (if any) for reactivation tracking
        SELECT status INTO previous_status
        FROM public.model_access
        WHERE model_id = model_record->>'id';

        -- Try UPDATE first; preserves tier flags and handles inactive->new transition
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
            -- It was an update
            count_models_updated := count_models_updated + 1;
            IF previous_status = 'inactive' THEN
                count_models_reactivated := count_models_reactivated + 1;
            END IF;
        ELSE
            -- No existing row; perform INSERT
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

    -- Mark models as inactive if they're no longer in OpenRouter
    UPDATE public.model_access
    SET status = 'inactive', updated_at = NOW()
    WHERE model_id NOT IN (SELECT unnest(current_model_ids))
      AND status != 'inactive';

    GET DIAGNOSTICS count_models_marked_inactive = ROW_COUNT;

    -- Complete sync log
    UPDATE public.model_sync_log
    SET
        sync_status = 'completed',
        sync_completed_at = NOW(),
        models_added = count_models_added,
        models_updated = count_models_updated,
        models_marked_inactive = count_models_marked_inactive,
        models_reactivated = count_models_reactivated,
        duration_ms = EXTRACT(EPOCH FROM (NOW() - start_time)) * 1000
    WHERE id = sync_log_id;

    RETURN jsonb_build_object(
        'success', true,
        'sync_log_id', sync_log_id,
        'total_processed', total_models,
        'models_added', count_models_added,
        'models_updated', count_models_updated,
        'models_marked_inactive', count_models_marked_inactive,
        'models_reactivated', count_models_reactivated,
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

COMMIT;
