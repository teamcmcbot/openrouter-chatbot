


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog, public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END; $$;


ALTER FUNCTION "public"."_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analyze_database_health"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
    AS $$
DECLARE
    health_data JSONB;
    table_sizes JSONB;
    index_usage JSONB;
BEGIN
    -- Get table sizes
    SELECT jsonb_object_agg(
        schemaname || '.' || tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
    ) INTO table_sizes
    FROM pg_tables 
    WHERE schemaname = 'public';
    
    -- Get basic health metrics
    health_data := jsonb_build_object(
        'timestamp', NOW(),
        'database_size', pg_size_pretty(pg_database_size(current_database())),
        'table_sizes', table_sizes,
        'total_users', (SELECT COUNT(*) FROM public.profiles),
        'total_conversations', (SELECT COUNT(*) FROM public.chat_sessions),
        'total_messages', (SELECT COUNT(*) FROM public.chat_messages),
        'active_users_last_7_days', (
            SELECT COUNT(DISTINCT user_id) 
            FROM public.user_activity_log 
            WHERE timestamp >= NOW() - INTERVAL '7 days'
        )
    );
    
    RETURN health_data;
END;
$$;


ALTER FUNCTION "public"."analyze_database_health"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ban_user"("p_user_id" "uuid", "p_until" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_action text;
  v_updated int := 0;
BEGIN
  -- Require admin unless running with elevated service role (auth.uid() is null in service contexts)
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;

  v_action := CASE WHEN p_until IS NULL THEN 'banned' ELSE 'temporary_ban' END;

  UPDATE public.profiles
     SET is_banned   = (p_until IS NULL), -- permanent only
         banned_at   = now(),
         banned_until= p_until,
         ban_reason  = p_reason,
         updated_at  = now()
   WHERE id = p_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Write moderation action (admin audit)
  INSERT INTO public.moderation_actions(user_id, action, reason, metadata, created_by)
  VALUES (
    p_user_id,
    v_action,
    p_reason,
    jsonb_build_object('until', p_until),
    auth.uid()
  );

  -- Write activity log (user-scoped audit trail)
  PERFORM public.log_user_activity(
    p_user_id,
    'user_banned',
    'profile',
    p_user_id::text,
    jsonb_build_object('until', p_until)
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'action', v_action,
    'until', p_until,
    'updated_at', now()
  );
END;
$$;


ALTER FUNCTION "public"."ban_user"("p_user_id" "uuid", "p_until" timestamp with time zone, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_and_record_message_cost"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog, public'
    AS $$
BEGIN
    IF NEW.role = 'assistant' AND (NEW.error_message IS NULL OR NEW.error_message = '') THEN
    PERFORM public.recompute_image_cost_for_user_message(NEW.user_message_id);
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calculate_and_record_message_cost"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_user_use_model"("user_uuid" "uuid", "model_to_check" character varying) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
    AS $$
DECLARE
    user_tier VARCHAR(20);
    model_available BOOLEAN := false;
BEGIN
    -- Get user's subscription tier
    SELECT subscription_tier INTO user_tier
    FROM public.profiles
    WHERE id = user_uuid;

    -- If user not found, default to free tier
    IF user_tier IS NULL THEN
        user_tier := 'free';
    END IF;

    -- Check if model is available for user's tier
    SELECT EXISTS(
        SELECT 1 FROM public.model_access ma
        WHERE ma.model_id = model_to_check
        AND ma.status = 'active'
        AND (
            (user_tier = 'free' AND ma.is_free = true) OR
            (user_tier = 'pro' AND (ma.is_free = true OR ma.is_pro = true)) OR
            (user_tier = 'enterprise' AND (ma.is_free = true OR ma.is_pro = true OR ma.is_enterprise = true))
        )
    ) INTO model_available;

    RETURN model_available;
END;
$$;


ALTER FUNCTION "public"."can_user_use_model"("user_uuid" "uuid", "model_to_check" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_anonymous_errors"("days_to_keep" integer DEFAULT 30) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
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


ALTER FUNCTION "public"."cleanup_anonymous_errors"("days_to_keep" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_anonymous_usage"("days_to_keep" integer DEFAULT 30) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."cleanup_anonymous_usage"("days_to_keep" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_anonymous_usage"("days_to_keep" integer) IS 'Delete anonymous_usage_daily rows older than N days (default 30).';



CREATE OR REPLACE FUNCTION "public"."cleanup_cta_events"("days_to_keep" integer DEFAULT 90) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
    AS $$
DECLARE
  cutoff timestamptz := now() - make_interval(days => days_to_keep);
  deleted_count int;
BEGIN
  DELETE FROM public.cta_events WHERE created_at < cutoff;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_cta_events"("days_to_keep" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_data"("days_to_keep" integer DEFAULT 90) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
    AS $$
DECLARE
    v_started_at TIMESTAMPTZ := NOW();
    v_cutoff_ts TIMESTAMPTZ := NOW() - (days_to_keep || ' days')::INTERVAL;
    v_cutoff_date DATE := CURRENT_DATE - (days_to_keep || ' days')::INTERVAL;
    del_activity BIGINT := 0;
    del_usage BIGINT := 0;
    del_anon_usage BIGINT := 0;
    del_anon_model_usage BIGINT := 0;
    del_anon_errors BIGINT := 0;
    del_token_costs BIGINT := 0;
    del_cta BIGINT := 0;
    del_sync BIGINT := 0;
BEGIN
    DELETE FROM public.user_activity_log WHERE timestamp < v_cutoff_ts;
    GET DIAGNOSTICS del_activity = ROW_COUNT;

    DELETE FROM public.user_usage_daily WHERE usage_date < v_cutoff_date;
    GET DIAGNOSTICS del_usage = ROW_COUNT;

    DELETE FROM public.anonymous_usage_daily WHERE usage_date < v_cutoff_date;
    GET DIAGNOSTICS del_anon_usage = ROW_COUNT;

    DELETE FROM public.anonymous_model_usage_daily WHERE usage_date < v_cutoff_date;
    GET DIAGNOSTICS del_anon_model_usage = ROW_COUNT;

    DELETE FROM public.anonymous_error_events WHERE event_timestamp < v_cutoff_ts;
    GET DIAGNOSTICS del_anon_errors = ROW_COUNT;

    DELETE FROM public.message_token_costs WHERE message_timestamp < v_cutoff_ts;
    GET DIAGNOSTICS del_token_costs = ROW_COUNT;

    DELETE FROM public.cta_events WHERE created_at < v_cutoff_ts;
    GET DIAGNOSTICS del_cta = ROW_COUNT;

    DELETE FROM public.model_sync_log WHERE COALESCE(sync_completed_at, sync_started_at) < v_cutoff_ts;
    GET DIAGNOSTICS del_sync = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'started_at', v_started_at,
        'completed_at', NOW(),
        'days_to_keep', days_to_keep,
        'cutoff_timestamp', v_cutoff_ts,
        'deleted_records', jsonb_build_object(
            'user_activity_log', del_activity,
            'user_usage_daily', del_usage,
            'anonymous_usage_daily', del_anon_usage,
            'anonymous_model_usage_daily', del_anon_model_usage,
            'anonymous_error_events', del_anon_errors,
            'message_token_costs', del_token_costs,
            'cta_events', del_cta,
            'model_sync_log', del_sync
        ),
        'schema_version', 'retention-simple-v1'
    );
END;
$$;


ALTER FUNCTION "public"."cleanup_old_data"("days_to_keep" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_user_model_costs_daily"("p_start" "date", "p_end" "date") RETURNS TABLE("usage_date" "date", "user_id" "uuid", "assistant_messages" bigint, "total_tokens" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    (mtc.message_timestamp AT TIME ZONE 'UTC')::date AS usage_date,
    mtc.user_id,
    COUNT(*)::bigint         AS assistant_messages,
    SUM(mtc.total_tokens)::bigint AS total_tokens
  FROM public.message_token_costs mtc
  WHERE mtc.message_timestamp >= p_start
    AND mtc.message_timestamp < (p_end + 1)
  GROUP BY 1, 2
  ORDER BY 1 ASC;
END;
$$;


ALTER FUNCTION "public"."get_admin_user_model_costs_daily"("p_start" "date", "p_end" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_admin_user_model_costs_daily"("p_start" "date", "p_end" "date") IS 'Admin RPC: per-user daily messages/tokens between dates inclusive; requires admin and uses SECURITY DEFINER.';



CREATE OR REPLACE FUNCTION "public"."get_anonymous_errors"("p_start_date" "date", "p_end_date" "date", "p_limit" integer DEFAULT 100, "p_model" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "event_timestamp" timestamp with time zone, "model" character varying, "http_status" integer, "error_code" "text", "error_message" "text", "provider" "text", "provider_request_id" "text", "completion_id" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
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


ALTER FUNCTION "public"."get_anonymous_errors"("p_start_date" "date", "p_end_date" "date", "p_limit" integer, "p_model" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_anonymous_model_costs"("p_start_date" "date", "p_end_date" "date", "p_granularity" "text" DEFAULT 'day'::"text") RETURNS TABLE("usage_period" "date", "model_id" character varying, "prompt_tokens" bigint, "completion_tokens" bigint, "total_tokens" bigint, "estimated_cost" numeric, "assistant_messages" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_anonymous_model_costs"("p_start_date" "date", "p_end_date" "date", "p_granularity" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_anonymous_model_costs"("p_start_date" "date", "p_end_date" "date", "p_granularity" "text") IS 'Admin-only: aggregate anonymous model tokens and estimate cost by day/week/month between dates inclusive.';



CREATE OR REPLACE FUNCTION "public"."get_error_count"("p_start_date" "date", "p_end_date" "date") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
    AS $$
    DECLARE
        v_count BIGINT := 0;
    BEGIN
        IF NOT public.is_admin(auth.uid()) THEN
            RAISE EXCEPTION 'Insufficient privileges';
        END IF;

        SELECT COUNT(*) INTO v_count
        FROM public.chat_messages m
        WHERE m.message_timestamp >= p_start_date
          AND m.message_timestamp < (p_end_date + 1)
          AND m.error_message IS NOT NULL
          AND m.error_message <> '';

        RETURN v_count;
    END;
    $$;


ALTER FUNCTION "public"."get_error_count"("p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_error_count"("p_start_date" "date", "p_end_date" "date") IS 'Admin-only: count of error messages between dates inclusive.';



CREATE OR REPLACE FUNCTION "public"."get_global_model_costs"("p_start_date" "date", "p_end_date" "date", "p_granularity" "text" DEFAULT 'day'::"text") RETURNS TABLE("usage_period" "date", "model_id" character varying, "prompt_tokens" bigint, "completion_tokens" bigint, "total_tokens" bigint, "total_cost" numeric, "assistant_messages" bigint, "distinct_users" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
    AS $$
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
        (date_trunc(v_trunc, mtc.message_timestamp))::date AS usage_period,
        mtc.model_id,
        SUM(mtc.prompt_tokens) AS prompt_tokens,
        SUM(mtc.completion_tokens) AS completion_tokens,
        SUM(mtc.total_tokens) AS total_tokens,
        ROUND(SUM(mtc.total_cost),6) AS total_cost,
        COUNT(*) AS assistant_messages,
        COUNT(DISTINCT mtc.user_id) AS distinct_users
    FROM public.message_token_costs AS mtc
    WHERE mtc.message_timestamp >= p_start_date
      AND mtc.message_timestamp < (p_end_date + 1)
    GROUP BY 1, 2
    ORDER BY usage_period ASC, total_cost DESC;
END;
$$;


ALTER FUNCTION "public"."get_global_model_costs"("p_start_date" "date", "p_end_date" "date", "p_granularity" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_global_model_costs"("p_start_date" "date", "p_end_date" "date", "p_granularity" "text") IS 'Admin-only: aggregate model costs by chosen granularity (day/week/month) between dates inclusive.';



CREATE OR REPLACE FUNCTION "public"."get_model_sync_activity_daily"("p_days" integer DEFAULT 30) RETURNS TABLE("day" "date", "models_added" integer, "models_marked_inactive" integer, "models_reactivated" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
    AS $$
DECLARE
    safe_days integer := LEAST(GREATEST(p_days,1),365);
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'insufficient_privilege';
    END IF;
    RETURN QUERY
    SELECT v.day::date AS day,
           v.models_added::int,
           v.models_marked_inactive::int,
           v.models_reactivated::int
    FROM public.v_model_sync_activity_daily v
    WHERE v.day::date >= (CURRENT_DATE - (safe_days - 1))
    ORDER BY v.day::date DESC;
END;$$;


ALTER FUNCTION "public"."get_model_sync_activity_daily"("p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_recent_errors"("p_start_date" "date", "p_end_date" "date", "p_limit" integer DEFAULT 100) RETURNS TABLE("message_id" "text", "session_id" "text", "user_id" "uuid", "model" character varying, "message_timestamp" timestamp with time zone, "error_message" "text", "completion_id" character varying, "user_message_id" "text", "elapsed_ms" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
    AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Insufficient privileges';
    END IF;

    RETURN QUERY
    SELECT
        m.id AS message_id,
        m.session_id,
        s.user_id,
        COALESCE(
            m.model,
            -- If this row is an assistant message with a cost snapshot, trust cost snapshot model
            (SELECT mtc.model_id FROM public.message_token_costs mtc WHERE mtc.assistant_message_id = m.id LIMIT 1),
            -- If this row is a user message with a later assistant cost snapshot, use that model
            (SELECT mtc2.model_id FROM public.message_token_costs mtc2 WHERE mtc2.user_message_id = m.id ORDER BY mtc2.message_timestamp DESC LIMIT 1),
            -- If an assistant message exists linked by user_message_id, use its model
            (SELECT m2.model FROM public.chat_messages m2 WHERE m2.user_message_id = m.id ORDER BY m2.message_timestamp DESC LIMIT 1),
            -- Fall back to session's last known model
            s.last_model
        ) AS model,
        m.message_timestamp,
        m.error_message,
        m.completion_id,
        m.user_message_id,
        m.elapsed_ms
    FROM public.chat_messages m
    JOIN public.chat_sessions s ON s.id = m.session_id
    WHERE m.message_timestamp >= p_start_date
      AND m.message_timestamp < (p_end_date + 1)
      AND m.error_message IS NOT NULL
      AND m.error_message <> ''
    ORDER BY m.message_timestamp DESC
    LIMIT COALESCE(p_limit, 100);
END;
$$;


ALTER FUNCTION "public"."get_recent_errors"("p_start_date" "date", "p_end_date" "date", "p_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_recent_errors"("p_start_date" "date", "p_end_date" "date", "p_limit" integer) IS 'Admin-only: most recent error messages (default 100) with enriched model fallback from costs / assistant / session.';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."model_sync_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sync_started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sync_completed_at" timestamp with time zone,
    "total_openrouter_models" integer DEFAULT 0,
    "models_added" integer DEFAULT 0,
    "models_updated" integer DEFAULT 0,
    "models_marked_inactive" integer DEFAULT 0,
    "sync_status" character varying(20) DEFAULT 'running'::character varying,
    "error_message" "text",
    "error_details" "jsonb",
    "duration_ms" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "models_reactivated" integer DEFAULT 0,
    "added_by_user_id" "uuid",
    "db_duration_ms" bigint,
    CONSTRAINT "model_sync_log_sync_status_check" CHECK ((("sync_status")::"text" = ANY (ARRAY[('running'::character varying)::"text", ('completed'::character varying)::"text", ('failed'::character varying)::"text"])))
);

ALTER TABLE ONLY "public"."model_sync_log" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."model_sync_log" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_sync_stats" WITH ("security_invoker"='true') AS
 WITH "base" AS (
         SELECT "model_sync_log"."id",
            "model_sync_log"."sync_status",
            "model_sync_log"."sync_started_at",
            "model_sync_log"."sync_completed_at",
            "model_sync_log"."duration_ms",
            "model_sync_log"."db_duration_ms"
           FROM "public"."model_sync_log"
        ), "last_success" AS (
         SELECT "base"."id" AS "last_success_id",
            "base"."sync_completed_at" AS "last_success_at"
           FROM "base"
          WHERE (("base"."sync_status")::"text" = 'completed'::"text")
          ORDER BY "base"."sync_completed_at" DESC NULLS LAST
         LIMIT 1
        ), "agg" AS (
         SELECT ( SELECT "last_success"."last_success_id"
                   FROM "last_success") AS "last_success_id",
            ( SELECT "last_success"."last_success_at"
                   FROM "last_success") AS "last_success_at",
                CASE
                    WHEN ("count"(*) FILTER (WHERE ("base"."sync_started_at" >= ("now"() - '30 days'::interval))) = 0) THEN (0)::numeric
                    ELSE "round"(((("sum"(
                    CASE
                        WHEN ((("base"."sync_status")::"text" = 'completed'::"text") AND ("base"."sync_started_at" >= ("now"() - '30 days'::interval))) THEN 1
                        ELSE 0
                    END))::numeric * (100)::numeric) / ("count"(*) FILTER (WHERE ("base"."sync_started_at" >= ("now"() - '30 days'::interval))))::numeric), 2)
                END AS "success_rate_30d",
            "round"("avg"("base"."duration_ms") FILTER (WHERE ((("base"."sync_status")::"text" = 'completed'::"text") AND ("base"."sync_started_at" >= ("now"() - '30 days'::interval)))), 2) AS "avg_duration_ms_30d",
            "round"("avg"("base"."db_duration_ms") FILTER (WHERE ((("base"."sync_status")::"text" = 'completed'::"text") AND ("base"."sync_started_at" >= ("now"() - '30 days'::interval)))), 2) AS "avg_db_duration_ms_30d",
            "count"(*) FILTER (WHERE ("base"."sync_started_at" >= ("now"() - '24:00:00'::interval))) AS "runs_24h",
            "count"(*) FILTER (WHERE ((("base"."sync_status")::"text" = 'failed'::"text") AND ("base"."sync_started_at" >= ("now"() - '24:00:00'::interval)))) AS "failures_24h"
           FROM "base"
        )
 SELECT "last_success_id",
    "last_success_at",
    "success_rate_30d",
    "avg_duration_ms_30d",
    "avg_db_duration_ms_30d",
    "runs_24h",
    "failures_24h"
   FROM "agg";


ALTER VIEW "public"."v_sync_stats" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_sync_stats"() RETURNS "public"."v_sync_stats"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
    AS $$
DECLARE
    r public.v_sync_stats%ROWTYPE;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'insufficient_privilege';
    END IF;
    SELECT * INTO r FROM public.v_sync_stats;
    RETURN r;
END;$$;


ALTER FUNCTION "public"."get_sync_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_allowed_models"("user_uuid" "uuid") RETURNS TABLE("model_id" character varying, "model_name" character varying, "model_description" "text", "model_tags" "text"[], "input_cost_per_token" numeric, "output_cost_per_token" numeric, "daily_limit" integer, "monthly_limit" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
    AS $$
DECLARE
    user_tier VARCHAR(20);
BEGIN
    -- Get user's subscription tier
    SELECT subscription_tier INTO user_tier
    FROM public.profiles
    WHERE id = user_uuid;

    -- If user not found, return free tier models
    IF user_tier IS NULL THEN
        user_tier := 'free';
    END IF;

    -- Return models available for user's tier
    RETURN QUERY
    SELECT
        ma.model_id,
        ma.model_name,
        ma.model_description,
        ARRAY[]::TEXT[] as model_tags, -- Empty array for backward compatibility
        COALESCE(ma.prompt_price::DECIMAL(10,8), 0.0) as input_cost_per_token,
        COALESCE(ma.completion_price::DECIMAL(10,8), 0.0) as output_cost_per_token,
        ma.daily_limit,
        ma.monthly_limit
    FROM public.model_access ma
    WHERE ma.status = 'active'
    AND (
        (user_tier = 'free' AND ma.is_free = true) OR
        (user_tier = 'pro' AND (ma.is_free = true OR ma.is_pro = true)) OR
        (user_tier = 'enterprise' AND (ma.is_free = true OR ma.is_pro = true OR ma.is_enterprise = true))
    )
    ORDER BY
        CASE
            WHEN ma.is_free THEN 1
            WHEN ma.is_pro THEN 2
            WHEN ma.is_enterprise THEN 3
            ELSE 4
        END,
        ma.model_name;
END;
$$;


ALTER FUNCTION "public"."get_user_allowed_models"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_complete_profile"("user_uuid" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
    AS $$
DECLARE
    profile_data RECORD;
    allowed_models_data JSONB;
    usage_stats_data JSONB;
    today_usage_data JSONB;
BEGIN
    -- Get main profile data (now includes account_type and ban fields)
    SELECT
        id, email, full_name, avatar_url,
        default_model, temperature, system_prompt,
        subscription_tier, account_type, credits,
        is_banned, banned_at, banned_until, ban_reason, violation_strikes,
        ui_preferences, session_preferences,
        created_at, updated_at, last_active, usage_stats
    INTO profile_data
    FROM public.profiles
    WHERE id = user_uuid;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'User not found');
    END IF;

    -- Get allowed models with details (from model_access table)
    SELECT jsonb_agg(
        jsonb_build_object(
            'model_id', model_id,
            'model_name', model_name,
            'model_description', model_description,
            'model_tags', model_tags,
            'daily_limit', daily_limit,
            'monthly_limit', monthly_limit
        )
    ) INTO allowed_models_data
    FROM public.get_user_allowed_models(user_uuid);

    -- Today's usage snapshot
    SELECT jsonb_build_object(
        'messages_sent', COALESCE(messages_sent, 0),
        'messages_received', COALESCE(messages_received, 0),
        'total_tokens', COALESCE(total_tokens, 0),
        'input_tokens', COALESCE(input_tokens, 0),
        'output_tokens', COALESCE(output_tokens, 0),
        'models_used', COALESCE(models_used, '{}'::jsonb),
        'sessions_created', COALESCE(sessions_created, 0),
        'generation_ms', COALESCE(generation_ms, 0)
    ) INTO today_usage_data
    FROM public.user_usage_daily
    WHERE user_id = user_uuid
      AND usage_date = CURRENT_DATE;

    IF today_usage_data IS NULL THEN
        today_usage_data := jsonb_build_object(
            'messages_sent', 0,
            'messages_received', 0,
            'total_tokens', 0,
            'input_tokens', 0,
            'output_tokens', 0,
            'models_used', '{}'::jsonb,
            'sessions_created', 0,
            'generation_ms', 0
        );
    END IF;

    -- Usage stats bundle (includes last 7 days for compatibility)
    SELECT jsonb_build_object(
        'recent_days', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'usage_date', usage_date,
                    'messages_sent', messages_sent,
                    'messages_received', messages_received,
                    'total_tokens', total_tokens,
                    'models_used', models_used,
                    'sessions_created', sessions_created,
                    'generation_ms', generation_ms
                ) ORDER BY usage_date DESC
            )
            FROM public.user_usage_daily
            WHERE user_id = user_uuid
              AND usage_date >= CURRENT_DATE - INTERVAL '7 days'
        ),
        'today', today_usage_data,
        'all_time', profile_data.usage_stats
    ) INTO usage_stats_data;

    -- Return complete profile with ban fields at the top-level
    RETURN jsonb_build_object(
        'id', profile_data.id,
        'email', profile_data.email,
        'full_name', profile_data.full_name,
        'avatar_url', profile_data.avatar_url,
        'subscription_tier', profile_data.subscription_tier,
        'account_type', profile_data.account_type,
        'credits', profile_data.credits,
        'is_banned', profile_data.is_banned,
        'banned_at', profile_data.banned_at,
        'banned_until', profile_data.banned_until,
        'ban_reason', profile_data.ban_reason,
        'violation_strikes', profile_data.violation_strikes,
        'preferences', jsonb_build_object(
            'model', jsonb_build_object(
                'default_model', profile_data.default_model,
                'temperature', profile_data.temperature,
                'system_prompt', profile_data.system_prompt
            ),
            'ui', profile_data.ui_preferences,
            'session', profile_data.session_preferences
        ),
        'available_models', allowed_models_data,
        'usage_stats', usage_stats_data,
        'timestamps', jsonb_build_object(
            'created_at', profile_data.created_at,
            'updated_at', profile_data.updated_at,
            'last_active', profile_data.last_active
        )
    );
END;
$$;


ALTER FUNCTION "public"."get_user_complete_profile"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_model_costs_daily"("p_start" "date", "p_end" "date", "p_model_id" "text" DEFAULT NULL::"text") RETURNS TABLE("usage_date" "date", "model_id" character varying, "total_tokens" bigint, "total_cost" numeric)
    LANGUAGE "sql"
    SET "search_path" TO 'pg_catalog, public'
    AS $$
  SELECT
    (mtc.message_timestamp AT TIME ZONE 'UTC')::date AS usage_date,
    COALESCE(mtc.model_id, 'unknown') AS model_id,
    SUM(mtc.total_tokens)::bigint       AS total_tokens,
    ROUND(SUM(mtc.total_cost), 6)       AS total_cost
  FROM public.message_token_costs mtc
  WHERE mtc.user_id = auth.uid()
    AND mtc.message_timestamp >= p_start
    AND mtc.message_timestamp < (p_end + 1)
    AND (p_model_id IS NULL OR mtc.model_id = p_model_id)
  GROUP BY 1, 2
  ORDER BY 1 ASC;
$$;


ALTER FUNCTION "public"."get_user_model_costs_daily"("p_start" "date", "p_end" "date", "p_model_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_model_costs_daily"("p_start" "date", "p_end" "date", "p_model_id" "text") IS 'Per-user RPC: daily model costs between dates inclusive; SECURITY INVOKER and respects RLS.';



CREATE OR REPLACE FUNCTION "public"."get_user_recent_sessions"("user_uuid" "uuid", "session_limit" integer DEFAULT 10) RETURNS TABLE("id" "text", "title" character varying, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "last_activity" timestamp with time zone, "message_count" integer, "total_tokens" integer, "last_model" character varying, "last_message_preview" "text", "last_message_timestamp" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
    AS $$
    SELECT
        s.id,
        s.title,
        s.created_at,
        s.updated_at,
        s.last_activity,
        s.message_count,
        s.total_tokens,
        s.last_model,
        s.last_message_preview,
        s.last_message_timestamp
    FROM public.chat_sessions s
    WHERE s.user_id = user_uuid
    ORDER BY s.updated_at DESC
    LIMIT session_limit;
$$;


ALTER FUNCTION "public"."get_user_recent_sessions"("user_uuid" "uuid", "session_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_user_profile_sync"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
    AS $$
DECLARE
    last_sync_time TIMESTAMPTZ;
    sync_threshold INTERVAL := '1 minute';
    profile_email_before VARCHAR(255);
    email_changed BOOLEAN := false;
    profile_created_recently BOOLEAN := false;
BEGIN
    -- Check if profile already exists
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
        -- Get current profile email for comparison
        SELECT email INTO profile_email_before 
        FROM public.profiles 
        WHERE id = NEW.id;
        
        -- Check if email will change
        email_changed := (profile_email_before != NEW.email);
        
        -- Check if profile was created recently (within last 2 minutes)
        -- This is used for logging purposes only
        SELECT EXISTS(
            SELECT 1 FROM public.user_activity_log
            WHERE user_id = NEW.id 
            AND action = 'profile_created'
            AND timestamp > NOW() - INTERVAL '2 minutes'
        ) INTO profile_created_recently;
        
        -- Check for recent sync to avoid duplicates
        -- Always check for recent syncs, regardless of profile creation status
        SELECT MAX(timestamp) INTO last_sync_time
        FROM public.user_activity_log
        WHERE user_id = NEW.id 
        AND action = 'profile_synced'
        AND timestamp > NOW() - sync_threshold;
        
        -- Profile exists, update with latest information from Google
        UPDATE public.profiles SET
            email = NEW.email,
            full_name = COALESCE(
                NEW.raw_user_meta_data->>'full_name', 
                NEW.raw_user_meta_data->>'name', 
                full_name,  -- Keep existing if no new data
                split_part(NEW.email, '@', 1)
            ),
            avatar_url = COALESCE(
                NEW.raw_user_meta_data->>'avatar_url',
                avatar_url  -- Keep existing if no new data
            ),
            last_active = NOW(),
            updated_at = NOW()
        WHERE id = NEW.id;
        
        -- Log the profile update only if:
        -- 1. No recent sync occurred (within threshold), OR
        -- 2. Email has changed (important changes should always be logged)
        IF last_sync_time IS NULL OR email_changed THEN
            PERFORM public.log_user_activity(
                NEW.id,
                'profile_synced',
                'profile',
                NEW.id::text,
                jsonb_build_object(
                    'email_updated', email_changed,
                    'sync_source', 'google_oauth',
                    'deduplication_applied', last_sync_time IS NOT NULL AND NOT email_changed,
                    'new_user_sync', profile_created_recently
                )
            );
        END IF;
    ELSE
        -- Profile doesn't exist, create new one
        INSERT INTO public.profiles (id, email, full_name, avatar_url, last_active)
        VALUES (
            NEW.id,
            NEW.email,
            COALESCE(
                NEW.raw_user_meta_data->>'full_name', 
                NEW.raw_user_meta_data->>'name', 
                split_part(NEW.email, '@', 1)
            ),
            NEW.raw_user_meta_data->>'avatar_url',
            NOW()
        );
        
        -- Log the profile creation (always log new profile creation)
        PERFORM public.log_user_activity(
            NEW.id,
            'profile_created',
            'profile',
            NEW.id::text,
            jsonb_build_object(
                'sync_source', 'google_oauth',
                'created_from_oauth', true
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_user_profile_sync"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ingest_anonymous_error"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
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


ALTER FUNCTION "public"."ingest_anonymous_error"("p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ingest_anonymous_usage"("p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
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


ALTER FUNCTION "public"."ingest_anonymous_usage"("p_payload" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."ingest_anonymous_usage"("p_payload" "jsonb") IS 'SECURITY DEFINER: Aggregates anonymous usage; tokens pulled from assistant(completion_received) events; prices cast from VARCHAR to DECIMAL; idempotent per anon_hash+day.';



CREATE OR REPLACE FUNCTION "public"."ingest_cta_event"("p_page" "text", "p_cta_id" "text", "p_location" "text" DEFAULT NULL::"text", "p_is_authenticated" boolean DEFAULT false, "p_user_id" "uuid" DEFAULT NULL::"uuid", "p_ip_hash" "text" DEFAULT NULL::"text", "p_meta" "jsonb" DEFAULT NULL::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
    AS $$
BEGIN
  INSERT INTO public.cta_events(page, cta_id, location, is_authenticated, user_id, ip_hash, meta)
  VALUES (p_page, p_cta_id, p_location, p_is_authenticated, p_user_id, p_ip_hash, p_meta);
END;
$$;


ALTER FUNCTION "public"."ingest_cta_event"("p_page" "text", "p_cta_id" "text", "p_location" "text", "p_is_authenticated" boolean, "p_user_id" "uuid", "p_ip_hash" "text", "p_meta" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id
      AND account_type = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_banned"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(p.is_banned, false)
         OR (p.banned_until IS NOT NULL AND p.banned_until > now())
  FROM public.profiles p
  WHERE p.id = p_user_id;
$$;


ALTER FUNCTION "public"."is_banned"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_user_activity"("p_user_id" "uuid", "p_action" character varying, "p_resource_type" character varying DEFAULT NULL::character varying, "p_resource_id" "text" DEFAULT NULL::"text", "p_details" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
    AS $$
DECLARE
    activity_id UUID;
BEGIN
    INSERT INTO public.user_activity_log (user_id, action, resource_type, resource_id, details)
    VALUES (p_user_id, p_action, p_resource_type, p_resource_id, p_details)
    RETURNING id INTO activity_id;
    
    RETURN activity_id;
END;
$$;


ALTER FUNCTION "public"."log_user_activity"("p_user_id" "uuid", "p_action" character varying, "p_resource_type" character varying, "p_resource_id" "text", "p_details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."on_chat_attachment_link_recompute"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
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


ALTER FUNCTION "public"."on_chat_attachment_link_recompute"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_ban_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Service role (no auth.uid) bypasses; admins allowed
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- If any ban-related column changed by a non-admin, block the update
  IF (COALESCE(NEW.is_banned, false) IS DISTINCT FROM COALESCE(OLD.is_banned, false))
     OR (NEW.banned_until IS DISTINCT FROM OLD.banned_until)
     OR (NEW.banned_at IS DISTINCT FROM OLD.banned_at)
     OR (NEW.ban_reason IS DISTINCT FROM OLD.ban_reason)
  THEN
    RAISE EXCEPTION 'Insufficient privileges to modify ban fields' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_ban_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_image_cost_for_user_message"("p_user_message_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
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
    v_output_image_units_price DECIMAL(12,8) := 0;   -- output image unit price from model_access

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
    INTO v_prompt_price, v_completion_price, v_input_image_price, v_output_image_units_price, v_websearch_price
    FROM public.model_access
    WHERE model_id = v_model;

    -- Fallback for known model override
    IF (v_output_image_units_price = 0 OR v_output_image_units_price IS NULL) AND v_model = 'google/gemini-2.5-flash-image-preview' THEN
        v_output_image_units_price := 0.00003; -- override until model sync includes it
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

    -- FIXED: completion_tokens and output_image_tokens are separate, not overlapping
    -- completion_tokens = text output tokens (from OpenRouter)
    -- output_image_tokens = image output tokens (from completion_tokens_details.image_tokens)
    v_text_completion_tokens := COALESCE(v_completion_tokens, 0);

    -- Cost components
    v_prompt_cost := ROUND( (v_prompt_tokens * v_prompt_price)::numeric, 6 );
    v_text_completion_cost := ROUND( (v_text_completion_tokens * v_completion_price)::numeric, 6 );
    v_input_image_cost := ROUND( (v_input_image_units * v_input_image_price)::numeric, 6 );
    v_output_image_cost := ROUND( (v_output_image_tokens * v_output_image_units_price)::numeric, 6 );

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
        output_image_tokens, output_image_units_price, output_image_cost, total_cost, pricing_source
    ) VALUES (
        v_user_id, v_session_id, v_assistant_id, v_user_msg_id, v_completion_id,
        v_model, v_message_timestamp, v_prompt_tokens, v_completion_tokens, COALESCE(v_elapsed_ms,0),
        v_prompt_price, v_completion_price, v_input_image_units, v_input_image_price,
        v_prompt_cost, v_text_completion_cost, v_input_image_cost, v_websearch_cost,
        v_output_image_tokens, v_output_image_units_price, v_output_image_cost, v_total_cost,
        jsonb_build_object(
            'model_id', v_model,
            'pricing_basis', 'unified_per_token_plus_input_output_images_plus_websearch',
            'prompt_price', v_prompt_price,
            'completion_price', v_completion_price,
            'input_image_price', v_input_image_price,
            'image_units', v_input_image_units,
            'output_image_price', v_output_image_units_price,
            'output_image_tokens', v_output_image_tokens,
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
        output_image_units_price = EXCLUDED.output_image_units_price,
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


ALTER FUNCTION "public"."recompute_image_cost_for_user_message"("p_user_message_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_openrouter_models"("models_data" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
    AS $$
DECLARE
    model_record JSONB;
    sync_log_id UUID;
    count_models_added INTEGER := 0;
    count_models_updated INTEGER := 0;
    count_models_marked_inactive INTEGER := 0;
    count_models_reactivated INTEGER := 0;
    total_models INTEGER;
    start_time TIMESTAMPTZ := NOW();
    current_model_ids TEXT[];
    previous_status VARCHAR(20);
BEGIN
    -- Start sync log
    INSERT INTO public.model_sync_log (sync_status, total_openrouter_models)
    VALUES ('running', jsonb_array_length(models_data))
    RETURNING id INTO sync_log_id;

    -- Get total count
    total_models := jsonb_array_length(models_data);

    -- Collect all current model IDs from OpenRouter
    SELECT array_agg(model_element->>'id') INTO current_model_ids
    FROM jsonb_array_elements(models_data) AS model_element;

    -- Process each model from OpenRouter
    FOR model_record IN SELECT * FROM jsonb_array_elements(models_data)
    LOOP
        -- Check if this model was previously inactive (for reactivation tracking)
        SELECT status INTO previous_status
        FROM public.model_access
        WHERE model_id = model_record->>'id';

        -- Insert or update model
        INSERT INTO public.model_access (
            model_id,
            canonical_slug,
            hugging_face_id,
            model_name,
            model_description,
            context_length,
            created_timestamp,
            modality,
            input_modalities,
            output_modalities,
            tokenizer,
            prompt_price,
            completion_price,
            request_price,
            image_price,
            web_search_price,
            internal_reasoning_price,
            input_cache_read_price,
            input_cache_write_price,
            max_completion_tokens,
            is_moderated,
            supported_parameters,
            openrouter_last_seen,
            last_synced_at
        ) VALUES (
            model_record->>'id',
            model_record->>'canonical_slug',
            model_record->>'hugging_face_id',
            model_record->>'name',
            model_record->>'description',
            COALESCE((model_record->>'context_length')::integer, 8192),
            COALESCE((model_record->>'created')::bigint, extract(epoch from now())::bigint),
            model_record->'architecture'->>'modality',
            COALESCE(model_record->'architecture'->'input_modalities', '[]'::jsonb),
            COALESCE(model_record->'architecture'->'output_modalities', '[]'::jsonb),
            model_record->'architecture'->>'tokenizer',
            COALESCE(model_record->'pricing'->>'prompt', '0'),
            COALESCE(model_record->'pricing'->>'completion', '0'),
            COALESCE(model_record->'pricing'->>'request', '0'),
            COALESCE(model_record->'pricing'->>'image', '0'),
            COALESCE(model_record->'pricing'->>'web_search', '0'),
            COALESCE(model_record->'pricing'->>'internal_reasoning', '0'),
            model_record->'pricing'->>'input_cache_read',
            model_record->'pricing'->>'input_cache_write',
            (model_record->'top_provider'->>'max_completion_tokens')::integer,
            COALESCE((model_record->'top_provider'->>'is_moderated')::boolean, false),
            COALESCE(model_record->'supported_parameters', '[]'::jsonb),
            NOW(),
            NOW()
        )
        ON CONFLICT (model_id) DO UPDATE SET
            canonical_slug = EXCLUDED.canonical_slug,
            hugging_face_id = EXCLUDED.hugging_face_id,
            model_name = EXCLUDED.model_name,
            model_description = EXCLUDED.model_description,
            context_length = EXCLUDED.context_length,
            modality = EXCLUDED.modality,
            input_modalities = EXCLUDED.input_modalities,
            output_modalities = EXCLUDED.output_modalities,
            tokenizer = EXCLUDED.tokenizer,
            prompt_price = EXCLUDED.prompt_price,
            completion_price = EXCLUDED.completion_price,
            request_price = EXCLUDED.request_price,
            image_price = EXCLUDED.image_price,
            web_search_price = EXCLUDED.web_search_price,
            internal_reasoning_price = EXCLUDED.internal_reasoning_price,
            input_cache_read_price = EXCLUDED.input_cache_read_price,
            input_cache_write_price = EXCLUDED.input_cache_write_price,
            max_completion_tokens = EXCLUDED.max_completion_tokens,
            is_moderated = EXCLUDED.is_moderated,
            supported_parameters = EXCLUDED.supported_parameters,
            openrouter_last_seen = EXCLUDED.openrouter_last_seen,
            last_synced_at = EXCLUDED.last_synced_at,
            -- Handle status transitions: inactive -> new (preserve tier access), others keep existing status
            status = CASE 
                WHEN public.model_access.status = 'inactive' THEN 'new'
                WHEN public.model_access.status = 'disabled' THEN 'disabled'
                ELSE public.model_access.status
            END,
            -- Preserve existing tier access flags (is_free, is_pro, is_enterprise) for all updates
            -- These are not updated during sync - only via admin functions
            updated_at = NOW();

        -- Count if this was an insert or update, and track reactivations
        IF FOUND THEN
            count_models_updated := count_models_updated + 1;
            -- Check if this was a reactivation from inactive status
            IF previous_status = 'inactive' THEN
                count_models_reactivated := count_models_reactivated + 1;
            END IF;
        ELSE
            count_models_added := count_models_added + 1;
        END IF;
    END LOOP;

    -- Mark models as inactive if they're no longer in OpenRouter
    UPDATE public.model_access
    SET status = 'inactive', updated_at = NOW()
    WHERE model_id NOT IN (SELECT unnest(current_model_ids))
    AND status != 'inactive';

    GET DIAGNOSTICS count_models_marked_inactive = ROW_COUNT;

    -- Complete sync log
    UPDATE public.model_sync_log
    SET
        sync_status = 'completed',
        sync_completed_at = NOW(),
        models_added = count_models_added,
        models_updated = count_models_updated,
        models_marked_inactive = count_models_marked_inactive,
        models_reactivated = count_models_reactivated,
        duration_ms = EXTRACT(EPOCH FROM (NOW() - start_time)) * 1000
    WHERE id = sync_log_id;

    RETURN jsonb_build_object(
        'success', true,
        'sync_log_id', sync_log_id,
        'total_processed', total_models,
        'models_added', count_models_added,
        'models_updated', count_models_updated,
        'models_marked_inactive', count_models_marked_inactive,
        'models_reactivated', count_models_reactivated,
        'duration_ms', EXTRACT(EPOCH FROM (NOW() - start_time)) * 1000
    );

EXCEPTION WHEN OTHERS THEN
    -- Log error
    UPDATE public.model_sync_log
    SET
        sync_status = 'failed',
        sync_completed_at = NOW(),
        error_message = SQLERRM,
        error_details = jsonb_build_object('sqlstate', SQLSTATE),
        duration_ms = EXTRACT(EPOCH FROM (NOW() - start_time)) * 1000
    WHERE id = sync_log_id;

    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'sync_log_id', sync_log_id
    );
END;
$$;


ALTER FUNCTION "public"."sync_openrouter_models"("models_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_openrouter_models"("models_data" "jsonb", "p_added_by_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
    AS $$
DECLARE
    model_record JSONB;
    sync_log_id UUID;
    count_models_added INTEGER := 0;
    count_models_updated INTEGER := 0;
    count_models_marked_inactive INTEGER := 0;
    count_models_reactivated INTEGER := 0;
    total_models INTEGER;
    start_time TIMESTAMPTZ := NOW();
    current_model_ids TEXT[];
    previous_status VARCHAR(20);
    updated_rows INTEGER;
BEGIN
    -- Start sync log with attribution
    INSERT INTO public.model_sync_log (sync_status, total_openrouter_models, added_by_user_id)
    VALUES ('running', jsonb_array_length(models_data), p_added_by_user_id)
    RETURNING id INTO sync_log_id;

    -- Get total count
    total_models := jsonb_array_length(models_data);

    -- Collect all current model IDs from OpenRouter
    SELECT array_agg(model_element->>'id') INTO current_model_ids
    FROM jsonb_array_elements(models_data) AS model_element;

    -- Process each model from OpenRouter
    FOR model_record IN SELECT * FROM jsonb_array_elements(models_data)
    LOOP
        -- Capture previous status (if any) for reactivation tracking
        SELECT status INTO previous_status
        FROM public.model_access
        WHERE model_id = model_record->>'id';

        -- Try UPDATE first; preserves tier flags and handles inactive->new transition
        UPDATE public.model_access
        SET
            canonical_slug = model_record->>'canonical_slug',
            hugging_face_id = model_record->>'hugging_face_id',
            model_name = model_record->>'name',
            model_description = model_record->>'description',
            context_length = COALESCE((model_record->>'context_length')::integer, 8192),
            modality = model_record->'architecture'->>'modality',
            input_modalities = COALESCE(model_record->'architecture'->'input_modalities', '[]'::jsonb),
            output_modalities = COALESCE(model_record->'architecture'->'output_modalities', '[]'::jsonb),
            tokenizer = model_record->'architecture'->>'tokenizer',
            prompt_price = COALESCE(model_record->'pricing'->>'prompt', '0'),
            completion_price = COALESCE(model_record->'pricing'->>'completion', '0'),
            request_price = COALESCE(model_record->'pricing'->>'request', '0'),
            image_price = COALESCE(model_record->'pricing'->>'image', '0'),
            web_search_price = COALESCE(model_record->'pricing'->>'web_search', '0'),
            internal_reasoning_price = COALESCE(model_record->'pricing'->>'internal_reasoning', '0'),
            input_cache_read_price = model_record->'pricing'->>'input_cache_read',
            input_cache_write_price = model_record->'pricing'->>'input_cache_write',
            max_completion_tokens = (model_record->'top_provider'->>'max_completion_tokens')::integer,
            is_moderated = COALESCE((model_record->'top_provider'->>'is_moderated')::boolean, false),
            supported_parameters = COALESCE(model_record->'supported_parameters', '[]'::jsonb),
            openrouter_last_seen = NOW(),
            last_synced_at = NOW(),
            status = CASE
                WHEN previous_status = 'inactive' THEN 'new'
                WHEN previous_status = 'disabled' THEN 'disabled'
                ELSE status
            END,
            updated_at = NOW()
        WHERE model_id = model_record->>'id';

        GET DIAGNOSTICS updated_rows = ROW_COUNT;

        IF updated_rows > 0 THEN
            -- It was an update
            count_models_updated := count_models_updated + 1;
            IF previous_status = 'inactive' THEN
                count_models_reactivated := count_models_reactivated + 1;
            END IF;
        ELSE
            -- No existing row; perform INSERT
            INSERT INTO public.model_access (
                model_id,
                canonical_slug,
                hugging_face_id,
                model_name,
                model_description,
                context_length,
                created_timestamp,
                modality,
                input_modalities,
                output_modalities,
                tokenizer,
                prompt_price,
                completion_price,
                request_price,
                image_price,
                web_search_price,
                internal_reasoning_price,
                input_cache_read_price,
                input_cache_write_price,
                max_completion_tokens,
                is_moderated,
                supported_parameters,
                openrouter_last_seen,
                last_synced_at
            ) VALUES (
                model_record->>'id',
                model_record->>'canonical_slug',
                model_record->>'hugging_face_id',
                model_record->>'name',
                model_record->>'description',
                COALESCE((model_record->>'context_length')::integer, 8192),
                COALESCE((model_record->>'created')::bigint, extract(epoch from now())::bigint),
                model_record->'architecture'->>'modality',
                COALESCE(model_record->'architecture'->'input_modalities', '[]'::jsonb),
                COALESCE(model_record->'architecture'->'output_modalities', '[]'::jsonb),
                model_record->'architecture'->>'tokenizer',
                COALESCE(model_record->'pricing'->>'prompt', '0'),
                COALESCE(model_record->'pricing'->>'completion', '0'),
                COALESCE(model_record->'pricing'->>'request', '0'),
                COALESCE(model_record->'pricing'->>'image', '0'),
                COALESCE(model_record->'pricing'->>'web_search', '0'),
                COALESCE(model_record->'pricing'->>'internal_reasoning', '0'),
                model_record->'pricing'->>'input_cache_read',
                model_record->'pricing'->>'input_cache_write',
                (model_record->'top_provider'->>'max_completion_tokens')::integer,
                COALESCE((model_record->'top_provider'->>'is_moderated')::boolean, false),
                COALESCE(model_record->'supported_parameters', '[]'::jsonb),
                NOW(),
                NOW()
            );

            count_models_added := count_models_added + 1;
        END IF;
    END LOOP;

    -- Mark models as inactive if they're no longer in OpenRouter
    UPDATE public.model_access
    SET status = 'inactive', updated_at = NOW()
    WHERE model_id NOT IN (SELECT unnest(current_model_ids))
      AND status != 'inactive';

    GET DIAGNOSTICS count_models_marked_inactive = ROW_COUNT;

    -- Complete sync log
    UPDATE public.model_sync_log
    SET
        sync_status = 'completed',
        sync_completed_at = NOW(),
        models_added = count_models_added,
        models_updated = count_models_updated,
        models_marked_inactive = count_models_marked_inactive,
        models_reactivated = count_models_reactivated,
        duration_ms = EXTRACT(EPOCH FROM (NOW() - start_time)) * 1000
    WHERE id = sync_log_id;

    RETURN jsonb_build_object(
        'success', true,
        'sync_log_id', sync_log_id,
        'total_processed', total_models,
        'models_added', count_models_added,
        'models_updated', count_models_updated,
        'models_marked_inactive', count_models_marked_inactive,
        'models_reactivated', count_models_reactivated,
        'duration_ms', EXTRACT(EPOCH FROM (NOW() - start_time)) * 1000
    );

EXCEPTION WHEN OTHERS THEN
    -- Log error
    UPDATE public.model_sync_log
    SET
        sync_status = 'failed',
        sync_completed_at = NOW(),
        error_message = SQLERRM,
        error_details = jsonb_build_object('sqlstate', SQLSTATE),
        duration_ms = EXTRACT(EPOCH FROM (NOW() - start_time)) * 1000
    WHERE id = sync_log_id;

    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'sync_log_id', sync_log_id
    );
END;
$$;


ALTER FUNCTION "public"."sync_openrouter_models"("models_data" "jsonb", "p_added_by_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_openrouter_models"("models_data" "jsonb", "p_added_by_user_id" "uuid" DEFAULT NULL::"uuid", "p_external_start" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
    AS $$
DECLARE
    model_record JSONB;
    sync_log_id UUID;
    count_models_added INTEGER := 0;
    count_models_updated INTEGER := 0;
    count_models_marked_inactive INTEGER := 0;
    count_models_reactivated INTEGER := 0;
    total_models INTEGER;
    db_start_time TIMESTAMPTZ := NOW();
    effective_start TIMESTAMPTZ; -- earliest of external vs db start (if provided)
    current_model_ids TEXT[];
    previous_status VARCHAR(20);
    updated_rows INTEGER;
    total_duration_ms BIGINT;
    db_only_duration_ms BIGINT;
BEGIN
    -- Decide effective start (use external if provided and earlier)
    IF p_external_start IS NOT NULL AND p_external_start < db_start_time THEN
        effective_start := p_external_start;
    ELSE
        effective_start := db_start_time;
    END IF;

    -- Start sync log (store sync_started_at = effective start for consistency)
    INSERT INTO public.model_sync_log (sync_status, total_openrouter_models, added_by_user_id, sync_started_at)
    VALUES ('running', jsonb_array_length(models_data), p_added_by_user_id, effective_start)
    RETURNING id INTO sync_log_id;

    total_models := jsonb_array_length(models_data);

    -- Collect all current model IDs from OpenRouter
    SELECT array_agg(model_element->>'id') INTO current_model_ids
    FROM jsonb_array_elements(models_data) AS model_element;

    FOR model_record IN SELECT * FROM jsonb_array_elements(models_data)
    LOOP
        SELECT status INTO previous_status
        FROM public.model_access
        WHERE model_id = model_record->>'id';

        UPDATE public.model_access
        SET
            canonical_slug = model_record->>'canonical_slug',
            hugging_face_id = model_record->>'hugging_face_id',
            model_name = model_record->>'name',
            model_description = model_record->>'description',
            context_length = COALESCE((model_record->>'context_length')::integer, 8192),
            modality = model_record->'architecture'->>'modality',
            input_modalities = COALESCE(model_record->'architecture'->'input_modalities', '[]'::jsonb),
            output_modalities = COALESCE(model_record->'architecture'->'output_modalities', '[]'::jsonb),
            tokenizer = model_record->'architecture'->>'tokenizer',
            prompt_price = COALESCE(model_record->'pricing'->>'prompt', '0'),
            completion_price = COALESCE(model_record->'pricing'->>'completion', '0'),
            request_price = COALESCE(model_record->'pricing'->>'request', '0'),
            image_price = COALESCE(model_record->'pricing'->>'image', '0'),
            web_search_price = COALESCE(model_record->'pricing'->>'web_search', '0'),
            internal_reasoning_price = COALESCE(model_record->'pricing'->>'internal_reasoning', '0'),
            input_cache_read_price = model_record->'pricing'->>'input_cache_read',
            input_cache_write_price = model_record->'pricing'->>'input_cache_write',
            max_completion_tokens = (model_record->'top_provider'->>'max_completion_tokens')::integer,
            is_moderated = COALESCE((model_record->'top_provider'->>'is_moderated')::boolean, false),
            supported_parameters = COALESCE(model_record->'supported_parameters', '[]'::jsonb),
            openrouter_last_seen = NOW(),
            last_synced_at = NOW(),
            status = CASE
                WHEN previous_status = 'inactive' THEN 'new'
                WHEN previous_status = 'disabled' THEN 'disabled'
                ELSE status
            END,
            updated_at = NOW()
        WHERE model_id = model_record->>'id';

        GET DIAGNOSTICS updated_rows = ROW_COUNT;

        IF updated_rows > 0 THEN
            count_models_updated := count_models_updated + 1;
            IF previous_status = 'inactive' THEN
                count_models_reactivated := count_models_reactivated + 1;
            END IF;
        ELSE
            INSERT INTO public.model_access (
                model_id,
                canonical_slug,
                hugging_face_id,
                model_name,
                model_description,
                context_length,
                created_timestamp,
                modality,
                input_modalities,
                output_modalities,
                tokenizer,
                prompt_price,
                completion_price,
                request_price,
                image_price,
                web_search_price,
                internal_reasoning_price,
                input_cache_read_price,
                input_cache_write_price,
                max_completion_tokens,
                is_moderated,
                supported_parameters,
                openrouter_last_seen,
                last_synced_at
            ) VALUES (
                model_record->>'id',
                model_record->>'canonical_slug',
                model_record->>'hugging_face_id',
                model_record->>'name',
                model_record->>'description',
                COALESCE((model_record->>'context_length')::integer, 8192),
                COALESCE((model_record->>'created')::bigint, extract(epoch from now())::bigint),
                model_record->'architecture'->>'modality',
                COALESCE(model_record->'architecture'->'input_modalities', '[]'::jsonb),
                COALESCE(model_record->'architecture'->'output_modalities', '[]'::jsonb),
                model_record->'architecture'->>'tokenizer',
                COALESCE(model_record->'pricing'->>'prompt', '0'),
                COALESCE(model_record->'pricing'->>'completion', '0'),
                COALESCE(model_record->'pricing'->>'request', '0'),
                COALESCE(model_record->'pricing'->>'image', '0'),
                COALESCE(model_record->'pricing'->>'web_search', '0'),
                COALESCE(model_record->'pricing'->>'internal_reasoning', '0'),
                model_record->'pricing'->>'input_cache_read',
                model_record->'pricing'->>'input_cache_write',
                (model_record->'top_provider'->>'max_completion_tokens')::integer,
                COALESCE((model_record->'top_provider'->>'is_moderated')::boolean, false),
                COALESCE(model_record->'supported_parameters', '[]'::jsonb),
                NOW(),
                NOW()
            );

            count_models_added := count_models_added + 1;
        END IF;
    END LOOP;

    -- Mark inactive
    UPDATE public.model_access
    SET status = 'inactive', updated_at = NOW()
    WHERE model_id NOT IN (SELECT unnest(current_model_ids))
      AND status != 'inactive';

    GET DIAGNOSTICS count_models_marked_inactive = ROW_COUNT;

    -- Compute durations
    db_only_duration_ms := CEIL(EXTRACT(EPOCH FROM (NOW() - db_start_time)) * 1000)::bigint;
    total_duration_ms := CEIL(EXTRACT(EPOCH FROM (NOW() - effective_start)) * 1000)::bigint;

    UPDATE public.model_sync_log
    SET
        sync_status = 'completed',
        sync_completed_at = NOW(),
        models_added = count_models_added,
        models_updated = count_models_updated,
        models_marked_inactive = count_models_marked_inactive,
        models_reactivated = count_models_reactivated,
        duration_ms = total_duration_ms,
        db_duration_ms = db_only_duration_ms
    WHERE id = sync_log_id;

    RETURN jsonb_build_object(
        'success', true,
        'sync_log_id', sync_log_id,
        'total_processed', total_models,
        'models_added', count_models_added,
        'models_updated', count_models_updated,
        'models_marked_inactive', count_models_marked_inactive,
        'models_reactivated', count_models_reactivated,
        'duration_ms', total_duration_ms,
        'db_duration_ms', db_only_duration_ms
    );

EXCEPTION WHEN OTHERS THEN
    db_only_duration_ms := CEIL(EXTRACT(EPOCH FROM (NOW() - db_start_time)) * 1000)::bigint;
    total_duration_ms := CEIL(EXTRACT(EPOCH FROM (NOW() - effective_start)) * 1000)::bigint;

    UPDATE public.model_sync_log
    SET
        sync_status = 'failed',
        sync_completed_at = NOW(),
        error_message = SQLERRM,
        error_details = jsonb_build_object('sqlstate', SQLSTATE),
        duration_ms = total_duration_ms,
        db_duration_ms = db_only_duration_ms
    WHERE id = sync_log_id;

    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'sync_log_id', sync_log_id,
        'duration_ms', total_duration_ms,
        'db_duration_ms', db_only_duration_ms
    );
END;
$$;


ALTER FUNCTION "public"."sync_openrouter_models"("models_data" "jsonb", "p_added_by_user_id" "uuid", "p_external_start" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_session_creation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog, public'
    AS $$
BEGIN
    PERFORM public.track_user_usage(
        NEW.user_id,
        0, 0, 0, 0,
        NULL,
        true,
        0
    );
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."track_session_creation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_user_usage"("p_user_id" "uuid", "p_messages_sent" integer DEFAULT 0, "p_messages_received" integer DEFAULT 0, "p_input_tokens" integer DEFAULT 0, "p_output_tokens" integer DEFAULT 0, "p_model_used" character varying DEFAULT NULL::character varying, "p_session_created" boolean DEFAULT false, "p_generation_ms" bigint DEFAULT 0) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
    AS $$
DECLARE
    today_date DATE := CURRENT_DATE;
    model_usage JSONB;
BEGIN
    SELECT models_used INTO model_usage
    FROM public.user_usage_daily
    WHERE user_id = p_user_id AND usage_date = today_date;

    IF p_model_used IS NOT NULL THEN
        IF model_usage IS NULL THEN
            model_usage := jsonb_build_object(p_model_used, 1);
        ELSE
            model_usage := jsonb_set(
                model_usage,
                ARRAY[p_model_used],
                (COALESCE((model_usage->>p_model_used)::integer, 0) + 1)::text::jsonb
            );
        END IF;
    END IF;

    INSERT INTO public.user_usage_daily (
        user_id, usage_date, messages_sent, messages_received,
        input_tokens, output_tokens, total_tokens, models_used,
        sessions_created, generation_ms
    ) VALUES (
        p_user_id, today_date, p_messages_sent, p_messages_received,
        p_input_tokens, p_output_tokens, p_input_tokens + p_output_tokens,
        COALESCE(model_usage, '{}'::jsonb),
        CASE WHEN p_session_created THEN 1 ELSE 0 END,
        p_generation_ms
    )
    ON CONFLICT (user_id, usage_date) DO UPDATE SET
        messages_sent = public.user_usage_daily.messages_sent + EXCLUDED.messages_sent,
        messages_received = public.user_usage_daily.messages_received + EXCLUDED.messages_received,
        input_tokens = public.user_usage_daily.input_tokens + EXCLUDED.input_tokens,
        output_tokens = public.user_usage_daily.output_tokens + EXCLUDED.output_tokens,
        total_tokens = public.user_usage_daily.total_tokens + EXCLUDED.total_tokens,
        models_used = COALESCE(EXCLUDED.models_used, public.user_usage_daily.models_used),
        sessions_created = public.user_usage_daily.sessions_created + EXCLUDED.sessions_created,
        generation_ms = public.user_usage_daily.generation_ms + EXCLUDED.generation_ms,
        updated_at = NOW();

    UPDATE public.profiles SET
        usage_stats = jsonb_set(
            jsonb_set(
                jsonb_set(
                    usage_stats,
                    '{total_messages}',
                    ((COALESCE((usage_stats->>'total_messages')::integer, 0) + p_messages_sent + p_messages_received))::text::jsonb
                ),
                '{total_tokens}',
                ((COALESCE((usage_stats->>'total_tokens')::integer, 0) + p_input_tokens + p_output_tokens))::text::jsonb
            ),
            '{sessions_created}',
            ((COALESCE((usage_stats->>'sessions_created')::integer, 0) + CASE WHEN p_session_created THEN 1 ELSE 0 END))::text::jsonb
        ),
        last_active = NOW()
    WHERE id = p_user_id;
END;
$$;


ALTER FUNCTION "public"."track_user_usage"("p_user_id" "uuid", "p_messages_sent" integer, "p_messages_received" integer, "p_input_tokens" integer, "p_output_tokens" integer, "p_model_used" character varying, "p_session_created" boolean, "p_generation_ms" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unban_user"("p_user_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_updated int := 0;
BEGIN
  -- Require admin unless running with elevated service role
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin privileges required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
     SET is_banned = false,
         banned_until = NULL,
         ban_reason = NULL,
         updated_at = now()
   WHERE id = p_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  INSERT INTO public.moderation_actions(user_id, action, reason, metadata, created_by)
  VALUES (
    p_user_id,
    'unbanned',
    p_reason,
    '{}'::jsonb,
    auth.uid()
  );

  PERFORM public.log_user_activity(
    p_user_id,
    'user_unbanned',
    'profile',
    p_user_id::text,
    '{}'::jsonb
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'action', 'unbanned',
    'updated_at', now()
  );
END;
$$;


ALTER FUNCTION "public"."unban_user"("p_user_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_model_tier_access"("p_model_id" character varying, "p_is_free" boolean DEFAULT NULL::boolean, "p_is_pro" boolean DEFAULT NULL::boolean, "p_is_enterprise" boolean DEFAULT NULL::boolean, "p_status" character varying DEFAULT NULL::character varying) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
    AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    -- Validate status if provided
    IF p_status IS NOT NULL AND p_status NOT IN ('active', 'inactive', 'disabled', 'new') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid status. Must be: active, inactive, disabled, or new'
        );
    END IF;

    -- Update model access
    UPDATE public.model_access
    SET
        is_free = COALESCE(p_is_free, is_free),
        is_pro = COALESCE(p_is_pro, is_pro),
        is_enterprise = COALESCE(p_is_enterprise, is_enterprise),
        status = COALESCE(p_status, status),
        updated_at = NOW()
    WHERE model_id = p_model_id;

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    IF updated_count = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Model not found'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'model_id', p_model_id,
        'updated_at', NOW()
    );
END;
$$;


ALTER FUNCTION "public"."update_model_tier_access"("p_model_id" character varying, "p_is_free" boolean, "p_is_pro" boolean, "p_is_enterprise" boolean, "p_status" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_session_stats"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog, public'
    AS $$
DECLARE
    session_stats RECORD;
    total_input_tokens INTEGER := 0;
    total_output_tokens INTEGER := 0;
BEGIN
    -- Determine which session to update
    IF TG_OP = 'DELETE' THEN
        -- Use OLD record for DELETE operations (exclude error messages)
        SELECT
            COUNT(*) as msg_count,
            COALESCE(SUM(total_tokens), 0) as token_sum,
            COALESCE(SUM(input_tokens), 0) as input_sum,
            COALESCE(SUM(output_tokens), 0) as output_sum,
            MAX(message_timestamp) as last_msg_time,
            (SELECT content FROM public.chat_messages
             WHERE session_id = OLD.session_id
             AND (error_message IS NULL OR error_message = '')
             ORDER BY message_timestamp DESC
             LIMIT 1) as last_preview,
            (SELECT model FROM public.chat_messages
             WHERE session_id = OLD.session_id
             AND (error_message IS NULL OR error_message = '')
             ORDER BY message_timestamp DESC
             LIMIT 1) as last_model_used
        INTO session_stats
        FROM public.chat_messages
        WHERE session_id = OLD.session_id
        AND (error_message IS NULL OR error_message = '');

        total_input_tokens := session_stats.input_sum;
        total_output_tokens := session_stats.output_sum;

        -- Update the session
        UPDATE public.chat_sessions
        SET
            message_count = session_stats.msg_count,
            total_tokens = session_stats.token_sum,
            last_message_timestamp = session_stats.last_msg_time,
            last_message_preview = LEFT(session_stats.last_preview, 200),
            last_model = session_stats.last_model_used,
            last_activity = NOW(),
            updated_at = NOW()
        WHERE id = OLD.session_id;
    ELSE
        -- INSERT or UPDATE operations (exclude error messages)
        SELECT
            COUNT(*) as msg_count,
            COALESCE(SUM(total_tokens), 0) as token_sum,
            COALESCE(SUM(input_tokens), 0) as input_sum,
            COALESCE(SUM(output_tokens), 0) as output_sum,
            MAX(message_timestamp) as last_msg_time,
            (SELECT content FROM public.chat_messages
             WHERE session_id = NEW.session_id
             AND (error_message IS NULL OR error_message = '')
             ORDER BY message_timestamp DESC
             LIMIT 1) as last_preview,
            (SELECT model FROM public.chat_messages
             WHERE session_id = NEW.session_id
             AND (error_message IS NULL OR error_message = '')
             ORDER BY message_timestamp DESC
             LIMIT 1) as last_model_used
        INTO session_stats
        FROM public.chat_messages
        WHERE session_id = NEW.session_id
        AND (error_message IS NULL OR error_message = '');

        total_input_tokens := session_stats.input_sum;
        total_output_tokens := session_stats.output_sum;

        -- Update the session
        UPDATE public.chat_sessions
        SET
            message_count = session_stats.msg_count,
            total_tokens = session_stats.token_sum,
            last_message_timestamp = session_stats.last_msg_time,
            last_message_preview = LEFT(session_stats.last_preview, 200),
            last_model = session_stats.last_model_used,
            last_activity = NOW(),
            updated_at = NOW()
        WHERE id = NEW.session_id;

        -- Only track usage for successful messages on INSERT (avoid UPDATE double-counting)
        IF TG_OP = 'INSERT' AND NEW.role IN ('user', 'assistant')
           AND (NEW.error_message IS NULL OR NEW.error_message = '') THEN
            PERFORM public.track_user_usage(
                (SELECT user_id FROM public.chat_sessions WHERE id = NEW.session_id),
                CASE WHEN NEW.role = 'user' THEN 1 ELSE 0 END, -- messages_sent
                CASE WHEN NEW.role = 'assistant' THEN 1 ELSE 0 END, -- messages_received
                CASE WHEN NEW.role = 'user' THEN COALESCE(NEW.input_tokens, 0) ELSE 0 END, -- input_tokens
                CASE WHEN NEW.role = 'assistant' THEN COALESCE(NEW.output_tokens, 0) ELSE 0 END, -- output_tokens
                NEW.model, -- model_used
                false, -- session_created
                CASE WHEN NEW.role = 'assistant' THEN COALESCE(NEW.elapsed_ms, 0) ELSE 0 END -- generation_ms (ms)
            );
        END IF;
    END IF;

    -- Return appropriate record
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;


ALTER FUNCTION "public"."update_session_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_session_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog, public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.last_activity = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_session_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog, public'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    
    -- Initialize last_reset timestamp if it's a new profile
    IF TG_OP = 'INSERT' THEN
        NEW.usage_stats = NEW.usage_stats || jsonb_build_object('last_reset', NOW()::text);
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_tier"("user_uuid" "uuid", "new_tier" character varying) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
    AS $$
DECLARE
    old_tier VARCHAR(20);
    updated_count INTEGER := 0;
BEGIN
    -- Validate tier (admin tier is managed via profiles.account_type)
    IF new_tier NOT IN ('free', 'pro', 'enterprise') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid tier. Must be: free, pro, or enterprise'
        );
    END IF;

    -- Capture previous tier (for logging) and ensure user existence
    SELECT subscription_tier INTO old_tier
    FROM public.profiles
    WHERE id = user_uuid;

    -- Update subscription_tier
    UPDATE public.profiles
    SET subscription_tier = new_tier,
        updated_at = NOW()
    WHERE id = user_uuid;

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    IF updated_count = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found'
        );
    END IF;

    -- Log the tier change
    PERFORM public.log_user_activity(
        user_uuid,
        'tier_updated',
        'profile',
        user_uuid::text,
        jsonb_build_object(
            'old_tier', old_tier,
            'new_tier', new_tier
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'old_tier', old_tier,
        'new_tier', new_tier,
        'updated_at', NOW()
    );
END;
$$;


ALTER FUNCTION "public"."update_user_tier"("user_uuid" "uuid", "new_tier" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."write_admin_audit"("p_actor_user_id" "uuid", "p_action" "text", "p_target" "text", "p_payload" "jsonb" DEFAULT NULL::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, public'
    AS $$
BEGIN
  INSERT INTO public.admin_audit_log(actor_user_id, action, target, payload)
  VALUES (p_actor_user_id, p_action, p_target, p_payload);
END;
$$;


ALTER FUNCTION "public"."write_admin_audit"("p_actor_user_id" "uuid", "p_action" "text", "p_target" "text", "p_payload" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_user_id" "uuid",
    "action" "text" NOT NULL,
    "target" "text" NOT NULL,
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."admin_audit_log" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_audit_log" OWNER TO "postgres";


COMMENT ON COLUMN "public"."admin_audit_log"."actor_user_id" IS 'Nullable: NULL indicates a system/scheduled action (no human actor)';



CREATE TABLE IF NOT EXISTS "public"."anonymous_error_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "anon_hash" "text" NOT NULL,
    "event_timestamp" timestamp with time zone NOT NULL,
    "model" character varying(100) NOT NULL,
    "http_status" integer,
    "error_code" "text",
    "error_message" "text",
    "provider" "text",
    "provider_request_id" "text",
    "completion_id" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."anonymous_error_events" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."anonymous_error_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."anonymous_model_usage_daily" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usage_date" "date" NOT NULL,
    "model_id" character varying(100) NOT NULL,
    "prompt_tokens" integer DEFAULT 0 NOT NULL,
    "completion_tokens" integer DEFAULT 0 NOT NULL,
    "total_tokens" integer GENERATED ALWAYS AS (("prompt_tokens" + "completion_tokens")) STORED,
    "assistant_messages" integer DEFAULT 0 NOT NULL,
    "generation_ms" bigint DEFAULT 0 NOT NULL,
    "prompt_unit_price" numeric(12,8),
    "completion_unit_price" numeric(12,8),
    "estimated_cost" numeric(12,6) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."anonymous_model_usage_daily" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."anonymous_model_usage_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."anonymous_usage_daily" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "anon_hash" "text" NOT NULL,
    "usage_date" "date" NOT NULL,
    "messages_sent" integer DEFAULT 0 NOT NULL,
    "messages_received" integer DEFAULT 0 NOT NULL,
    "input_tokens" integer DEFAULT 0 NOT NULL,
    "output_tokens" integer DEFAULT 0 NOT NULL,
    "generation_ms" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "total_tokens" integer GENERATED ALWAYS AS (("input_tokens" + "output_tokens")) STORED
);

ALTER TABLE ONLY "public"."anonymous_usage_daily" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."anonymous_usage_daily" OWNER TO "postgres";


COMMENT ON TABLE "public"."anonymous_usage_daily" IS 'Daily aggregates of anonymous usage keyed by anon_hash; no PII; admin-only read.';



CREATE TABLE IF NOT EXISTS "public"."chat_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_id" "text",
    "message_id" "text",
    "kind" "text" NOT NULL,
    "mime" "text" NOT NULL,
    "size_bytes" bigint NOT NULL,
    "storage_bucket" "text" DEFAULT 'attachments-images'::"text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "draft_id" "text",
    "width" integer,
    "height" integer,
    "checksum" "text",
    "status" "text" DEFAULT 'ready'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "chat_attachments_kind_check" CHECK (("kind" = 'image'::"text")),
    CONSTRAINT "chat_attachments_mime_check" CHECK (("mime" = ANY (ARRAY['image/png'::"text", 'image/jpeg'::"text", 'image/webp'::"text"]))),
    CONSTRAINT "chat_attachments_size_bytes_check" CHECK (("size_bytes" > 0)),
    CONSTRAINT "chat_attachments_status_check" CHECK (("status" = ANY (ARRAY['ready'::"text", 'deleted'::"text"])))
);


ALTER TABLE "public"."chat_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_message_annotations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_id" "text" NOT NULL,
    "message_id" "text" NOT NULL,
    "annotation_type" "text" NOT NULL,
    "url" "text" NOT NULL,
    "title" "text",
    "content" "text",
    "start_index" integer,
    "end_index" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chat_message_annotations_annotation_type_check" CHECK (("annotation_type" = 'url_citation'::"text")),
    CONSTRAINT "chat_message_annotations_check" CHECK (((("start_index" IS NULL) AND ("end_index" IS NULL)) OR (("start_index" >= 0) AND ("end_index" >= "start_index"))))
);


ALTER TABLE "public"."chat_message_annotations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "text" NOT NULL,
    "session_id" "text" NOT NULL,
    "role" character varying(20) NOT NULL,
    "content" "text" NOT NULL,
    "model" character varying(100),
    "total_tokens" integer DEFAULT 0,
    "message_timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "error_message" "text",
    "is_streaming" boolean DEFAULT false,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "content_type" character varying(20) DEFAULT 'text'::character varying,
    "completion_id" character varying(255),
    "input_tokens" integer DEFAULT 0,
    "output_tokens" integer DEFAULT 0,
    "user_message_id" "text",
    "elapsed_ms" integer DEFAULT 0,
    "has_attachments" boolean DEFAULT false NOT NULL,
    "attachment_count" integer DEFAULT 0 NOT NULL,
    "has_websearch" boolean DEFAULT false NOT NULL,
    "websearch_result_count" integer DEFAULT 0 NOT NULL,
    "reasoning" "text",
    "reasoning_details" "jsonb",
    "output_image_tokens" integer DEFAULT 0,
    CONSTRAINT "chat_messages_attachment_count_max3" CHECK ((("attachment_count" >= 0) AND ("attachment_count" <= 3))),
    CONSTRAINT "chat_messages_content_type_check" CHECK ((("content_type")::"text" = ANY (ARRAY[('text'::character varying)::"text", ('markdown'::character varying)::"text"]))),
    CONSTRAINT "chat_messages_role_check" CHECK ((("role")::"text" = ANY (ARRAY[('user'::character varying)::"text", ('assistant'::character varying)::"text", ('system'::character varying)::"text"]))),
    CONSTRAINT "chat_messages_websearch_result_count_check" CHECK ((("websearch_result_count" >= 0) AND ("websearch_result_count" <= 50)))
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


COMMENT ON COLUMN "public"."chat_messages"."elapsed_ms" IS 'Per-message assistant generation latency in milliseconds.';



CREATE TABLE IF NOT EXISTS "public"."chat_sessions" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" character varying(255) DEFAULT 'New Chat'::character varying NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_activity" timestamp with time zone DEFAULT "now"() NOT NULL,
    "message_count" integer DEFAULT 0 NOT NULL,
    "total_tokens" integer DEFAULT 0 NOT NULL,
    "last_model" character varying(100),
    "last_message_preview" "text",
    "last_message_timestamp" timestamp with time zone
);


ALTER TABLE "public"."chat_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cta_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "page" "text" NOT NULL,
    "cta_id" "text" NOT NULL,
    "location" "text",
    "is_authenticated" boolean DEFAULT false NOT NULL,
    "user_id" "uuid",
    "ip_hash" "text",
    "meta" "jsonb"
);


ALTER TABLE "public"."cta_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_token_costs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_id" "text" NOT NULL,
    "assistant_message_id" "text" NOT NULL,
    "user_message_id" "text",
    "completion_id" character varying(255),
    "model_id" character varying(100),
    "message_timestamp" timestamp with time zone NOT NULL,
    "prompt_tokens" integer DEFAULT 0 NOT NULL,
    "completion_tokens" integer DEFAULT 0 NOT NULL,
    "prompt_unit_price" numeric(12,8),
    "completion_unit_price" numeric(12,8),
    "image_units" integer DEFAULT 0 NOT NULL,
    "image_unit_price" numeric(12,8),
    "prompt_cost" numeric(12,6),
    "completion_cost" numeric(12,6),
    "image_cost" numeric(12,6),
    "total_cost" numeric(12,6),
    "pricing_source" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "elapsed_ms" integer DEFAULT 0,
    "websearch_cost" numeric(12,6),
    "output_image_cost" numeric(12,6) DEFAULT 0,
    "output_image_tokens" integer DEFAULT 0,
    "output_image_units_price" numeric(12,8) DEFAULT 0,
    "total_tokens" integer GENERATED ALWAYS AS ((("prompt_tokens" + "completion_tokens") + COALESCE("output_image_tokens", 0))) STORED
);


ALTER TABLE "public"."message_token_costs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."message_token_costs"."elapsed_ms" IS 'Assistant message generation latency in milliseconds (total wall-clock).';



CREATE TABLE IF NOT EXISTS "public"."model_access" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "model_id" character varying(100) NOT NULL,
    "canonical_slug" character varying(255),
    "hugging_face_id" character varying(255),
    "model_name" character varying(255) NOT NULL,
    "model_description" "text",
    "context_length" integer DEFAULT 8192,
    "created_timestamp" bigint,
    "modality" character varying(50),
    "input_modalities" "jsonb" DEFAULT '[]'::"jsonb",
    "output_modalities" "jsonb" DEFAULT '[]'::"jsonb",
    "tokenizer" character varying(100),
    "prompt_price" character varying(32) DEFAULT '0'::character varying,
    "completion_price" character varying(32) DEFAULT '0'::character varying,
    "request_price" character varying(32) DEFAULT '0'::character varying,
    "image_price" character varying(32) DEFAULT '0'::character varying,
    "web_search_price" character varying(32) DEFAULT '0'::character varying,
    "internal_reasoning_price" character varying(32) DEFAULT '0'::character varying,
    "input_cache_read_price" character varying(32),
    "input_cache_write_price" character varying(32),
    "max_completion_tokens" integer,
    "is_moderated" boolean DEFAULT false,
    "supported_parameters" "jsonb" DEFAULT '[]'::"jsonb",
    "status" character varying(20) DEFAULT 'new'::character varying,
    "is_free" boolean DEFAULT false,
    "is_pro" boolean DEFAULT false,
    "is_enterprise" boolean DEFAULT false,
    "daily_limit" integer,
    "monthly_limit" integer,
    "last_synced_at" timestamp with time zone DEFAULT "now"(),
    "openrouter_last_seen" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "output_image_price" character varying(32) DEFAULT '0'::character varying,
    CONSTRAINT "model_access_status_check" CHECK ((("status")::"text" = ANY (ARRAY[('active'::character varying)::"text", ('inactive'::character varying)::"text", ('disabled'::character varying)::"text", ('new'::character varying)::"text"])))
);

ALTER TABLE ONLY "public"."model_access" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."model_access" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."moderation_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "moderation_actions_action_check" CHECK (("action" = ANY (ARRAY['warned'::"text", 'banned'::"text", 'unbanned'::"text", 'temporary_ban'::"text"])))
);


ALTER TABLE "public"."moderation_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" character varying(255) NOT NULL,
    "full_name" character varying(255),
    "avatar_url" "text",
    "default_model" character varying(100),
    "temperature" numeric(3,2) DEFAULT 0.7,
    "system_prompt" "text" DEFAULT 'You are a helpful AI assistant.'::"text",
    "subscription_tier" character varying(20) DEFAULT 'free'::character varying,
    "credits" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_active" timestamp with time zone DEFAULT "now"(),
    "usage_stats" "jsonb" DEFAULT '{"total_tokens": 0, "total_messages": 0, "sessions_created": 0}'::"jsonb",
    "ui_preferences" "jsonb" DEFAULT '{"theme": "dark", "auto_save": true, "sidebar_width": 280, "show_token_count": true, "code_highlighting": true}'::"jsonb",
    "session_preferences" "jsonb" DEFAULT '{"auto_title": true, "max_history": 10, "save_anonymous": false}'::"jsonb",
    "account_type" "text" DEFAULT 'user'::"text" NOT NULL,
    "is_banned" boolean DEFAULT false NOT NULL,
    "banned_at" timestamp with time zone,
    "banned_until" timestamp with time zone,
    "ban_reason" "text",
    "violation_strikes" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "chk_banned_until_after_banned_at" CHECK ((("banned_until" IS NULL) OR ("banned_at" IS NULL) OR ("banned_until" > "banned_at"))),
    CONSTRAINT "chk_violation_strikes_nonnegative" CHECK (("violation_strikes" >= 0)),
    CONSTRAINT "profiles_account_type_check" CHECK (("account_type" = ANY (ARRAY['user'::"text", 'admin'::"text"]))),
    CONSTRAINT "profiles_subscription_tier_check" CHECK ((("subscription_tier")::"text" = ANY (ARRAY[('free'::character varying)::"text", ('pro'::character varying)::"text", ('enterprise'::character varying)::"text"]))),
    CONSTRAINT "profiles_temperature_check" CHECK ((("temperature" >= 0.0) AND ("temperature" <= 2.0)))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" character varying(50) NOT NULL,
    "resource_type" character varying(50),
    "resource_id" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip_address" "inet",
    "user_agent" "text"
);


ALTER TABLE "public"."user_activity_log" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."user_model_costs_daily" WITH ("security_invoker"='true') AS
 SELECT "user_id",
    (("message_timestamp" AT TIME ZONE 'UTC'::"text"))::"date" AS "usage_date",
    "model_id",
    "sum"("prompt_tokens") AS "prompt_tokens",
    "sum"("completion_tokens") AS "completion_tokens",
    "sum"("total_tokens") AS "total_tokens",
    "round"("sum"("total_cost"), 6) AS "total_cost",
    "count"(*) AS "assistant_messages"
   FROM "public"."message_token_costs"
  GROUP BY "user_id", ((("message_timestamp" AT TIME ZONE 'UTC'::"text"))::"date"), "model_id";


ALTER VIEW "public"."user_model_costs_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_usage_daily" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "usage_date" "date" NOT NULL,
    "messages_sent" integer DEFAULT 0,
    "messages_received" integer DEFAULT 0,
    "input_tokens" integer DEFAULT 0,
    "output_tokens" integer DEFAULT 0,
    "total_tokens" integer DEFAULT 0,
    "models_used" "jsonb" DEFAULT '{}'::"jsonb",
    "sessions_created" integer DEFAULT 0,
    "estimated_cost" numeric(12,6) DEFAULT 0.000000,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "generation_ms" bigint DEFAULT 0
);


ALTER TABLE "public"."user_usage_daily" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_usage_daily"."generation_ms" IS 'Aggregated assistant generation time in milliseconds for the day.';



CREATE OR REPLACE VIEW "public"."v_model_counts_public" WITH ("security_invoker"='true') AS
 SELECT "count"(*) FILTER (WHERE (("status")::"text" = 'new'::"text")) AS "new_count",
    "count"(*) FILTER (WHERE (("status")::"text" = 'active'::"text")) AS "active_count",
    "count"(*) FILTER (WHERE (("status")::"text" = 'inactive'::"text")) AS "inactive_count",
    "count"(*) FILTER (WHERE (("status")::"text" = 'disabled'::"text")) AS "disabled_count",
    "count"(*) AS "total_count"
   FROM "public"."model_access";


ALTER VIEW "public"."v_model_counts_public" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_model_sync_activity_daily" WITH ("security_invoker"='true') AS
 SELECT "date_trunc"('day'::"text", COALESCE("sync_completed_at", "sync_started_at")) AS "day",
    "sum"("models_added") AS "models_added",
    "sum"("models_marked_inactive") AS "models_marked_inactive",
    "sum"("models_reactivated") AS "models_reactivated",
    "count"(*) AS "runs"
   FROM "public"."model_sync_log"
  WHERE ((("sync_status")::"text" = 'completed'::"text") AND (COALESCE("sync_completed_at", "sync_started_at") >= ("now"() - '30 days'::interval)))
  GROUP BY ("date_trunc"('day'::"text", COALESCE("sync_completed_at", "sync_started_at")));


ALTER VIEW "public"."v_model_sync_activity_daily" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anonymous_error_events"
    ADD CONSTRAINT "anonymous_error_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anonymous_model_usage_daily"
    ADD CONSTRAINT "anonymous_model_usage_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."anonymous_model_usage_daily"
    ADD CONSTRAINT "anonymous_model_usage_daily_usage_date_model_id_key" UNIQUE ("usage_date", "model_id");



ALTER TABLE ONLY "public"."anonymous_usage_daily"
    ADD CONSTRAINT "anonymous_usage_daily_anon_hash_usage_date_key" UNIQUE ("anon_hash", "usage_date");



ALTER TABLE ONLY "public"."anonymous_usage_daily"
    ADD CONSTRAINT "anonymous_usage_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_attachments"
    ADD CONSTRAINT "chat_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_message_annotations"
    ADD CONSTRAINT "chat_message_annotations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cta_events"
    ADD CONSTRAINT "cta_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_token_costs"
    ADD CONSTRAINT "message_token_costs_assistant_message_id_key" UNIQUE ("assistant_message_id");



ALTER TABLE ONLY "public"."message_token_costs"
    ADD CONSTRAINT "message_token_costs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."model_access"
    ADD CONSTRAINT "model_access_model_id_key" UNIQUE ("model_id");



ALTER TABLE ONLY "public"."model_access"
    ADD CONSTRAINT "model_access_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."model_sync_log"
    ADD CONSTRAINT "model_sync_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."moderation_actions"
    ADD CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_attachments"
    ADD CONSTRAINT "uq_chat_attachments_bucket_path" UNIQUE ("storage_bucket", "storage_path");



ALTER TABLE ONLY "public"."user_activity_log"
    ADD CONSTRAINT "user_activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_usage_daily"
    ADD CONSTRAINT "user_usage_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_usage_daily"
    ADD CONSTRAINT "user_usage_daily_user_id_usage_date_key" UNIQUE ("user_id", "usage_date");



CREATE INDEX "idx_activity_log_action" ON "public"."user_activity_log" USING "btree" ("action");



CREATE INDEX "idx_activity_log_timestamp" ON "public"."user_activity_log" USING "btree" ("timestamp");



CREATE INDEX "idx_activity_log_user_id" ON "public"."user_activity_log" USING "btree" ("user_id");



CREATE INDEX "idx_admin_audit_log_action" ON "public"."admin_audit_log" USING "btree" ("action", "created_at" DESC);



CREATE INDEX "idx_admin_audit_log_actor" ON "public"."admin_audit_log" USING "btree" ("actor_user_id", "created_at" DESC);



CREATE INDEX "idx_anon_errors_hash_time" ON "public"."anonymous_error_events" USING "btree" ("anon_hash", "event_timestamp" DESC);



CREATE INDEX "idx_anon_errors_model_time" ON "public"."anonymous_error_events" USING "btree" ("model", "event_timestamp" DESC);



CREATE INDEX "idx_anon_errors_time" ON "public"."anonymous_error_events" USING "btree" ("event_timestamp" DESC);



CREATE INDEX "idx_anonymous_model_usage_daily_date" ON "public"."anonymous_model_usage_daily" USING "btree" ("usage_date" DESC);



CREATE INDEX "idx_anonymous_model_usage_daily_model" ON "public"."anonymous_model_usage_daily" USING "btree" ("model_id");



CREATE INDEX "idx_anonymous_usage_daily_date" ON "public"."anonymous_usage_daily" USING "btree" ("usage_date" DESC);



CREATE INDEX "idx_anonymous_usage_daily_session" ON "public"."anonymous_usage_daily" USING "btree" ("anon_hash");



CREATE INDEX "idx_chat_attachments_message_id" ON "public"."chat_attachments" USING "btree" ("message_id");



CREATE INDEX "idx_chat_attachments_message_ready" ON "public"."chat_attachments" USING "btree" ("message_id") WHERE (("status" = 'ready'::"text") AND ("message_id" IS NOT NULL));



CREATE INDEX "idx_chat_attachments_session_id" ON "public"."chat_attachments" USING "btree" ("session_id");



CREATE INDEX "idx_chat_attachments_status_deleted" ON "public"."chat_attachments" USING "btree" ("status", "deleted_at");



CREATE INDEX "idx_chat_attachments_user_session_draft_status" ON "public"."chat_attachments" USING "btree" ("user_id", "session_id", "draft_id", "status");



CREATE INDEX "idx_chat_attachments_user_time" ON "public"."chat_attachments" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_chat_messages_completion_id" ON "public"."chat_messages" USING "btree" ("completion_id");



CREATE INDEX "idx_chat_messages_session_id" ON "public"."chat_messages" USING "btree" ("session_id");



CREATE INDEX "idx_chat_messages_session_timestamp" ON "public"."chat_messages" USING "btree" ("session_id", "message_timestamp");



CREATE INDEX "idx_chat_messages_timestamp" ON "public"."chat_messages" USING "btree" ("message_timestamp");



CREATE INDEX "idx_chat_messages_tokens_role" ON "public"."chat_messages" USING "btree" ("role", "input_tokens", "output_tokens") WHERE (("input_tokens" > 0) OR ("output_tokens" > 0));



CREATE INDEX "idx_chat_messages_user_message_id" ON "public"."chat_messages" USING "btree" ("user_message_id") WHERE ("user_message_id" IS NOT NULL);



CREATE INDEX "idx_chat_sessions_updated_at" ON "public"."chat_sessions" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_chat_sessions_user_id" ON "public"."chat_sessions" USING "btree" ("user_id");



CREATE INDEX "idx_chat_sessions_user_updated" ON "public"."chat_sessions" USING "btree" ("user_id", "updated_at" DESC);



CREATE INDEX "idx_cta_events_created_at" ON "public"."cta_events" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_cta_events_page_cta" ON "public"."cta_events" USING "btree" ("page", "cta_id");



CREATE INDEX "idx_cta_events_user" ON "public"."cta_events" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_message_token_costs_model" ON "public"."message_token_costs" USING "btree" ("model_id");



CREATE INDEX "idx_message_token_costs_session_time" ON "public"."message_token_costs" USING "btree" ("session_id", "message_timestamp");



CREATE INDEX "idx_message_token_costs_user_message_id" ON "public"."message_token_costs" USING "btree" ("user_message_id");



CREATE INDEX "idx_message_token_costs_user_time" ON "public"."message_token_costs" USING "btree" ("user_id", "message_timestamp" DESC);



CREATE INDEX "idx_message_token_costs_websearch_cost" ON "public"."message_token_costs" USING "btree" ("websearch_cost");



CREATE INDEX "idx_model_access_last_synced" ON "public"."model_access" USING "btree" ("last_synced_at");



CREATE INDEX "idx_model_access_openrouter_seen" ON "public"."model_access" USING "btree" ("openrouter_last_seen");



CREATE INDEX "idx_model_access_status" ON "public"."model_access" USING "btree" ("status");



CREATE INDEX "idx_model_access_tier_access" ON "public"."model_access" USING "btree" ("is_free", "is_pro", "is_enterprise");



CREATE INDEX "idx_model_sync_log_status" ON "public"."model_sync_log" USING "btree" ("sync_status", "sync_started_at" DESC);



CREATE INDEX "idx_moderation_actions_created_by" ON "public"."moderation_actions" USING "btree" ("created_by");



CREATE INDEX "idx_moderation_actions_user_date" ON "public"."moderation_actions" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_msg_annotations_message" ON "public"."chat_message_annotations" USING "btree" ("message_id");



CREATE INDEX "idx_msg_annotations_session" ON "public"."chat_message_annotations" USING "btree" ("session_id");



CREATE INDEX "idx_msg_annotations_user_time" ON "public"."chat_message_annotations" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_profiles_account_type_admin" ON "public"."profiles" USING "btree" ("account_type") WHERE ("account_type" = 'admin'::"text");



CREATE INDEX "idx_profiles_banned_until" ON "public"."profiles" USING "btree" ("banned_until") WHERE ("banned_until" IS NOT NULL);



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_profiles_is_banned_true" ON "public"."profiles" USING "btree" ("is_banned") WHERE ("is_banned" = true);



CREATE INDEX "idx_profiles_last_active" ON "public"."profiles" USING "btree" ("last_active");



CREATE INDEX "idx_profiles_subscription_tier" ON "public"."profiles" USING "btree" ("subscription_tier");



CREATE INDEX "idx_usage_daily_date" ON "public"."user_usage_daily" USING "btree" ("usage_date" DESC);



CREATE INDEX "idx_usage_daily_user_date" ON "public"."user_usage_daily" USING "btree" ("user_id", "usage_date" DESC);



CREATE OR REPLACE TRIGGER "after_assistant_message_cost" AFTER INSERT ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_and_record_message_cost"();



CREATE OR REPLACE TRIGGER "after_attachment_link_recompute_cost" AFTER UPDATE OF "message_id" ON "public"."chat_attachments" FOR EACH ROW EXECUTE FUNCTION "public"."on_chat_attachment_link_recompute"();



CREATE OR REPLACE TRIGGER "on_anonymous_model_usage_update" BEFORE UPDATE ON "public"."anonymous_model_usage_daily" FOR EACH ROW EXECUTE FUNCTION "public"."_set_updated_at"();



CREATE OR REPLACE TRIGGER "on_anonymous_usage_update" BEFORE UPDATE ON "public"."anonymous_usage_daily" FOR EACH ROW EXECUTE FUNCTION "public"."_set_updated_at"();



CREATE OR REPLACE TRIGGER "on_message_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_session_stats"();



CREATE OR REPLACE TRIGGER "on_session_created" AFTER INSERT ON "public"."chat_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."track_session_creation"();



CREATE OR REPLACE TRIGGER "on_session_updated" BEFORE UPDATE ON "public"."chat_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."update_session_timestamp"();



CREATE OR REPLACE TRIGGER "trg_protect_ban_columns" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_ban_columns"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."chat_attachments"
    ADD CONSTRAINT "chat_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_attachments"
    ADD CONSTRAINT "chat_attachments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_attachments"
    ADD CONSTRAINT "chat_attachments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_message_annotations"
    ADD CONSTRAINT "chat_message_annotations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_token_costs"
    ADD CONSTRAINT "message_token_costs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."moderation_actions"
    ADD CONSTRAINT "moderation_actions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."moderation_actions"
    ADD CONSTRAINT "moderation_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_activity_log"
    ADD CONSTRAINT "user_activity_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_usage_daily"
    ADD CONSTRAINT "user_usage_daily_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admin can read CTA events" ON "public"."cta_events" FOR SELECT USING ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Admins can insert moderation actions" ON "public"."moderation_actions" FOR INSERT WITH CHECK ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Admins can insert sync logs" ON "public"."model_sync_log" FOR INSERT WITH CHECK ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Admins can read anonymous errors" ON "public"."anonymous_error_events" FOR SELECT USING ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Admins can read anonymous model usage" ON "public"."anonymous_model_usage_daily" FOR SELECT USING ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Admins can read anonymous usage" ON "public"."anonymous_usage_daily" FOR SELECT USING ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Admins can update moderation actions" ON "public"."moderation_actions" FOR UPDATE USING ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Admins can update sync logs" ON "public"."model_sync_log" FOR UPDATE USING ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Admins can view moderation actions" ON "public"."moderation_actions" FOR SELECT USING ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "All users can view model access" ON "public"."model_access" FOR SELECT USING (true);



CREATE POLICY "Allow inserts from server roles" ON "public"."cta_events" FOR INSERT WITH CHECK (((( SELECT "auth"."role"() AS "role") = 'service_role'::"text") OR (( SELECT "auth"."role"() AS "role") = 'authenticated'::"text")));



CREATE POLICY "Deny direct deletes" ON "public"."anonymous_model_usage_daily" FOR DELETE USING (false);



CREATE POLICY "Deny direct deletes" ON "public"."anonymous_usage_daily" FOR DELETE USING (false);



CREATE POLICY "Deny direct updates" ON "public"."anonymous_model_usage_daily" FOR UPDATE USING (false);



CREATE POLICY "Deny direct updates" ON "public"."anonymous_usage_daily" FOR UPDATE USING (false);



CREATE POLICY "Deny direct writes" ON "public"."anonymous_model_usage_daily" FOR INSERT WITH CHECK (false);



CREATE POLICY "Deny direct writes" ON "public"."anonymous_usage_daily" FOR INSERT WITH CHECK (false);



CREATE POLICY "Deny error deletes" ON "public"."anonymous_error_events" FOR DELETE USING (false);



CREATE POLICY "Deny error updates" ON "public"."anonymous_error_events" FOR UPDATE USING (false);



CREATE POLICY "Deny error writes" ON "public"."anonymous_error_events" FOR INSERT WITH CHECK (false);



CREATE POLICY "Insert message costs" ON "public"."message_token_costs" FOR INSERT WITH CHECK (("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR (( SELECT "auth"."uid"() AS "uid") = "user_id")));



CREATE POLICY "Insert via definer only" ON "public"."admin_audit_log" FOR INSERT WITH CHECK (false);



CREATE POLICY "Only admins can read audit logs" ON "public"."admin_audit_log" FOR SELECT USING ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Only admins can view sync logs" ON "public"."model_sync_log" FOR SELECT USING ("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Update profiles" ON "public"."profiles" FOR UPDATE USING (("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR (( SELECT "auth"."uid"() AS "uid") = "id"))) WITH CHECK (("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR (( SELECT "auth"."uid"() AS "uid") = "id")));



CREATE POLICY "Users can create messages in their sessions" ON "public"."chat_messages" FOR INSERT WITH CHECK (("session_id" IN ( SELECT "chat_sessions"."id"
   FROM "public"."chat_sessions"
  WHERE ("chat_sessions"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users can create their own chat sessions" ON "public"."chat_sessions" FOR INSERT WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can delete messages in their sessions" ON "public"."chat_messages" FOR DELETE USING (("session_id" IN ( SELECT "chat_sessions"."id"
   FROM "public"."chat_sessions"
  WHERE ("chat_sessions"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users can delete their own attachments" ON "public"."chat_attachments" FOR DELETE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can delete their own chat sessions" ON "public"."chat_sessions" FOR DELETE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can delete their own message annotations" ON "public"."chat_message_annotations" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own attachments" ON "public"."chat_attachments" FOR INSERT WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can insert their own message annotations" ON "public"."chat_message_annotations" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Users can insert their own usage" ON "public"."user_usage_daily" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update messages in their sessions" ON "public"."chat_messages" FOR UPDATE USING (("session_id" IN ( SELECT "chat_sessions"."id"
   FROM "public"."chat_sessions"
  WHERE ("chat_sessions"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users can update their own attachments" ON "public"."chat_attachments" FOR UPDATE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("session_id" IS NULL) OR ("session_id" IN ( SELECT "chat_sessions"."id"
   FROM "public"."chat_sessions"
  WHERE ("chat_sessions"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))) AND (("message_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM ("public"."chat_messages" "m"
     JOIN "public"."chat_sessions" "s" ON (("s"."id" = "m"."session_id")))
  WHERE (("m"."id" = "chat_attachments"."message_id") AND ("s"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "Users can update their own chat sessions" ON "public"."chat_sessions" FOR UPDATE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can update their own usage" ON "public"."user_usage_daily" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view messages from their sessions" ON "public"."chat_messages" FOR SELECT USING (("session_id" IN ( SELECT "chat_sessions"."id"
   FROM "public"."chat_sessions"
  WHERE ("chat_sessions"."user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users can view their own activity" ON "public"."user_activity_log" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own attachments" ON "public"."chat_attachments" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can view their own chat sessions" ON "public"."chat_sessions" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can view their own message annotations" ON "public"."chat_message_annotations" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own usage" ON "public"."user_usage_daily" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "View message costs" ON "public"."message_token_costs" FOR SELECT USING (("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR (( SELECT "auth"."uid"() AS "uid") = "user_id")));



CREATE POLICY "View profiles" ON "public"."profiles" FOR SELECT USING (("public"."is_admin"(( SELECT "auth"."uid"() AS "uid")) OR (( SELECT "auth"."uid"() AS "uid") = "id")));



ALTER TABLE "public"."admin_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."anonymous_error_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."anonymous_model_usage_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."anonymous_usage_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_message_annotations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cta_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_token_costs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."model_access" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."model_sync_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."moderation_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_activity_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_usage_daily" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."analyze_database_health"() TO "anon";
GRANT ALL ON FUNCTION "public"."analyze_database_health"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."analyze_database_health"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ban_user"("p_user_id" "uuid", "p_until" timestamp with time zone, "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ban_user"("p_user_id" "uuid", "p_until" timestamp with time zone, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ban_user"("p_user_id" "uuid", "p_until" timestamp with time zone, "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_and_record_message_cost"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_and_record_message_cost"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_and_record_message_cost"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_user_use_model"("user_uuid" "uuid", "model_to_check" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."can_user_use_model"("user_uuid" "uuid", "model_to_check" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_user_use_model"("user_uuid" "uuid", "model_to_check" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_anonymous_errors"("days_to_keep" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_anonymous_errors"("days_to_keep" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_anonymous_errors"("days_to_keep" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_anonymous_usage"("days_to_keep" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_anonymous_usage"("days_to_keep" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_anonymous_usage"("days_to_keep" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_cta_events"("days_to_keep" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_cta_events"("days_to_keep" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_cta_events"("days_to_keep" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_data"("days_to_keep" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_data"("days_to_keep" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_data"("days_to_keep" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_user_model_costs_daily"("p_start" "date", "p_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_user_model_costs_daily"("p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_user_model_costs_daily"("p_start" "date", "p_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_anonymous_errors"("p_start_date" "date", "p_end_date" "date", "p_limit" integer, "p_model" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_anonymous_errors"("p_start_date" "date", "p_end_date" "date", "p_limit" integer, "p_model" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_anonymous_errors"("p_start_date" "date", "p_end_date" "date", "p_limit" integer, "p_model" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_anonymous_model_costs"("p_start_date" "date", "p_end_date" "date", "p_granularity" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_anonymous_model_costs"("p_start_date" "date", "p_end_date" "date", "p_granularity" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_anonymous_model_costs"("p_start_date" "date", "p_end_date" "date", "p_granularity" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_error_count"("p_start_date" "date", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_error_count"("p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_error_count"("p_start_date" "date", "p_end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_global_model_costs"("p_start_date" "date", "p_end_date" "date", "p_granularity" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_global_model_costs"("p_start_date" "date", "p_end_date" "date", "p_granularity" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_global_model_costs"("p_start_date" "date", "p_end_date" "date", "p_granularity" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_model_sync_activity_daily"("p_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_model_sync_activity_daily"("p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_model_sync_activity_daily"("p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_model_sync_activity_daily"("p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_recent_errors"("p_start_date" "date", "p_end_date" "date", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_recent_errors"("p_start_date" "date", "p_end_date" "date", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_recent_errors"("p_start_date" "date", "p_end_date" "date", "p_limit" integer) TO "service_role";



GRANT ALL ON TABLE "public"."model_sync_log" TO "anon";
GRANT ALL ON TABLE "public"."model_sync_log" TO "authenticated";
GRANT ALL ON TABLE "public"."model_sync_log" TO "service_role";



GRANT ALL ON TABLE "public"."v_sync_stats" TO "anon";
GRANT ALL ON TABLE "public"."v_sync_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."v_sync_stats" TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_sync_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_sync_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_sync_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_sync_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_allowed_models"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_allowed_models"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_allowed_models"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_complete_profile"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_complete_profile"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_complete_profile"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_model_costs_daily"("p_start" "date", "p_end" "date", "p_model_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_model_costs_daily"("p_start" "date", "p_end" "date", "p_model_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_model_costs_daily"("p_start" "date", "p_end" "date", "p_model_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_recent_sessions"("user_uuid" "uuid", "session_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_recent_sessions"("user_uuid" "uuid", "session_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_recent_sessions"("user_uuid" "uuid", "session_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_user_profile_sync"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_user_profile_sync"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_user_profile_sync"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ingest_anonymous_error"("p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ingest_anonymous_error"("p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."ingest_anonymous_error"("p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ingest_anonymous_error"("p_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ingest_anonymous_usage"("p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ingest_anonymous_usage"("p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."ingest_anonymous_usage"("p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ingest_anonymous_usage"("p_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ingest_cta_event"("p_page" "text", "p_cta_id" "text", "p_location" "text", "p_is_authenticated" boolean, "p_user_id" "uuid", "p_ip_hash" "text", "p_meta" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ingest_cta_event"("p_page" "text", "p_cta_id" "text", "p_location" "text", "p_is_authenticated" boolean, "p_user_id" "uuid", "p_ip_hash" "text", "p_meta" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."ingest_cta_event"("p_page" "text", "p_cta_id" "text", "p_location" "text", "p_is_authenticated" boolean, "p_user_id" "uuid", "p_ip_hash" "text", "p_meta" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ingest_cta_event"("p_page" "text", "p_cta_id" "text", "p_location" "text", "p_is_authenticated" boolean, "p_user_id" "uuid", "p_ip_hash" "text", "p_meta" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_banned"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_banned"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_banned"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_user_activity"("p_user_id" "uuid", "p_action" character varying, "p_resource_type" character varying, "p_resource_id" "text", "p_details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_user_activity"("p_user_id" "uuid", "p_action" character varying, "p_resource_type" character varying, "p_resource_id" "text", "p_details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_user_activity"("p_user_id" "uuid", "p_action" character varying, "p_resource_type" character varying, "p_resource_id" "text", "p_details" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."on_chat_attachment_link_recompute"() TO "anon";
GRANT ALL ON FUNCTION "public"."on_chat_attachment_link_recompute"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."on_chat_attachment_link_recompute"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_ban_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_ban_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_ban_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_image_cost_for_user_message"("p_user_message_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_image_cost_for_user_message"("p_user_message_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_image_cost_for_user_message"("p_user_message_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_openrouter_models"("models_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_openrouter_models"("models_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_openrouter_models"("models_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_openrouter_models"("models_data" "jsonb", "p_added_by_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_openrouter_models"("models_data" "jsonb", "p_added_by_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_openrouter_models"("models_data" "jsonb", "p_added_by_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_openrouter_models"("models_data" "jsonb", "p_added_by_user_id" "uuid", "p_external_start" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."sync_openrouter_models"("models_data" "jsonb", "p_added_by_user_id" "uuid", "p_external_start" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_openrouter_models"("models_data" "jsonb", "p_added_by_user_id" "uuid", "p_external_start" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."track_session_creation"() TO "anon";
GRANT ALL ON FUNCTION "public"."track_session_creation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."track_session_creation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."track_user_usage"("p_user_id" "uuid", "p_messages_sent" integer, "p_messages_received" integer, "p_input_tokens" integer, "p_output_tokens" integer, "p_model_used" character varying, "p_session_created" boolean, "p_generation_ms" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."track_user_usage"("p_user_id" "uuid", "p_messages_sent" integer, "p_messages_received" integer, "p_input_tokens" integer, "p_output_tokens" integer, "p_model_used" character varying, "p_session_created" boolean, "p_generation_ms" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."track_user_usage"("p_user_id" "uuid", "p_messages_sent" integer, "p_messages_received" integer, "p_input_tokens" integer, "p_output_tokens" integer, "p_model_used" character varying, "p_session_created" boolean, "p_generation_ms" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."unban_user"("p_user_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."unban_user"("p_user_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unban_user"("p_user_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_model_tier_access"("p_model_id" character varying, "p_is_free" boolean, "p_is_pro" boolean, "p_is_enterprise" boolean, "p_status" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."update_model_tier_access"("p_model_id" character varying, "p_is_free" boolean, "p_is_pro" boolean, "p_is_enterprise" boolean, "p_status" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_model_tier_access"("p_model_id" character varying, "p_is_free" boolean, "p_is_pro" boolean, "p_is_enterprise" boolean, "p_status" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_session_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_session_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_session_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_session_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_session_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_session_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_tier"("user_uuid" "uuid", "new_tier" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_tier"("user_uuid" "uuid", "new_tier" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_tier"("user_uuid" "uuid", "new_tier" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."write_admin_audit"("p_actor_user_id" "uuid", "p_action" "text", "p_target" "text", "p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."write_admin_audit"("p_actor_user_id" "uuid", "p_action" "text", "p_target" "text", "p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."write_admin_audit"("p_actor_user_id" "uuid", "p_action" "text", "p_target" "text", "p_payload" "jsonb") TO "service_role";


















GRANT ALL ON TABLE "public"."admin_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."admin_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."anonymous_error_events" TO "anon";
GRANT ALL ON TABLE "public"."anonymous_error_events" TO "authenticated";
GRANT ALL ON TABLE "public"."anonymous_error_events" TO "service_role";



GRANT ALL ON TABLE "public"."anonymous_model_usage_daily" TO "anon";
GRANT ALL ON TABLE "public"."anonymous_model_usage_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."anonymous_model_usage_daily" TO "service_role";



GRANT ALL ON TABLE "public"."anonymous_usage_daily" TO "anon";
GRANT ALL ON TABLE "public"."anonymous_usage_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."anonymous_usage_daily" TO "service_role";



GRANT ALL ON TABLE "public"."chat_attachments" TO "anon";
GRANT ALL ON TABLE "public"."chat_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."chat_message_annotations" TO "anon";
GRANT ALL ON TABLE "public"."chat_message_annotations" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_message_annotations" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chat_sessions" TO "anon";
GRANT ALL ON TABLE "public"."chat_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."cta_events" TO "anon";
GRANT ALL ON TABLE "public"."cta_events" TO "authenticated";
GRANT ALL ON TABLE "public"."cta_events" TO "service_role";



GRANT ALL ON TABLE "public"."message_token_costs" TO "anon";
GRANT ALL ON TABLE "public"."message_token_costs" TO "authenticated";
GRANT ALL ON TABLE "public"."message_token_costs" TO "service_role";



GRANT ALL ON TABLE "public"."model_access" TO "anon";
GRANT ALL ON TABLE "public"."model_access" TO "authenticated";
GRANT ALL ON TABLE "public"."model_access" TO "service_role";



GRANT ALL ON TABLE "public"."moderation_actions" TO "anon";
GRANT ALL ON TABLE "public"."moderation_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."moderation_actions" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."user_activity_log" TO "anon";
GRANT ALL ON TABLE "public"."user_activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."user_activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."user_model_costs_daily" TO "anon";
GRANT ALL ON TABLE "public"."user_model_costs_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."user_model_costs_daily" TO "service_role";



GRANT ALL ON TABLE "public"."user_usage_daily" TO "anon";
GRANT ALL ON TABLE "public"."user_usage_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."user_usage_daily" TO "service_role";



GRANT ALL ON TABLE "public"."v_model_counts_public" TO "anon";
GRANT ALL ON TABLE "public"."v_model_counts_public" TO "authenticated";
GRANT ALL ON TABLE "public"."v_model_counts_public" TO "service_role";



GRANT ALL ON TABLE "public"."v_model_sync_activity_daily" TO "anon";
GRANT ALL ON TABLE "public"."v_model_sync_activity_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."v_model_sync_activity_daily" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































RESET ALL;
