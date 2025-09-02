-- Patch: Anonymous usage aggregates (Phase 1)
-- Safe, idempotent: creates table, indexes, RLS, RPC for ingestion, and retention helper.
-- No PII, no user_id linkage in v1.

-- 1) Table
CREATE TABLE IF NOT EXISTS public.anonymous_usage_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anonymous_session_id TEXT NOT NULL,
    usage_date DATE NOT NULL,
    messages_sent INTEGER NOT NULL DEFAULT 0,
    messages_received INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    models_used INTEGER NOT NULL DEFAULT 0,
    generation_ms BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (anonymous_session_id, usage_date)
);

-- 2) Indexes
CREATE INDEX IF NOT EXISTS idx_anonymous_usage_daily_date ON public.anonymous_usage_daily(usage_date DESC);
CREATE INDEX IF NOT EXISTS idx_anonymous_usage_daily_session ON public.anonymous_usage_daily(anonymous_session_id);

-- 2b) Per-model daily aggregates (for cost estimation)
CREATE TABLE IF NOT EXISTS public.anonymous_model_usage_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usage_date DATE NOT NULL,
    model_id VARCHAR(100) NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER GENERATED ALWAYS AS (prompt_tokens + completion_tokens) STORED,
    assistant_messages INTEGER NOT NULL DEFAULT 0,
    generation_ms BIGINT NOT NULL DEFAULT 0,
    prompt_unit_price DECIMAL(12,8),
    completion_unit_price DECIMAL(12,8),
    estimated_cost DECIMAL(12,6) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (usage_date, model_id)
);

CREATE INDEX IF NOT EXISTS idx_anonymous_model_usage_daily_date ON public.anonymous_model_usage_daily(usage_date DESC);
CREATE INDEX IF NOT EXISTS idx_anonymous_model_usage_daily_model ON public.anonymous_model_usage_daily(model_id);

-- 3) RLS policies (admin-only read; insert/update via SECURITY DEFINER RPC only)
ALTER TABLE public.anonymous_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anonymous_usage_daily FORCE ROW LEVEL SECURITY;

ALTER TABLE public.anonymous_model_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anonymous_model_usage_daily FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='public' AND tablename='anonymous_usage_daily' AND policyname='Admins can read anonymous usage'
    ) THEN
        EXECUTE 'DROP POLICY "Admins can read anonymous usage" ON public.anonymous_usage_daily';
    END IF;
    EXECUTE 'CREATE POLICY "Admins can read anonymous usage" ON public.anonymous_usage_daily FOR SELECT USING (public.is_admin(auth.uid()))';

    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='public' AND tablename='anonymous_usage_daily' AND policyname='Deny direct writes'
    ) THEN
        EXECUTE 'DROP POLICY "Deny direct writes" ON public.anonymous_usage_daily';
    END IF;
    EXECUTE 'CREATE POLICY "Deny direct writes" ON public.anonymous_usage_daily FOR INSERT WITH CHECK (false)';
    EXECUTE 'CREATE POLICY "Deny direct updates" ON public.anonymous_usage_daily FOR UPDATE USING (false)';
    EXECUTE 'CREATE POLICY "Deny direct deletes" ON public.anonymous_usage_daily FOR DELETE USING (false)';
END$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='public' AND tablename='anonymous_model_usage_daily' AND policyname='Admins can read anonymous model usage'
    ) THEN
        EXECUTE 'DROP POLICY "Admins can read anonymous model usage" ON public.anonymous_model_usage_daily';
    END IF;
    EXECUTE 'CREATE POLICY "Admins can read anonymous model usage" ON public.anonymous_model_usage_daily FOR SELECT USING (public.is_admin(auth.uid()))';

    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='public' AND tablename='anonymous_model_usage_daily' AND policyname='Deny direct writes'
    ) THEN
        EXECUTE 'DROP POLICY "Deny direct writes" ON public.anonymous_model_usage_daily';
    END IF;
    EXECUTE 'CREATE POLICY "Deny direct writes" ON public.anonymous_model_usage_daily FOR INSERT WITH CHECK (false)';
    EXECUTE 'CREATE POLICY "Deny direct updates" ON public.anonymous_model_usage_daily FOR UPDATE USING (false)';
    EXECUTE 'CREATE POLICY "Deny direct deletes" ON public.anonymous_model_usage_daily FOR DELETE USING (false)';
END$$;

-- 4) Update trigger for updated_at
CREATE OR REPLACE FUNCTION public._set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_anonymous_usage_update ON public.anonymous_usage_daily;
CREATE TRIGGER on_anonymous_usage_update
    BEFORE UPDATE ON public.anonymous_usage_daily
    FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();

DROP TRIGGER IF EXISTS on_anonymous_model_usage_update ON public.anonymous_model_usage_daily;
CREATE TRIGGER on_anonymous_model_usage_update
    BEFORE UPDATE ON public.anonymous_model_usage_daily
    FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();

-- 5) Ingestion function (SECURITY DEFINER)
-- Payload example:
-- {
--   "anonymous_session_id": "uuid-like-text",
--   "events": [
--     { "timestamp": "2025-09-02T12:34:56Z", "type": "message_sent", "input_tokens": 120, "model": "anthropic/claude-3.5" },
--     { "timestamp": "2025-09-02T12:35:12Z", "type": "completion_received", "output_tokens": 256, "elapsed_ms": 1100 }
--   ]
-- }
-- Server reduces to daily aggregates; idempotent by (session_id, day).

CREATE OR REPLACE FUNCTION public.ingest_anonymous_usage(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session TEXT;
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

    v_session := COALESCE(p_payload->> 'anonymous_session_id', '');
    v_events := p_payload-> 'events';

    IF v_session = '' OR v_events IS NULL OR jsonb_typeof(v_events) <> 'array' THEN
        RAISE EXCEPTION 'invalid_payload_fields';
    END IF;

    -- Cap number of events to prevent abuse
    IF jsonb_array_length(v_events) > 50 THEN
        RAISE EXCEPTION 'too_many_events';
    END IF;

    -- Collapse events to a single UTC day window (use first event's day)
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
            v_msg_sent := v_msg_sent + 1;
            v_in_tokens := v_in_tokens + GREATEST(v_itokens, 0);
            IF v_model IS NOT NULL THEN
                -- Snapshot current pricing for this model
                SELECT COALESCE(prompt_price,0), COALESCE(completion_price,0)
                INTO v_prompt_price, v_completion_price
                FROM public.model_access
                WHERE model_id = v_model;
                INSERT INTO public.anonymous_model_usage_daily (
                    usage_date, model_id, prompt_tokens, assistant_messages, generation_ms,
                    prompt_unit_price, completion_unit_price, estimated_cost
                ) VALUES (
                    v_day, v_model, GREATEST(v_itokens,0), 0, 0,
                    v_prompt_price, v_completion_price,
                    ROUND(GREATEST(v_itokens,0) * COALESCE(v_prompt_price,0), 6)
                ) ON CONFLICT (usage_date, model_id) DO UPDATE SET
                    prompt_tokens = public.anonymous_model_usage_daily.prompt_tokens + EXCLUDED.prompt_tokens,
                    estimated_cost = public.anonymous_model_usage_daily.estimated_cost + EXCLUDED.estimated_cost,
                    prompt_unit_price = COALESCE(public.anonymous_model_usage_daily.prompt_unit_price, EXCLUDED.prompt_unit_price),
                    completion_unit_price = COALESCE(public.anonymous_model_usage_daily.completion_unit_price, EXCLUDED.completion_unit_price),
                    updated_at = NOW();
            END IF;
        ELSIF v_type = 'completion_received' THEN
            v_msg_recv := v_msg_recv + 1;
            v_out_tokens := v_out_tokens + GREATEST(v_otokens, 0);
            v_gen_ms := v_gen_ms + GREATEST(v_elapsed, 0);
            IF v_model IS NOT NULL THEN
                -- Snapshot current pricing for this model
                SELECT COALESCE(prompt_price,0), COALESCE(completion_price,0)
                INTO v_prompt_price, v_completion_price
                FROM public.model_access
                WHERE model_id = v_model;
                INSERT INTO public.anonymous_model_usage_daily (
                    usage_date, model_id, completion_tokens, assistant_messages, generation_ms,
                    prompt_unit_price, completion_unit_price, estimated_cost
                ) VALUES (
                    v_day, v_model, GREATEST(v_otokens,0), 1, GREATEST(v_elapsed,0),
                    v_prompt_price, v_completion_price,
                    ROUND(GREATEST(v_otokens,0) * COALESCE(v_completion_price,0), 6)
                ) ON CONFLICT (usage_date, model_id) DO UPDATE SET
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
        anonymous_session_id, usage_date, messages_sent, messages_received,
        input_tokens, output_tokens, models_used, generation_ms
    ) VALUES (
        v_session, v_day, v_msg_sent, v_msg_recv,
        v_in_tokens, v_out_tokens, v_models_used, v_gen_ms
    ) ON CONFLICT (anonymous_session_id, usage_date) DO UPDATE SET
        messages_sent = public.anonymous_usage_daily.messages_sent + EXCLUDED.messages_sent,
        messages_received = public.anonymous_usage_daily.messages_received + EXCLUDED.messages_received,
        input_tokens = public.anonymous_usage_daily.input_tokens + EXCLUDED.input_tokens,
        output_tokens = public.anonymous_usage_daily.output_tokens + EXCLUDED.output_tokens,
        models_used = GREATEST(public.anonymous_usage_daily.models_used, EXCLUDED.models_used),
        generation_ms = public.anonymous_usage_daily.generation_ms + EXCLUDED.generation_ms,
        updated_at = NOW();

    RETURN jsonb_build_object(
        'ok', true,
        'session', v_session,
        'date', v_day,
        'messages_sent', v_msg_sent,
        'messages_received', v_msg_recv,
        'input_tokens', v_in_tokens,
        'output_tokens', v_out_tokens,
        'models_used', v_models_used,
        'generation_ms', v_gen_ms
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_anonymous_usage(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_anonymous_usage(jsonb) TO anon, authenticated;

-- 6) Retention helper (no schedule here)
CREATE OR REPLACE FUNCTION public.cleanup_anonymous_usage(days_to_keep integer DEFAULT 30)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cutoff date := CURRENT_DATE - make_interval(days => days_to_keep);
    v_deleted int;
BEGIN
    DELETE FROM public.anonymous_usage_daily WHERE usage_date < v_cutoff;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN COALESCE(v_deleted, 0);
END;
$$;

-- 7) Comments
COMMENT ON TABLE public.anonymous_usage_daily IS 'Daily aggregates of anonymous usage keyed by anonymous_session_id; no PII; admin-only read.';
COMMENT ON FUNCTION public.ingest_anonymous_usage(jsonb) IS 'SECURITY DEFINER: Validates and aggregates anonymous usage events into daily table; idempotent per session+day.';
COMMENT ON FUNCTION public.cleanup_anonymous_usage(integer) IS 'Delete anonymous_usage_daily rows older than N days (default 30).';

-- 8) Admin cost helper for anonymous usage (estimated at query time)
CREATE OR REPLACE FUNCTION public.get_anonymous_model_costs(
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
    estimated_cost DECIMAL(18,6),
    assistant_messages BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_trunc TEXT := 'day';
BEGIN
    IF lower(p_granularity) IN ('day','week','month') THEN
        v_trunc := lower(p_granularity);
    END IF;

    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Insufficient privileges';
    END IF;

        RETURN QUERY
        SELECT
                (date_trunc(v_trunc, amu.usage_date))::date AS usage_period,
                amu.model_id,
                SUM(amu.prompt_tokens) AS prompt_tokens,
                SUM(amu.completion_tokens) AS completion_tokens,
                SUM(amu.total_tokens) AS total_tokens,
                ROUND(SUM(amu.estimated_cost), 6) AS estimated_cost,
                SUM(amu.assistant_messages) AS assistant_messages
        FROM public.anonymous_model_usage_daily amu
        WHERE amu.usage_date >= p_start_date
            AND amu.usage_date < (p_end_date + 1)
        GROUP BY 1, 2
        ORDER BY usage_period ASC, estimated_cost DESC;
END;
$fn$;

COMMENT ON FUNCTION public.get_anonymous_model_costs(DATE, DATE, TEXT)
    IS 'Admin-only: aggregate anonymous model tokens and estimate cost by day/week/month between dates inclusive.';
