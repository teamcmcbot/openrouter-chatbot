-- Patch 005: Increase precision of user_usage_daily.estimated_cost to 6 decimal places
-- Date: 2025-08-12
-- Rationale: Align daily aggregated cost precision with per-message costs (DECIMAL(12,6))
--            to avoid visible rounding discrepancies (e.g. 0.000773 vs 0.0008).

BEGIN;

ALTER TABLE public.user_usage_daily
    ALTER COLUMN estimated_cost TYPE DECIMAL(12,6)
        USING (estimated_cost::DECIMAL(12,6));

ALTER TABLE public.user_usage_daily
    ALTER COLUMN estimated_cost SET DEFAULT 0.000000;

COMMIT;

-- Post-migration recommendation: Optionally run a reconciliation update to ensure
-- estimated_cost equals the sum of message_token_costs per user/day if historical
-- drift is suspected:
-- UPDATE public.user_usage_daily uud
-- SET estimated_cost = sub.sum_cost
-- FROM (
--   SELECT user_id, usage_date, ROUND(SUM(total_cost), 6) AS sum_cost
--   FROM public.message_token_costs
--   GROUP BY user_id, usage_date
-- ) sub
-- WHERE uud.user_id = sub.user_id AND uud.usage_date = sub.usage_date;
