-- Patch: Admin Analytics Fixes – Disambiguate columns in get_global_model_costs
-- Date: 2025-09-01
-- Description: Replaces function with qualified alias `mtc` to remove Postgres 42702
--              "column reference is ambiguous" errors when aggregating by model_id.
-- Safety: Forward-only. Uses CREATE OR REPLACE FUNCTION.

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_global_model_costs IS 'Admin-only: aggregate model costs by chosen granularity (day/week/month) between dates inclusive.';
