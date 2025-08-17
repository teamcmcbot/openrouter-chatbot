-- Patch: Include image units and costs in message cost calculation
-- Scope: calculate_and_record_message_cost() now derives image_units from linked chat_attachments
-- Notes:
--  - image_units = COUNT(attachments with status='ready' linked to triggering user_message_id)
--  - image_unit_price pulled from model_access.image_price (treated as per-image unit)
--  - image_cost = image_units * image_unit_price
--  - pricing_source gains image metadata for auditing

BEGIN;

CREATE OR REPLACE FUNCTION public.calculate_and_record_message_cost()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_prompt_price DECIMAL(12,8) := 0; -- per token
    v_completion_price DECIMAL(12,8) := 0; -- per token
    v_image_price DECIMAL(12,8) := 0; -- per image unit
    v_prompt_cost DECIMAL(12,6) := 0;
    v_completion_cost DECIMAL(12,6) := 0;
    v_image_cost DECIMAL(12,6) := 0;
    v_total_cost DECIMAL(12,6) := 0;
    v_pricing_snapshot JSONB := '{}'::jsonb;
    v_image_units INTEGER := 0;
BEGIN
    -- Only compute for successful assistant messages
    IF NEW.role <> 'assistant' THEN
        RETURN NEW;
    END IF;
    IF NEW.error_message IS NOT NULL AND NEW.error_message <> '' THEN
        RETURN NEW;
    END IF;

    -- Resolve user
    SELECT user_id INTO v_user_id FROM public.chat_sessions WHERE id = NEW.session_id;
    IF v_user_id IS NULL THEN
        RAISE NOTICE 'calculate_and_record_message_cost: session % not found', NEW.session_id;
        RETURN NEW;
    END IF;

    -- Pricing snapshot
    SELECT 
        COALESCE(prompt_price, '0'),
        COALESCE(completion_price, '0'),
        COALESCE(image_price, '0'),
        to_jsonb(ma.*)
    INTO v_prompt_price, v_completion_price, v_image_price, v_pricing_snapshot
    FROM public.model_access ma
    WHERE ma.model_id = NEW.model;

    -- Token-based costs
    v_prompt_cost := ROUND( (COALESCE(NEW.input_tokens,0) * COALESCE(v_prompt_price,0))::numeric, 6 );
    v_completion_cost := ROUND( (COALESCE(NEW.output_tokens,0) * COALESCE(v_completion_price,0))::numeric, 6 );

    -- Image-based costs: derive from triggering user message's attachments
    IF NEW.user_message_id IS NOT NULL THEN
        SELECT COALESCE(COUNT(*), 0) INTO v_image_units
        FROM public.chat_attachments
        WHERE message_id = NEW.user_message_id
          AND status = 'ready';
    ELSE
        v_image_units := 0;
    END IF;

    -- Enforce safety cap in calculation layer too
    IF v_image_units > 3 THEN
        v_image_units := 3;
    END IF;

    v_image_cost := ROUND( (COALESCE(v_image_units,0) * COALESCE(v_image_price,0))::numeric, 6 );
    v_total_cost := COALESCE(v_prompt_cost,0) + COALESCE(v_completion_cost,0) + COALESCE(v_image_cost,0);

    INSERT INTO public.message_token_costs (
        user_id, session_id, assistant_message_id, user_message_id, completion_id,
        model_id, message_timestamp, prompt_tokens, completion_tokens, elapsed_ms,
        prompt_unit_price, completion_unit_price, image_units, image_unit_price,
        prompt_cost, completion_cost, image_cost, total_cost, pricing_source
    ) VALUES (
        v_user_id, NEW.session_id, NEW.id, NEW.user_message_id, NEW.completion_id,
        NEW.model, NEW.message_timestamp, COALESCE(NEW.input_tokens,0), COALESCE(NEW.output_tokens,0), COALESCE(NEW.elapsed_ms,0),
        v_prompt_price, v_completion_price, v_image_units, v_image_price,
        v_prompt_cost, v_completion_cost, v_image_cost, v_total_cost,
        jsonb_build_object(
            'model_id', NEW.model,
            'pricing_basis', 'per_token_plus_image',
            'prompt_price', v_prompt_price,
            'completion_price', v_completion_price,
            'image_price', v_image_price,
            'image_units', v_image_units,
            'image_unit_basis', 'per_image',
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
