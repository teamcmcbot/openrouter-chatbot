-- 005-unify-recompute.sql (CONSOLIDATED)
-- Purpose: Single authoritative migration for output image pricing & unified recompute logic.
-- This file MERGES and REPLACES the prior incremental patches:
--   001-add-output-image-cost.sql
--   002-stub-recompute-output-image.sql
--   003-implement-output-image-recompute.sql
--   004-update-triggers-output-image.sql
-- AND the earlier draft of 005 itself.
-- After adopting this file you may delete 001–004 (and any earlier 005 draft) safely.
-- All operations are idempotent (IF NOT EXISTS / DROP IF EXISTS) so re-running is safe.
-- Summary of outcomes:
--   * model_access: add output_image_price (string) & drop legacy output_image_cost if present.
--   * chat_attachments: add metadata jsonb for source tagging (assistant vs user, etc.).
--   * message_token_costs: add output_image_tokens, output_image_units, output_image_cost.
--   * chat_messages: add output_image_tokens (raw assistant token count for output images).
--   * Remove obsolete recompute_output_image_cost_for_assistant_message function.
--   * Provide unified recompute_image_cost_for_user_message handling input & output images + websearch.
--   * Replace / simplify triggers to call only unified function on assistant insert & attachment link.
--   * Delta-based daily usage accounting preserved.

BEGIN;

-- 1) Pricing column on model_access (string to match existing pattern) & cleanup legacy name
ALTER TABLE public.model_access
    ADD COLUMN IF NOT EXISTS output_image_price VARCHAR(20) DEFAULT '0';
ALTER TABLE public.model_access
    DROP COLUMN IF EXISTS output_image_cost; -- old experimental column name

-- 2) chat_attachments metadata (source tagging & future extensibility)
ALTER TABLE public.chat_attachments
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 3) message_token_costs output image and token tracking
ALTER TABLE public.message_token_costs
    ADD COLUMN IF NOT EXISTS output_image_tokens INTEGER DEFAULT 0;
ALTER TABLE public.message_token_costs
    ADD COLUMN IF NOT EXISTS output_image_units INTEGER DEFAULT 0;
ALTER TABLE public.message_token_costs
    ADD COLUMN IF NOT EXISTS output_image_cost DECIMAL(12,6) DEFAULT 0;

-- 4) chat_messages raw output image token persistence
ALTER TABLE public.chat_messages
    ADD COLUMN IF NOT EXISTS output_image_tokens INTEGER DEFAULT 0;

-- 5) Remove obsolete interim function (stub & implemented variants) if present
DROP FUNCTION IF EXISTS public.recompute_output_image_cost_for_assistant_message(TEXT);

-- 6) Unified recompute logic
-- NOTE: Parameter name kept as p_user_message_id to avoid Postgres error when replacing
-- an existing function that originally used this argument name.
CREATE OR REPLACE FUNCTION public.recompute_image_cost_for_user_message(
    p_user_message_id TEXT -- Can be a user_message_id (legacy path) OR an assistant message id
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_msg_id TEXT := NULL;          -- Actual user message id (if present)
    v_assistant_id TEXT := NULL;         -- Assistant message id
    v_session_id TEXT;
    v_user_id UUID;
    v_model VARCHAR(100);
    v_message_timestamp TIMESTAMPTZ;
    v_elapsed_ms INTEGER;
    v_prompt_tokens INTEGER := 0;
    v_completion_tokens INTEGER := 0;
    v_output_image_tokens INTEGER := 0;  -- From assistant row
    v_text_completion_tokens INTEGER := 0;
    v_completion_id VARCHAR(255);
    v_has_websearch BOOLEAN := false;
    v_websearch_results INTEGER := 0;

    -- Pricing
    v_prompt_price DECIMAL(12,8) := 0;
    v_completion_price DECIMAL(12,8) := 0;
    v_input_image_price DECIMAL(12,8) := 0; -- existing input image unit pricing
    v_output_image_price DECIMAL(12,8) := 0; -- new output image pricing
    v_websearch_price DECIMAL(12,8) := 0;

    -- Units (counts)
    v_input_image_units INTEGER := 0;    -- attachments on user message (cap 3)
    v_output_image_units INTEGER := 0;   -- assistant-generated image count (no cap)

    -- Costs
    v_prompt_cost DECIMAL(12,6) := 0;
    v_text_completion_cost DECIMAL(12,6) := 0;
    v_input_image_cost DECIMAL(12,6) := 0;
    v_output_image_cost DECIMAL(12,6) := 0;
    v_websearch_cost DECIMAL(12,6) := 0;
    v_total_cost DECIMAL(12,6) := 0;

    v_existing_total DECIMAL(12,6) := 0;
    v_delta DECIMAL(12,6) := 0;
BEGIN
    -- Resolve assistant message + user message using flexible parameter
    -- First try treating input as user_message_id
    SELECT m2.id, m2.user_message_id, m2.session_id, s.user_id, m2.model, m2.message_timestamp, m2.elapsed_ms,
           COALESCE(m2.input_tokens,0), COALESCE(m2.output_tokens,0), m2.completion_id,
           COALESCE(m2.has_websearch,false), COALESCE(m2.websearch_result_count,0),
           COALESCE(m2.output_image_tokens,0)
    INTO v_assistant_id, v_user_msg_id, v_session_id, v_user_id, v_model, v_message_timestamp, v_elapsed_ms,
         v_prompt_tokens, v_completion_tokens, v_completion_id,
         v_has_websearch, v_websearch_results, v_output_image_tokens
    FROM public.chat_messages m2
    JOIN public.chat_sessions s ON s.id = m2.session_id
    WHERE (
            m2.user_message_id = p_user_message_id -- legacy path (given user msg id)
            OR m2.id = p_user_message_id           -- direct assistant id path
          )
      AND m2.role = 'assistant'
      AND (m2.error_message IS NULL OR m2.error_message = '')
    ORDER BY m2.message_timestamp DESC
    LIMIT 1;

    IF v_assistant_id IS NULL THEN
        RETURN; -- nothing to do yet
    END IF;

    -- If parameter WAS the assistant id, ensure v_user_msg_id holds original user message id
    IF p_user_message_id = v_assistant_id THEN
        -- already correct (v_user_msg_id may be null if system-created assistant message)
    ELSE
        -- p_message_id was user message id; v_user_msg_id already assigned through select
    END IF;

    -- Pricing snapshot
    SELECT 
        COALESCE(prompt_price,'0'),
        COALESCE(completion_price,'0'),
        COALESCE(image_price,'0'),
        COALESCE(output_image_price,'0'),
        COALESCE(web_search_price,'0')
    INTO v_prompt_price, v_completion_price, v_input_image_price, v_output_image_price, v_websearch_price
    FROM public.model_access
    WHERE model_id = v_model;

    -- Fallback for known model override
    IF (v_output_image_price = 0 OR v_output_image_price IS NULL) AND v_model = 'google/gemini-2.5-flash-image-preview' THEN
        v_output_image_price := 0.00003; -- override until model sync includes it
    END IF;

    -- Web search fallback price
    v_websearch_price := COALESCE(v_websearch_price,0);
    IF v_websearch_price = 0 THEN
        v_websearch_price := 0.004; -- default per result pricing baseline
    END IF;

    -- Input images (user message attachments, cap 3)
    IF v_user_msg_id IS NOT NULL THEN
        SELECT LEAST(COALESCE(COUNT(*),0), 3)
        INTO v_input_image_units
        FROM public.chat_attachments
        WHERE message_id = v_user_msg_id
          AND status = 'ready';
    END IF;

    -- Output images (assistant attachments, no cap) – rely on metadata.source when present
    SELECT COALESCE(COUNT(*),0)
    INTO v_output_image_units
    FROM public.chat_attachments
    WHERE message_id = v_assistant_id
      AND status = 'ready'
      AND ( (metadata ? 'source') IS FALSE OR (metadata ->> 'source') = 'assistant');

    -- If we have image tokens column but zero tokens & attachments present, infer 1:1 (temporary heuristic)
    IF v_output_image_tokens = 0 AND v_output_image_units > 0 THEN
        v_output_image_tokens := v_output_image_units;
    END IF;

    v_text_completion_tokens := GREATEST(v_completion_tokens - v_output_image_tokens, 0);

    -- Cost components
    v_prompt_cost := ROUND( (v_prompt_tokens * v_prompt_price)::numeric, 6 );
    v_text_completion_cost := ROUND( (v_text_completion_tokens * v_completion_price)::numeric, 6 );
    v_input_image_cost := ROUND( (v_input_image_units * v_input_image_price)::numeric, 6 );
    v_output_image_cost := ROUND( (v_output_image_units * v_output_image_price)::numeric, 6 );

    IF v_has_websearch THEN
        v_websearch_cost := ROUND( (LEAST(COALESCE(v_websearch_results,0), 50) * v_websearch_price)::numeric, 6 );
    ELSE
        v_websearch_cost := 0;
    END IF;

    v_total_cost := COALESCE(v_prompt_cost,0) + COALESCE(v_text_completion_cost,0) + COALESCE(v_input_image_cost,0) + COALESCE(v_output_image_cost,0) + COALESCE(v_websearch_cost,0);

    SELECT total_cost INTO v_existing_total
    FROM public.message_token_costs
    WHERE assistant_message_id = v_assistant_id;

    INSERT INTO public.message_token_costs (
        user_id, session_id, assistant_message_id, user_message_id, completion_id,
        model_id, message_timestamp, prompt_tokens, completion_tokens, elapsed_ms,
        prompt_unit_price, completion_unit_price, image_units, image_unit_price,
        prompt_cost, completion_cost, image_cost, websearch_cost,
        output_image_tokens, output_image_units, output_image_cost, total_cost, pricing_source
    ) VALUES (
        v_user_id, v_session_id, v_assistant_id, v_user_msg_id, v_completion_id,
        v_model, v_message_timestamp, v_prompt_tokens, v_completion_tokens, COALESCE(v_elapsed_ms,0),
        v_prompt_price, v_completion_price, v_input_image_units, v_input_image_price,
        v_prompt_cost, v_text_completion_cost, v_input_image_cost, v_websearch_cost,
        v_output_image_tokens, v_output_image_units, v_output_image_cost, v_total_cost,
        jsonb_build_object(
            'model_id', v_model,
            'pricing_basis', 'unified_per_token_plus_input_output_images_plus_websearch',
            'prompt_price', v_prompt_price,
            'completion_price', v_completion_price,
            'input_image_price', v_input_image_price,
            'image_units', v_input_image_units,
            'output_image_price', v_output_image_price,
            'output_image_tokens', v_output_image_tokens,
            'output_image_units', v_output_image_units,
            'output_image_basis', 'per_output_token',
            'text_completion_tokens', v_text_completion_tokens,
            'web_search_price', v_websearch_price,
            'websearch_results', v_websearch_results,
            'websearch_unit_basis', 'per_result'
        )
    ) ON CONFLICT (assistant_message_id) DO UPDATE SET
        prompt_tokens = EXCLUDED.prompt_tokens,
        completion_tokens = EXCLUDED.completion_tokens,
        prompt_unit_price = EXCLUDED.prompt_unit_price,
        completion_unit_price = EXCLUDED.completion_unit_price,
        image_units = EXCLUDED.image_units,
        image_unit_price = EXCLUDED.image_unit_price,
        prompt_cost = EXCLUDED.prompt_cost,
        completion_cost = EXCLUDED.completion_cost,
        image_cost = EXCLUDED.image_cost,
        websearch_cost = EXCLUDED.websearch_cost,
        output_image_tokens = EXCLUDED.output_image_tokens,
        output_image_units = EXCLUDED.output_image_units,
        output_image_cost = EXCLUDED.output_image_cost,
        total_cost = EXCLUDED.total_cost,
        pricing_source = EXCLUDED.pricing_source;

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
$$;

-- Simplify triggers: both assistant insert and attachment link now call unified function.

CREATE OR REPLACE FUNCTION public.calculate_and_record_message_cost()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role = 'assistant' AND (NEW.error_message IS NULL OR NEW.error_message = '') THEN
    PERFORM public.recompute_image_cost_for_user_message(NEW.user_message_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS after_assistant_message_cost ON public.chat_messages;
CREATE TRIGGER after_assistant_message_cost
    AFTER INSERT ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.calculate_and_record_message_cost();

CREATE OR REPLACE FUNCTION public.on_chat_attachment_link_recompute()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.message_id IS NOT NULL
       AND (OLD.message_id IS NULL OR NEW.message_id <> OLD.message_id)
       AND NEW.status = 'ready' THEN
        -- Only recompute for user message (input images). Skip assistant output image linking.
        -- This avoids double recompute when assistant images arrive after initial assistant row insert.
        PERFORM 1 FROM public.chat_messages cm WHERE cm.id = NEW.message_id AND cm.role = 'user';
        IF FOUND THEN
            PERFORM public.recompute_image_cost_for_user_message(NEW.message_id);
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_attachment_link_recompute_cost ON public.chat_attachments;
CREATE TRIGGER after_attachment_link_recompute_cost
    AFTER UPDATE OF message_id ON public.chat_attachments
    FOR EACH ROW
    EXECUTE FUNCTION public.on_chat_attachment_link_recompute();

COMMIT;
