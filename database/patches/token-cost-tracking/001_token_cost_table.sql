-- Patch: Token Cost Tracking (Forward-only, no backfill)
-- Date: 2025-08-12
-- Description: Adds message_token_costs table, cost calculation function, trigger, aggregated daily view.

-- Safety: Wrap in transaction (Supabase migration runner typically does this automatically).
-- Idempotency: Create IF NOT EXISTS where possible; function recreated with OR REPLACE.

-- 1. Table --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_token_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    assistant_message_id TEXT NOT NULL UNIQUE REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    user_message_id TEXT NULL,
    completion_id VARCHAR(255),
    model_id VARCHAR(100),
    message_timestamp TIMESTAMPTZ NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    -- Generated total_tokens (fallback manual if extension forbids)
    total_tokens INTEGER GENERATED ALWAYS AS (prompt_tokens + completion_tokens) STORED,
    prompt_unit_price DECIMAL(12,8), -- per million tokens
    completion_unit_price DECIMAL(12,8), -- per million tokens
    image_units INTEGER NOT NULL DEFAULT 0,
    image_unit_price DECIMAL(12,8), -- per thousand units (future)
    prompt_cost DECIMAL(12,6),
    completion_cost DECIMAL(12,6),
    image_cost DECIMAL(12,6),
    total_cost DECIMAL(12,6),
    pricing_source JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_message_token_costs_user_time ON public.message_token_costs(user_id, message_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_message_token_costs_session_time ON public.message_token_costs(session_id, message_timestamp);
CREATE INDEX IF NOT EXISTS idx_message_token_costs_model ON public.message_token_costs(model_id);

-- RLS -------------------------------------------------------------------------
ALTER TABLE public.message_token_costs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename='message_token_costs' AND policyname='Users can view their own message costs'
    ) THEN
        CREATE POLICY "Users can view their own message costs" ON public.message_token_costs
            FOR SELECT USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename='message_token_costs' AND policyname='Admins can view all message costs'
    ) THEN
        CREATE POLICY "Admins can view all message costs" ON public.message_token_costs
            FOR SELECT USING (public.is_admin(auth.uid()));
    END IF;
    -- No insert/update/delete from clients; only via server-side function (SECURITY DEFINER not needed here yet)
END $$;

-- 2. Function -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_and_record_message_cost()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_prompt_price DECIMAL(12,8) := 0; -- per million
    v_completion_price DECIMAL(12,8) := 0; -- per million
    v_image_price DECIMAL(12,8) := 0; -- per thousand (future)
    v_prompt_cost DECIMAL(12,6) := 0;
    v_completion_cost DECIMAL(12,6) := 0;
    v_image_cost DECIMAL(12,6) := 0;
    v_total_cost DECIMAL(12,6) := 0;
    v_pricing_snapshot JSONB := '{}'::jsonb;
BEGIN
    -- Guard: only assistant & success
    IF NEW.role <> 'assistant' THEN
        RETURN NEW; -- ignore
    END IF;
    IF NEW.error_message IS NOT NULL AND NEW.error_message <> '' THEN
        RETURN NEW; -- ignore failed messages
    END IF;

    -- Resolve user_id
    SELECT user_id INTO v_user_id FROM public.chat_sessions WHERE id = NEW.session_id;
    IF v_user_id IS NULL THEN
        RAISE NOTICE 'calculate_and_record_message_cost: session % not found', NEW.session_id;
        RETURN NEW;
    END IF;

    -- Pricing lookup
    SELECT 
        COALESCE(prompt_price, '0'),
        COALESCE(completion_price, '0'),
        COALESCE(image_price, '0'),
        to_jsonb(ma.*)
    INTO v_prompt_price, v_completion_price, v_image_price, v_pricing_snapshot
    FROM public.model_access ma
    WHERE ma.model_id = NEW.model;

    -- Convert string text to numeric (values already cast via select into DECIMAL if possible)
    -- Compute costs (per million for tokens, per thousand for images)
    v_prompt_cost := ROUND( ((COALESCE(NEW.input_tokens,0) * COALESCE(v_prompt_price,0)) / 1000000)::numeric, 6 );
    v_completion_cost := ROUND( ((COALESCE(NEW.output_tokens,0) * COALESCE(v_completion_price,0)) / 1000000)::numeric, 6 );
    v_image_cost := ROUND( ((0 * COALESCE(v_image_price,0)) / 1000)::numeric, 6 ); -- placeholder image_units=0
    v_total_cost := COALESCE(v_prompt_cost,0) + COALESCE(v_completion_cost,0) + COALESCE(v_image_cost,0);

    -- Insert cost row if not exists
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
            'pricing_basis', 'per_million_tokens',
            'prompt_price', v_prompt_price,
            'completion_price', v_completion_price,
            'image_price', v_image_price,
            'source_row', v_pricing_snapshot->>'id'
        )
    ) ON CONFLICT (assistant_message_id) DO NOTHING;

    -- Update daily estimated cost only if we actually inserted (check existence)
    IF EXISTS (SELECT 1 FROM public.message_token_costs WHERE assistant_message_id = NEW.id) THEN
        -- Increment user_usage_daily.estimated_cost
        UPDATE public.user_usage_daily
        SET estimated_cost = COALESCE(estimated_cost,0) + v_total_cost,
            updated_at = NOW()
        WHERE user_id = v_user_id AND usage_date = CURRENT_DATE;

        IF NOT FOUND THEN
            -- create row if missing
            INSERT INTO public.user_usage_daily (
                user_id, usage_date, estimated_cost
            ) VALUES (v_user_id, CURRENT_DATE, v_total_cost)
            ON CONFLICT (user_id, usage_date) DO UPDATE SET
                estimated_cost = public.user_usage_daily.estimated_cost + EXCLUDED.estimated_cost,
                updated_at = NOW();
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger ------------------------------------------------------------------
DROP TRIGGER IF EXISTS after_assistant_message_cost ON public.chat_messages;
CREATE TRIGGER after_assistant_message_cost
    AFTER INSERT ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.calculate_and_record_message_cost();

-- 4. Per-Model Daily View (user scoped via RLS) --------------------------------
-- Provides per-user, per-day, per-model cost & token aggregates; underlying RLS
-- ensures a normal user only sees their own rows. Admins (is_admin) can see
-- all rows due to policy on base table.
CREATE OR REPLACE VIEW public.user_model_costs_daily AS
SELECT
    user_id,
    (message_timestamp AT TIME ZONE 'UTC')::date AS usage_date,
    model_id,
    SUM(prompt_tokens) AS prompt_tokens,
    SUM(completion_tokens) AS completion_tokens,
    SUM(total_tokens) AS total_tokens,
    ROUND(SUM(total_cost), 6) AS total_cost,
    COUNT(*) AS assistant_messages
FROM public.message_token_costs
GROUP BY user_id, (message_timestamp AT TIME ZONE 'UTC')::date, model_id;

-- 5. Admin Aggregation Function (global) --------------------------------------
-- Returns model usage aggregated by day/week/month across all users. SECURITY
-- DEFINER bypasses RLS; explicit admin check enforced.
CREATE OR REPLACE FUNCTION public.get_global_model_costs(
    p_start_date DATE,
    p_end_date DATE,
    p_granularity TEXT DEFAULT 'day'
)
RETURNS TABLE (
    usage_period DATE,
    model_id VARCHAR(100),
    prompt_tokens BIGINT,
    completion_tokens BIGINT,
    total_tokens BIGINT,
    total_cost DECIMAL(18,6),
    assistant_messages BIGINT,
    distinct_users BIGINT
) AS $$
DECLARE
    v_trunc TEXT := 'day';
BEGIN
    -- Validate granularity
    IF lower(p_granularity) IN ('day','week','month') THEN
        v_trunc := lower(p_granularity);
    END IF;

    -- Admin check
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Insufficient privileges';
    END IF;

    RETURN QUERY
    SELECT
        (date_trunc(v_trunc, message_timestamp))::date AS usage_period,
        model_id,
        SUM(prompt_tokens) AS prompt_tokens,
        SUM(completion_tokens) AS completion_tokens,
        SUM(total_tokens) AS total_tokens,
        ROUND(SUM(total_cost),6) AS total_cost,
        COUNT(*) AS assistant_messages,
        COUNT(DISTINCT user_id) AS distinct_users
    FROM public.message_token_costs
    WHERE message_timestamp >= p_start_date
      AND message_timestamp < (p_end_date + 1)
    GROUP BY 1, 2
    ORDER BY usage_period ASC, total_cost DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_global_model_costs IS 'Admin-only: aggregate model costs by chosen granularity (day/week/month) between dates inclusive.';

-- Grants (optional) -----------------------------------------------------------
-- (RLS on base table governs; view inherits policies but can add explicit if needed.)

-- End of patch ----------------------------------------------------------------
