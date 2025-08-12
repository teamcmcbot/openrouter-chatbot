-- Patch: Adjust cost calculation to treat stored pricing as per-token (not per-million)
-- Date: 2025-08-12
-- Reason: Observed unit prices like 0.00000005 (5e-8) producing zero after per-million division; implies stored values already divided by 1,000,000.
-- Action: Recompute cost formula without /1_000_000; update existing zero-cost rows; adjust daily estimated_cost deltas.

BEGIN;

-- 1. Capture deltas for rows needing recalculation (total_cost currently zero but tokens & prices > 0)
WITH delta AS (
    SELECT user_id,
           (message_timestamp AT TIME ZONE 'UTC')::date AS usage_date,
           SUM(ROUND(prompt_tokens * prompt_unit_price + completion_tokens * completion_unit_price,6)) AS add_cost
    FROM public.message_token_costs
    WHERE total_cost = 0
      AND (prompt_tokens > 0 OR completion_tokens > 0)
      AND (COALESCE(prompt_unit_price,0) > 0 OR COALESCE(completion_unit_price,0) > 0)
    GROUP BY 1,2
), upsert_usage AS (
    -- Insert missing daily rows first
    INSERT INTO public.user_usage_daily (user_id, usage_date, estimated_cost)
    SELECT d.user_id, d.usage_date, d.add_cost
    FROM delta d
    WHERE NOT EXISTS (
        SELECT 1 FROM public.user_usage_daily u
        WHERE u.user_id = d.user_id AND u.usage_date = d.usage_date
    ) RETURNING user_id, usage_date
)
UPDATE public.user_usage_daily u
SET estimated_cost = u.estimated_cost + d.add_cost,
    updated_at = NOW()
FROM delta d
WHERE u.user_id = d.user_id AND u.usage_date = d.usage_date;

-- 2. Update zero-cost rows with new per-token calculation
UPDATE public.message_token_costs
SET prompt_cost = ROUND(prompt_tokens * prompt_unit_price,6),
    completion_cost = ROUND(completion_tokens * completion_unit_price,6),
    image_cost = COALESCE(image_cost,0),
    total_cost = ROUND(prompt_tokens * prompt_unit_price + completion_tokens * completion_unit_price + COALESCE(image_cost,0),6),
    pricing_source = pricing_source || jsonb_build_object('recalculated', true, 'new_pricing_basis', 'per_token')
WHERE total_cost = 0
  AND (prompt_tokens > 0 OR completion_tokens > 0)
  AND (COALESCE(prompt_unit_price,0) > 0 OR COALESCE(completion_unit_price,0) > 0);

-- 3. Replace function with per-token logic going forward
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
        RETURN NEW;
    END IF;
    IF NEW.error_message IS NOT NULL AND NEW.error_message <> '' THEN
        RETURN NEW;
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
    v_image_cost := 0; -- placeholder
    v_total_cost := COALESCE(v_prompt_cost,0) + COALESCE(v_completion_cost,0) + COALESCE(v_image_cost,0);

    INSERT INTO public.message_token_costs (
        user_id, session_id, assistant_message_id, user_message_id, completion_id,
        model_id, message_timestamp, prompt_tokens, completion_tokens,
        prompt_unit_price, completion_unit_price, image_units, image_unit_price,
        prompt_cost, completion_cost, image_cost, total_cost, pricing_source
    ) VALUES (
        v_user_id, NEW.session_id, NEW.id, NEW.user_message_id, NEW.completion_id,
        NEW.model, NEW.message_timestamp, COALESCE(NEW.input_tokens,0), COALESCE(NEW.output_tokens,0),
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
