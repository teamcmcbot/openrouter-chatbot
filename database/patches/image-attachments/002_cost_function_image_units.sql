-- Patch: Image cost recompute support
-- Scope: Keep calculate_and_record_message_cost() identical to base schema (per-token only).
--        Image units/costs are handled by recompute_image_cost_for_user_message() + trigger.

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

-- Recompute helper: when attachments link after assistant insert
-- Idempotent upsert into message_token_costs updating image units/costs
BEGIN;

CREATE OR REPLACE FUNCTION public.recompute_image_cost_for_user_message(p_user_message_id TEXT)
RETURNS VOID AS $$
DECLARE
    v_assistant_id TEXT;
    v_session_id TEXT;
    v_user_id UUID;
    v_model VARCHAR(100);
    v_message_timestamp TIMESTAMPTZ;
    v_elapsed_ms INTEGER;
    v_prompt_tokens INTEGER := 0;
    v_completion_tokens INTEGER := 0;
    v_prompt_price DECIMAL(12,8) := 0;
    v_completion_price DECIMAL(12,8) := 0;
    v_image_price DECIMAL(12,8) := 0;
    v_image_units INTEGER := 0;
    v_prompt_cost DECIMAL(12,6) := 0;
    v_completion_cost DECIMAL(12,6) := 0;
    v_image_cost DECIMAL(12,6) := 0;
    v_total_cost DECIMAL(12,6) := 0;
    v_pricing_snapshot JSONB := '{}'::jsonb;
    v_existing_total DECIMAL(12,6) := 0;
    v_delta DECIMAL(12,6) := 0;
BEGIN
    -- Find the assistant message that references this user message
    SELECT m2.id, m2.session_id, s.user_id, m2.model, m2.message_timestamp, m2.elapsed_ms,
           COALESCE(m2.input_tokens,0), COALESCE(m2.output_tokens,0)
    INTO v_assistant_id, v_session_id, v_user_id, v_model, v_message_timestamp, v_elapsed_ms,
         v_prompt_tokens, v_completion_tokens
    FROM public.chat_messages m2
    JOIN public.chat_sessions s ON s.id = m2.session_id
    WHERE m2.user_message_id = p_user_message_id
      AND m2.role = 'assistant'
      AND (m2.error_message IS NULL OR m2.error_message = '')
    ORDER BY m2.message_timestamp DESC
    LIMIT 1;

    IF v_assistant_id IS NULL THEN
        RETURN; -- Nothing to do yet
    END IF;

    -- Pricing snapshot
    SELECT 
        COALESCE(prompt_price, '0'),
        COALESCE(completion_price, '0'),
        COALESCE(image_price, '0'),
        to_jsonb(ma.*)
    INTO v_prompt_price, v_completion_price, v_image_price, v_pricing_snapshot
    FROM public.model_access ma
    WHERE ma.model_id = v_model;

    -- Count linked attachments (cap at 3)
    SELECT LEAST(COALESCE(COUNT(*),0), 3) INTO v_image_units
    FROM public.chat_attachments
    WHERE message_id = p_user_message_id
      AND status = 'ready';

    v_prompt_cost := ROUND( (COALESCE(v_prompt_tokens,0) * COALESCE(v_prompt_price,0))::numeric, 6 );
    v_completion_cost := ROUND( (COALESCE(v_completion_tokens,0) * COALESCE(v_completion_price,0))::numeric, 6 );
    v_image_cost := ROUND( (COALESCE(v_image_units,0) * COALESCE(v_image_price,0))::numeric, 6 );
    v_total_cost := COALESCE(v_prompt_cost,0) + COALESCE(v_completion_cost,0) + COALESCE(v_image_cost,0);

    -- Fetch existing total (if any) to compute delta later
    SELECT total_cost INTO v_existing_total
    FROM public.message_token_costs
    WHERE assistant_message_id = v_assistant_id;

    INSERT INTO public.message_token_costs (
        user_id, session_id, assistant_message_id, user_message_id, completion_id,
        model_id, message_timestamp, prompt_tokens, completion_tokens, elapsed_ms,
        prompt_unit_price, completion_unit_price, image_units, image_unit_price,
        prompt_cost, completion_cost, image_cost, total_cost, pricing_source
    ) VALUES (
        v_user_id, v_session_id, v_assistant_id, p_user_message_id, NULL,
        v_model, v_message_timestamp, v_prompt_tokens, v_completion_tokens, COALESCE(v_elapsed_ms,0),
        v_prompt_price, v_completion_price, v_image_units, v_image_price,
        v_prompt_cost, v_completion_cost, v_image_cost, v_total_cost,
        jsonb_build_object(
            'model_id', v_model,
            'pricing_basis', 'per_token_plus_image',
            'prompt_price', v_prompt_price,
            'completion_price', v_completion_price,
            'image_price', v_image_price,
            'image_units', v_image_units,
            'image_unit_basis', 'per_image'
        )
    ) ON CONFLICT (assistant_message_id) DO UPDATE SET
        image_units = EXCLUDED.image_units,
        image_unit_price = EXCLUDED.image_unit_price,
        image_cost = EXCLUDED.image_cost,
        total_cost = EXCLUDED.total_cost,
        pricing_source = EXCLUDED.pricing_source;

    -- Maintain daily estimated cost by delta to avoid double-counting
    v_delta := COALESCE(v_total_cost,0) - COALESCE(v_existing_total,0);

    IF v_delta <> 0 THEN
        UPDATE public.user_usage_daily
        SET estimated_cost = COALESCE(estimated_cost,0) + v_delta,
            updated_at = NOW()
        WHERE user_id = v_user_id AND usage_date = CURRENT_DATE;

        IF NOT FOUND THEN
            INSERT INTO public.user_usage_daily (user_id, usage_date, estimated_cost)
            VALUES (v_user_id, CURRENT_DATE, v_delta)
            ON CONFLICT (user_id, usage_date) DO UPDATE SET
                estimated_cost = public.user_usage_daily.estimated_cost + EXCLUDED.estimated_cost,
                updated_at = NOW();
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger: when an attachment is linked to a message, recompute costs
CREATE OR REPLACE FUNCTION public.on_chat_attachment_link_recompute()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.message_id IS NOT NULL
       AND (OLD.message_id IS NULL OR NEW.message_id <> OLD.message_id)
       AND NEW.status = 'ready' THEN
        PERFORM public.recompute_image_cost_for_user_message(NEW.message_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_attachment_link_recompute_cost ON public.chat_attachments;
CREATE TRIGGER after_attachment_link_recompute_cost
    AFTER UPDATE OF message_id ON public.chat_attachments
    FOR EACH ROW
    EXECUTE FUNCTION public.on_chat_attachment_link_recompute();

COMMIT;
