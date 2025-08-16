-- ============================================================================
-- Patch: 002-update-cost-function-elapsed_ms.sql
-- Purpose: Ensure cost tracking function records elapsed_ms into message_token_costs
-- Context: Initial elapsed-time-ms migration (001) added elapsed_ms column to
--          message_token_costs but did not recreate calculate_and_record_message_cost.
--          As a result, existing deployments may still insert rows with default 0.
-- Changes:
--   * Recreate public.calculate_and_record_message_cost() to include elapsed_ms
--   * (Idempotent) Safe to re-run; trigger name unchanged.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.calculate_and_record_message_cost()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_prompt_price DECIMAL(12,8) := 0; -- per token
    v_completion_price DECIMAL(12,8) := 0; -- per token
    v_image_price DECIMAL(12,8) := 0; -- per image unit (future)
    v_prompt_cost DECIMAL(12,6) := 0;
    v_completion_cost DECIMAL(12,6) := 0;
    v_image_cost DECIMAL(12,6) := 0;
    v_total_cost DECIMAL(12,6) := 0;
    v_pricing_snapshot JSONB := '{}'::jsonb;
BEGIN
    IF NEW.role <> 'assistant' THEN
        RETURN NEW; -- ignore non-assistant
    END IF;
    IF NEW.error_message IS NOT NULL AND NEW.error_message <> '' THEN
        RETURN NEW; -- ignore failed assistant messages
    END IF;

    SELECT user_id INTO v_user_id FROM public.chat_sessions WHERE id = NEW.session_id;
    IF v_user_id IS NULL THEN
        RAISE NOTICE 'calculate_and_record_message_cost: session % not found', NEW.session_id;
        RETURN NEW;
    END IF;

    SELECT 
        COALESCE(prompt_price, '0'),
        COALESCE(completion_price, '0'),
        COALESCE(image_price, '0'),
        to_jsonb(ma.*)
    INTO v_prompt_price, v_completion_price, v_image_price, v_pricing_snapshot
    FROM public.model_access ma
    WHERE ma.model_id = NEW.model;

    v_prompt_cost := ROUND( (COALESCE(NEW.input_tokens,0) * COALESCE(v_prompt_price,0))::numeric, 6 );
    v_completion_cost := ROUND( (COALESCE(NEW.output_tokens,0) * COALESCE(v_completion_price,0))::numeric, 6 );
    v_image_cost := 0; -- future use
    v_total_cost := COALESCE(v_prompt_cost,0) + COALESCE(v_completion_cost,0) + COALESCE(v_image_cost,0);

    INSERT INTO public.message_token_costs (
        user_id, session_id, assistant_message_id, user_message_id, completion_id,
        model_id, message_timestamp, prompt_tokens, completion_tokens, elapsed_ms,
        prompt_unit_price, completion_unit_price, image_units, image_unit_price,
        prompt_cost, completion_cost, image_cost, total_cost, pricing_source
    ) VALUES (
        v_user_id, NEW.session_id, NEW.id, NEW.user_message_id, NEW.completion_id,
        NEW.model, NEW.message_timestamp, COALESCE(NEW.input_tokens,0), COALESCE(NEW.output_tokens,0), COALESCE(NEW.elapsed_ms,0),
        v_prompt_price, v_completion_price, 0, v_image_price,
        v_prompt_cost, v_completion_cost, v_image_cost, v_total_cost,
        jsonb_build_object(
            'model_id', NEW.model,
            'pricing_basis', 'per_token',
            'prompt_price', v_prompt_price,
            'completion_price', v_completion_price,
            'image_price', v_image_price,
            'source_row', v_pricing_snapshot->>'id'
        )
    ) ON CONFLICT (assistant_message_id) DO NOTHING;

    IF EXISTS (SELECT 1 FROM public.message_token_costs WHERE assistant_message_id = NEW.id AND total_cost = v_total_cost) THEN
        UPDATE public.user_usage_daily
        SET estimated_cost = COALESCE(estimated_cost,0) + v_total_cost,
            updated_at = NOW()
        WHERE user_id = v_user_id AND usage_date = CURRENT_DATE;

        IF NOT FOUND THEN
            INSERT INTO public.user_usage_daily (user_id, usage_date, estimated_cost)
            VALUES (v_user_id, CURRENT_DATE, v_total_cost)
            ON CONFLICT (user_id, usage_date) DO UPDATE SET
                estimated_cost = public.user_usage_daily.estimated_cost + EXCLUDED.estimated_cost,
                updated_at = NOW();
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- ============================================================================
-- END PATCH
-- ============================================================================
