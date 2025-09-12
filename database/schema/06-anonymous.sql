-- =============================================================================
-- ANONYMOUS ANALYTICS SCHEMA (Merged from patches/anonymous-usage-stats)
-- =============================================================================
-- This file merges the previously applied patches into the base schema so a
-- fresh clone gets the anonymous usage/error analytics objects in one pass.
-- Sources:
--   - 001_anonymous_usage_schema.sql
--   - 002_fix_price_casts.sql
--   - 003_map_tokens_from_assistant.sql
-- =============================================================================

-- 1) Anonymous usage daily aggregates (per-session/day)
CREATE TABLE IF NOT EXISTS public.anonymous_usage_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anon_hash TEXT NOT NULL,
    usage_date DATE NOT NULL,
    messages_sent INTEGER NOT NULL DEFAULT 0,
    messages_received INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
    generation_ms BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (anon_hash, usage_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_anonymous_usage_daily_date ON public.anonymous_usage_daily(usage_date DESC);
CREATE INDEX IF NOT EXISTS idx_anonymous_usage_daily_session ON public.anonymous_usage_daily(anon_hash);

-- 2) Per-model daily aggregates (for cost estimation)
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

-- 3) RLS policies (admin-only read; writes via SECURITY DEFINER RPC only)
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

-- 4) Update trigger for updated_at (utility shared function)
CREATE OR REPLACE FUNCTION public._set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END; $$ LANGUAGE plpgsql SET search_path = 'pg_catalog, public';

DROP TRIGGER IF EXISTS on_anonymous_usage_update ON public.anonymous_usage_daily;
CREATE TRIGGER on_anonymous_usage_update
    BEFORE UPDATE ON public.anonymous_usage_daily
    FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();

DROP TRIGGER IF EXISTS on_anonymous_model_usage_update ON public.anonymous_model_usage_daily;
CREATE TRIGGER on_anonymous_model_usage_update
    BEFORE UPDATE ON public.anonymous_model_usage_daily
    FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();

-- 5) Ingestion function (final merged version: tokens from assistant; price casts)
CREATE OR REPLACE FUNCTION public.ingest_anonymous_usage(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'pg_catalog, public'
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

REVOKE ALL ON FUNCTION public.ingest_anonymous_usage(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_anonymous_usage(jsonb) TO anon, authenticated;

-- 6) Retention helper (usage)
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

COMMENT ON TABLE public.anonymous_usage_daily IS 'Daily aggregates of anonymous usage keyed by anon_hash; no PII; admin-only read.';
COMMENT ON FUNCTION public.ingest_anonymous_usage(jsonb) IS 'SECURITY DEFINER: Aggregates anonymous usage; tokens pulled from assistant events; prices cast from VARCHAR to DECIMAL; idempotent per anon_hash+day.';
COMMENT ON FUNCTION public.cleanup_anonymous_usage(integer) IS 'Delete anonymous_usage_daily rows older than N days (default 30).';

-- 7) Admin helper: aggregate anonymous model costs
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
SET search_path = 'pg_catalog, public'
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

-- 8) Anonymous error events and helpers
CREATE TABLE IF NOT EXISTS public.anonymous_error_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anon_hash TEXT NOT NULL,
    event_timestamp TIMESTAMPTZ NOT NULL,
    model VARCHAR(100) NOT NULL,
    http_status INT NULL,
    error_code TEXT NULL,
    error_message TEXT NULL,
    provider TEXT NULL,
    provider_request_id TEXT NULL,
    completion_id TEXT NULL,
    metadata JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anon_errors_time ON public.anonymous_error_events(event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_anon_errors_model_time ON public.anonymous_error_events(model, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_anon_errors_hash_time ON public.anonymous_error_events(anon_hash, event_timestamp DESC);

ALTER TABLE public.anonymous_error_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anonymous_error_events FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='public' AND tablename='anonymous_error_events' AND policyname='Admins can read anonymous errors'
    ) THEN
        EXECUTE 'DROP POLICY "Admins can read anonymous errors" ON public.anonymous_error_events';
    END IF;
    EXECUTE 'CREATE POLICY "Admins can read anonymous errors" ON public.anonymous_error_events FOR SELECT USING (public.is_admin(auth.uid()))';

    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='public' AND tablename='anonymous_error_events' AND policyname='Deny error writes'
    ) THEN
        EXECUTE 'DROP POLICY "Deny error writes" ON public.anonymous_error_events';
    END IF;
    EXECUTE 'CREATE POLICY "Deny error writes" ON public.anonymous_error_events FOR INSERT WITH CHECK (false)';
    EXECUTE 'CREATE POLICY "Deny error updates" ON public.anonymous_error_events FOR UPDATE USING (false)';
    EXECUTE 'CREATE POLICY "Deny error deletes" ON public.anonymous_error_events FOR DELETE USING (false)';
END$$;

-- RPC to ingest anonymous error
CREATE OR REPLACE FUNCTION public.ingest_anonymous_error(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'pg_catalog, public'
AS $$
DECLARE
    v_hash TEXT;
    v_model TEXT;
    v_ts TIMESTAMPTZ;
    v_http INT;
    v_code TEXT;
    v_msg TEXT;
    v_provider TEXT;
    v_req_id TEXT;
    v_completion_id TEXT;
    v_metadata JSONB;
BEGIN
    IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
        RAISE EXCEPTION 'invalid_payload';
    END IF;

    v_hash := NULLIF(p_payload->> 'anon_hash', '');
    v_model := NULLIF(p_payload->> 'model', '');
    v_ts := NULLIF(p_payload->> 'timestamp', '')::timestamptz;
    v_http := NULLIF(p_payload->> 'http_status', '')::int;
    v_code := NULLIF(p_payload->> 'error_code', '');
    v_msg := left(COALESCE(p_payload->> 'error_message', ''), 300);
    v_provider := NULLIF(p_payload->> 'provider', '');
    v_req_id := NULLIF(p_payload->> 'provider_request_id', '');
    v_completion_id := NULLIF(p_payload->> 'completion_id', '');

    IF v_hash IS NULL OR v_model IS NULL OR v_ts IS NULL THEN
        RAISE EXCEPTION 'invalid_payload_fields';
    END IF;

    -- Cap metadata size (~2KB); drop if too large
    IF p_payload ? 'metadata' THEN
        IF pg_column_size(p_payload->'metadata') <= 2048 THEN
            v_metadata := p_payload->'metadata';
        ELSE
            v_metadata := jsonb_build_object('truncated', true);
        END IF;
    ELSE
        v_metadata := NULL;
    END IF;

    INSERT INTO public.anonymous_error_events (
        anon_hash, event_timestamp, model, http_status, error_code, error_message,
        provider, provider_request_id, completion_id, metadata
    ) VALUES (
        v_hash, v_ts, v_model, v_http, v_code, NULLIF(v_msg, ''),
        v_provider, v_req_id, v_completion_id, v_metadata
    );

    RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_anonymous_error(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_anonymous_error(jsonb) TO anon, authenticated;

-- Admin helper to fetch recent anonymous errors
CREATE OR REPLACE FUNCTION public.get_anonymous_errors(
    p_start_date DATE,
    p_end_date DATE,
    p_limit INT DEFAULT 100,
    p_model TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    event_timestamp TIMESTAMPTZ,
    model VARCHAR(100),
    http_status INT,
    error_code TEXT,
    error_message TEXT,
    provider TEXT,
    provider_request_id TEXT,
    completion_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'pg_catalog, public'
AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Insufficient privileges';
    END IF;

    RETURN QUERY
    SELECT e.id, e.event_timestamp, e.model, e.http_status, e.error_code,
           e.error_message, e.provider, e.provider_request_id, e.completion_id
    FROM public.anonymous_error_events e
    WHERE e.event_timestamp::date >= p_start_date
      AND e.event_timestamp::date < (p_end_date + 1)
      AND (p_model IS NULL OR e.model = p_model)
    ORDER BY e.event_timestamp DESC
    LIMIT GREATEST(p_limit, 0);
END;
$$;

-- Retention helper for errors
CREATE OR REPLACE FUNCTION public.cleanup_anonymous_errors(days_to_keep integer DEFAULT 30)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'pg_catalog, public'
AS $$
DECLARE
    v_cutoff timestamptz := date_trunc('day', NOW()) - make_interval(days => days_to_keep);
    v_deleted int;
BEGIN
    DELETE FROM public.anonymous_error_events WHERE event_timestamp < v_cutoff;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN COALESCE(v_deleted, 0);
END;
$$;
