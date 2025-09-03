-- Patch: Map tokens from assistant events and add total_tokens to daily aggregates
-- Summary:
-- - Anonymous input/output tokens now sourced from the 'completion_received' (assistant) event.
-- - 'message_sent' only increments messages_sent; no token attribution from it.
-- - Per-model daily aggregates insert both prompt_tokens (input_tokens) and completion_tokens (output_tokens) in one upsert for assistant event.
-- - Add total_tokens generated column to anonymous_usage_daily.

-- 1) Add total_tokens to daily aggregates (generated column)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'anonymous_usage_daily'
      AND column_name = 'total_tokens'
  ) THEN
    EXECUTE 'ALTER TABLE public.anonymous_usage_daily
             ADD COLUMN total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED';
  END IF;
END$$;

-- 2) Recreate ingestion function to consume tokens from assistant event
CREATE OR REPLACE FUNCTION public.ingest_anonymous_usage(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hash TEXT;
    v_events jsonb;
    v_day DATE;
    v_msg_sent INT := 0;
    v_msg_recv INT := 0;
    v_in_tokens INT := 0;
    v_out_tokens INT := 0;
    v_models_used INT := 0;
    v_gen_ms BIGINT := 0;
    v_model_set JSONB := '[]'::jsonb;
    v_evt jsonb;
    v_ts timestamptz;
    v_type text;
    v_model text;
    v_itokens int;
    v_otokens int;
    v_elapsed int;
    v_prompt_price DECIMAL(12,8);
    v_completion_price DECIMAL(12,8);
BEGIN
    IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
        RAISE EXCEPTION 'invalid_payload';
    END IF;

    v_hash := COALESCE(p_payload->> 'anon_hash', '');
    v_events := p_payload-> 'events';

    IF v_hash = '' OR v_events IS NULL OR jsonb_typeof(v_events) <> 'array' THEN
        RAISE EXCEPTION 'invalid_payload_fields';
    END IF;

    -- Cap number of events to prevent abuse
    IF jsonb_array_length(v_events) > 50 THEN
        RAISE EXCEPTION 'too_many_events';
    END IF;

    -- Collapse events to a single UTC day window (use first event''s day)
    v_ts := ((v_events->0)->> 'timestamp')::timestamptz;
    IF v_ts IS NULL THEN
        v_day := CURRENT_DATE;
    ELSE
        v_day := (v_ts AT TIME ZONE 'UTC')::date;
    END IF;

    FOR v_evt IN SELECT * FROM jsonb_array_elements(v_events) LOOP
        v_type := COALESCE(v_evt->> 'type', '');
        v_model := NULLIF(v_evt->> 'model', '');
        v_itokens := COALESCE((v_evt->> 'input_tokens')::int, 0);
        v_otokens := COALESCE((v_evt->> 'output_tokens')::int, 0);
        v_elapsed := COALESCE((v_evt->> 'elapsed_ms')::int, 0);

        IF v_type = 'message_sent' THEN
            -- Only count the user message occurrence
            v_msg_sent := v_msg_sent + 1;

        ELSIF v_type = 'completion_received' THEN
            -- All relevant metrics come from the assistant event
            v_msg_recv := v_msg_recv + 1;
            v_in_tokens := v_in_tokens + GREATEST(v_itokens, 0);
            v_out_tokens := v_out_tokens + GREATEST(v_otokens, 0);
            v_gen_ms := v_gen_ms + GREATEST(v_elapsed, 0);

            IF v_model IS NOT NULL THEN
                -- Snapshot current pricing for this model (model_access prices are VARCHAR, cast to DECIMAL)
                SELECT COALESCE(NULLIF(prompt_price,'')::DECIMAL(12,8), 0),
                       COALESCE(NULLIF(completion_price,'')::DECIMAL(12,8), 0)
                INTO v_prompt_price, v_completion_price
                FROM public.model_access
                WHERE model_id = v_model;

                INSERT INTO public.anonymous_model_usage_daily (
                    usage_date, model_id,
                    prompt_tokens, completion_tokens,
                    assistant_messages, generation_ms,
                    prompt_unit_price, completion_unit_price, estimated_cost
                ) VALUES (
                    v_day, v_model,
                    GREATEST(v_itokens,0), GREATEST(v_otokens,0),
                    1, GREATEST(v_elapsed,0),
                    v_prompt_price, v_completion_price,
                    ROUND(GREATEST(v_itokens,0) * COALESCE(v_prompt_price,0)
                       + GREATEST(v_otokens,0) * COALESCE(v_completion_price,0), 6)
                ) ON CONFLICT (usage_date, model_id) DO UPDATE SET
                    prompt_tokens = public.anonymous_model_usage_daily.prompt_tokens + EXCLUDED.prompt_tokens,
                    completion_tokens = public.anonymous_model_usage_daily.completion_tokens + EXCLUDED.completion_tokens,
                    assistant_messages = public.anonymous_model_usage_daily.assistant_messages + EXCLUDED.assistant_messages,
                    generation_ms = public.anonymous_model_usage_daily.generation_ms + EXCLUDED.generation_ms,
                    estimated_cost = public.anonymous_model_usage_daily.estimated_cost + EXCLUDED.estimated_cost,
                    prompt_unit_price = COALESCE(public.anonymous_model_usage_daily.prompt_unit_price, EXCLUDED.prompt_unit_price),
                    completion_unit_price = COALESCE(public.anonymous_model_usage_daily.completion_unit_price, EXCLUDED.completion_unit_price),
                    updated_at = NOW();
            END IF;
        END IF;

        IF v_model IS NOT NULL THEN
            IF NOT (v_model_set ? v_model) THEN
                v_model_set := v_model_set || to_jsonb(v_model);
                v_models_used := v_models_used + 1;
            END IF;
        END IF;
    END LOOP;

    INSERT INTO public.anonymous_usage_daily(
        anon_hash, usage_date, messages_sent, messages_received,
        input_tokens, output_tokens, generation_ms
    ) VALUES (
        v_hash, v_day, v_msg_sent, v_msg_recv,
        v_in_tokens, v_out_tokens, v_gen_ms
    ) ON CONFLICT (anon_hash, usage_date) DO UPDATE SET
        messages_sent = public.anonymous_usage_daily.messages_sent + EXCLUDED.messages_sent,
        messages_received = public.anonymous_usage_daily.messages_received + EXCLUDED.messages_received,
        input_tokens = public.anonymous_usage_daily.input_tokens + EXCLUDED.input_tokens,
        output_tokens = public.anonymous_usage_daily.output_tokens + EXCLUDED.output_tokens,
        generation_ms = public.anonymous_usage_daily.generation_ms + EXCLUDED.generation_ms,
        updated_at = NOW();

    RETURN jsonb_build_object(
        'ok', true,
        'anon_hash', v_hash,
        'date', v_day,
        'messages_sent', v_msg_sent,
        'messages_received', v_msg_recv,
        'input_tokens', v_in_tokens,
        'output_tokens', v_out_tokens,
        'total_tokens', v_in_tokens + v_out_tokens,
        'generation_ms', v_gen_ms
    );
END;
$$;

COMMENT ON FUNCTION public.ingest_anonymous_usage(jsonb) IS 'SECURITY DEFINER: Aggregates anonymous usage; tokens pulled from assistant(completion_received) events; prices cast from VARCHAR to DECIMAL; idempotent per anon_hash+day.';
