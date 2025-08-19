-- Web Search Annotations & Cost Patch (idempotent)
-- Context: Enable storing OpenRouter web search usage and URL citations.
-- Safe to run multiple times.

BEGIN;

-- 1) chat_messages: has_websearch flag and websearch_result_count
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'has_websearch'
    ) THEN
        ALTER TABLE public.chat_messages
            ADD COLUMN has_websearch BOOLEAN NOT NULL DEFAULT false;
        -- Optional narrow index for true values
        CREATE INDEX IF NOT EXISTS idx_chat_messages_has_websearch_true
            ON public.chat_messages(has_websearch)
            WHERE has_websearch = true;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'websearch_result_count'
    ) THEN
        ALTER TABLE public.chat_messages
            ADD COLUMN websearch_result_count INTEGER NOT NULL DEFAULT 0 CHECK (websearch_result_count >= 0 AND websearch_result_count <= 50);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_websearch_count
            ON public.chat_messages(websearch_result_count);
    END IF;
END $$;

-- 2) message_token_costs: add websearch_cost and pricing_source enrichment
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'message_token_costs' AND column_name = 'websearch_cost'
    ) THEN
        ALTER TABLE public.message_token_costs
            ADD COLUMN websearch_cost DECIMAL(12,6);
        -- total_cost remains a simple column; recompute handled in existing path
        CREATE INDEX IF NOT EXISTS idx_message_token_costs_websearch_cost
            ON public.message_token_costs(websearch_cost);
    END IF;
END $$;

-- 3) chat_message_annotations: normalized storage of url_citations
CREATE TABLE IF NOT EXISTS public.chat_message_annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL, -- denormalized for resilience
    message_id TEXT NOT NULL, -- assistant message id
    annotation_type TEXT NOT NULL CHECK (annotation_type IN ('url_citation')),
    url TEXT NOT NULL,
    title TEXT,
    content TEXT,
    start_index INTEGER,
    end_index INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Basic sanity checks
    CHECK ((start_index IS NULL AND end_index IS NULL) OR (start_index >= 0 AND end_index >= start_index))
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_msg_annotations_message ON public.chat_message_annotations(message_id);
CREATE INDEX IF NOT EXISTS idx_msg_annotations_user_time ON public.chat_message_annotations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_annotations_session ON public.chat_message_annotations(session_id);

-- 4) RLS policies for chat_message_annotations
DO $$
BEGIN
    -- Enable RLS if table exists
    PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'chat_message_annotations';
    IF FOUND THEN
        EXECUTE 'ALTER TABLE public.chat_message_annotations ENABLE ROW LEVEL SECURITY';

        -- SELECT own
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_message_annotations' AND policyname = 'Users can view their own message annotations'
        ) THEN
            EXECUTE 'CREATE POLICY "Users can view their own message annotations" ON public.chat_message_annotations FOR SELECT USING (auth.uid() = user_id)';
        END IF;

        -- INSERT own
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_message_annotations' AND policyname = 'Users can insert their own message annotations'
        ) THEN
            EXECUTE 'CREATE POLICY "Users can insert their own message annotations" ON public.chat_message_annotations FOR INSERT WITH CHECK (auth.uid() = user_id)';
        END IF;

        -- DELETE own
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'chat_message_annotations' AND policyname = 'Users can delete their own message annotations'
        ) THEN
            EXECUTE 'CREATE POLICY "Users can delete their own message annotations" ON public.chat_message_annotations FOR DELETE USING (auth.uid() = user_id)';
        END IF;
    END IF;
END $$;

-- 5) Extend existing recompute function to include web search cost
-- Note: This intentionally mirrors the structure in schema/02-chat.sql with additive websearch logic
CREATE OR REPLACE FUNCTION public.recompute_image_cost_for_user_message(p_user_message_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_assistant_id TEXT;
    v_session_id TEXT;
    v_user_id UUID;
    v_model VARCHAR(100);
    v_message_timestamp TIMESTAMPTZ;
    v_elapsed_ms INTEGER;
    v_prompt_tokens INTEGER := 0;
    v_completion_tokens INTEGER := 0;
    v_completion_id VARCHAR(255);
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
    -- Web search additions
    v_has_websearch BOOLEAN := false;
    v_websearch_results INTEGER := 0;
    v_websearch_price DECIMAL(12,8) := 0;
    v_websearch_cost DECIMAL(12,6) := 0;
BEGIN
    -- Find the assistant message that references this user message
        SELECT m2.id, m2.session_id, s.user_id, m2.model, m2.message_timestamp, m2.elapsed_ms,
                     COALESCE(m2.input_tokens,0), COALESCE(m2.output_tokens,0),
                     m2.completion_id,
           COALESCE(m2.has_websearch,false), COALESCE(m2.websearch_result_count,0)
    INTO v_assistant_id, v_session_id, v_user_id, v_model, v_message_timestamp, v_elapsed_ms,
                 v_prompt_tokens, v_completion_tokens, v_completion_id,
         v_has_websearch, v_websearch_results
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
        COALESCE(web_search_price, '0'),
        to_jsonb(ma.*)
    INTO v_prompt_price, v_completion_price, v_image_price, v_websearch_price, v_pricing_snapshot
    FROM public.model_access ma
    WHERE ma.model_id = v_model;

    -- Fallback for web search unit price if missing/zero
    v_websearch_price := COALESCE(v_websearch_price, 0);
    IF v_websearch_price = 0 THEN
        v_websearch_price := 0.004; -- $4 per 1000 results
    END IF;

    -- Count linked attachments (cap at 3)
    SELECT LEAST(COALESCE(COUNT(*),0), 3) INTO v_image_units
    FROM public.chat_attachments
    WHERE message_id = p_user_message_id
      AND status = 'ready';

    v_prompt_cost := ROUND( (COALESCE(v_prompt_tokens,0) * COALESCE(v_prompt_price,0))::numeric, 6 );
    v_completion_cost := ROUND( (COALESCE(v_completion_tokens,0) * COALESCE(v_completion_price,0))::numeric, 6 );
    v_image_cost := ROUND( (COALESCE(v_image_units,0) * COALESCE(v_image_price,0))::numeric, 6 );

    IF v_has_websearch THEN
        v_websearch_cost := ROUND( (LEAST(COALESCE(v_websearch_results,0), 50) * COALESCE(v_websearch_price,0))::numeric, 6 );
    ELSE
        v_websearch_cost := 0;
    END IF;

    v_total_cost := COALESCE(v_prompt_cost,0) + COALESCE(v_completion_cost,0) + COALESCE(v_image_cost,0) + COALESCE(v_websearch_cost,0);

    -- Fetch existing total (if any) to compute delta later
    SELECT total_cost INTO v_existing_total
    FROM public.message_token_costs
    WHERE assistant_message_id = v_assistant_id;

    INSERT INTO public.message_token_costs (
        user_id, session_id, assistant_message_id, user_message_id, completion_id,
        model_id, message_timestamp, prompt_tokens, completion_tokens, elapsed_ms,
        prompt_unit_price, completion_unit_price, image_units, image_unit_price,
        prompt_cost, completion_cost, image_cost, websearch_cost, total_cost, pricing_source
    ) VALUES (
    v_user_id, v_session_id, v_assistant_id, p_user_message_id, v_completion_id,
        v_model, v_message_timestamp, v_prompt_tokens, v_completion_tokens, COALESCE(v_elapsed_ms,0),
        v_prompt_price, v_completion_price, v_image_units, v_image_price,
        v_prompt_cost, v_completion_cost, v_image_cost, v_websearch_cost, v_total_cost,
        jsonb_build_object(
            'model_id', v_model,
            'pricing_basis', 'per_token_plus_image_plus_websearch',
            'prompt_price', v_prompt_price,
            'completion_price', v_completion_price,
            'image_price', v_image_price,
            'image_units', v_image_units,
            'image_unit_basis', 'per_image',
            'web_search_price', v_websearch_price,
            'websearch_results', v_websearch_results,
            'websearch_unit_basis', 'per_result'
        )
    ) ON CONFLICT (assistant_message_id) DO UPDATE SET
        image_units = EXCLUDED.image_units,
        image_unit_price = EXCLUDED.image_unit_price,
        image_cost = EXCLUDED.image_cost,
        websearch_cost = EXCLUDED.websearch_cost,
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
$$;

COMMIT;
