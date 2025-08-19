# Token Cost Tracking

Status: Draft Implementation (Per-model view + admin aggregation)
Updated: 2025-08-12

## Overview

Forward-only tracking of assistant message token costs using per-token (prompt/completion) pricing derived from `model_access` (image pricing reserved for future use). Costs are recorded only for new assistant messages (no historical backfill).

## Components

- Fact table: `public.message_token_costs` (one row per assistant message)
- Triggered function: `public.calculate_and_record_message_cost()` (AFTER INSERT ON `chat_messages`)
- Daily per-user per-model view: `public.user_model_costs_daily`
- Admin aggregation function: `public.get_global_model_costs(start_date, end_date, granularity)`
- Increment target: `public.user_usage_daily.estimated_cost` updated atomically
- RLS: row visibility restricted to owner; admins via `public.is_admin()` helper

## Cost Formula (Per-Token Basis + Web Search)

```
prompt_cost     = ROUND( prompt_tokens     * prompt_unit_price, 6 )
completion_cost = ROUND( completion_tokens * completion_unit_price, 6 )
image_cost      = ROUND( image_units       * image_unit_price, 6 )  -- future use
websearch_cost  = ROUND( LEAST(websearch_results, 50) * web_search_price, 6 )  -- unit basis: per result (fallback 0.004)
total_cost      = prompt_cost + completion_cost + image_cost + websearch_cost
```

## Insert Flow

1. Assistant `chat_messages` row INSERT succeeds.
2. AFTER INSERT trigger invokes function.
3. Function loads `model_access` pricing snapshot (including `web_search_price`), computes costs (including `websearch_cost`), and upserts a row into `message_token_costs`.
4. `user_usage_daily.estimated_cost` incremented in the same transaction.
5. View & admin function pick up new data automatically.

### Unit Correction (Patch 003) and Web Search

Initial implementation assumed pricing was per million tokens, producing near-zero costs. Patch 003:

- Reinterpreted `prompt_price` / `completion_price` as per-token.
- Recalculated existing zero-cost rows.
- Replaced the cost function in canonical schema and extended it to compute `websearch_cost` using `web_search_price` (fallback 0.004) with a 50-result cap.
- Added this audit note (no schema change needed beyond the function replacement).

## No Backfill

Historical messages prior to deployment do not receive cost rows.

## Manual Test Script (Example)

```sql
-- 1. Create a test session
INSERT INTO public.chat_sessions (id, user_id, title) VALUES ('sess_test', '00000000-0000-0000-0000-000000000001', 'Cost Test')
ON CONFLICT DO NOTHING;

-- 2. Ensure model exists with pricing (per million)
-- NOTE: Example uses exaggerated per-token prices for clarity; real prices will be much smaller.
INSERT INTO public.model_access (model_id, model_name, prompt_price, completion_price, status, is_free, is_pro, is_enterprise)
VALUES ('test/model', 'Test Model', '0.2000', '0.4000', 'active', true, true, true)
ON CONFLICT (model_id) DO UPDATE SET prompt_price='0.2000', completion_price='0.4000';

-- 3. Insert assistant message (100 prompt, 50 completion tokens)
INSERT INTO public.chat_messages (id, session_id, role, content, model, total_tokens, input_tokens, output_tokens)
VALUES ('msg_cost_1', 'sess_test', 'assistant', 'Hello!', 'test/model', 150, 100, 50);

-- 4. Verify cost row
SELECT * FROM public.message_token_costs WHERE assistant_message_id = 'msg_cost_1';

-- Expected prompt_cost = 100 * 0.2000 = 20.000000
-- Expected completion_cost = 50 * 0.4000 = 20.000000
-- total_cost = 40.000000

-- 5. Per-model daily view
SELECT * FROM public.user_model_costs_daily WHERE user_id = '00000000-0000-0000-0000-000000000001';

-- 6. (Admin) Global aggregation example (assumes current user is admin)
SELECT * FROM public.get_global_model_costs(CURRENT_DATE - 7, CURRENT_DATE, 'day');
```

## Maintenance

Use `database/maintenance/dev_reset_conversations.sql` to wipe conversation & cost data in development.

## Future Enhancements

- Pricing history snapshots
- Backfill with historical pricing
- Real-time streaming cost estimates
- Budget thresholds & alerts
- Materialized monthly global model cost view (performance)
