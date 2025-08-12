# Token Cost Tracking

Status: Draft Implementation
Updated: 2025-08-12

## Overview

Forward-only tracking of assistant message token costs using per-million (prompt/completion) and per-thousand (image) pricing derived from `model_access`.

## Components

- Table: `public.message_token_costs`
- Function: `public.calculate_and_record_message_cost()` (AFTER INSERT trigger on `chat_messages`)
- View: `public.user_costs_daily_aggregated`
- RLS: Users can only select their own cost rows; admins can view all.

## Cost Formula

```
prompt_cost     = ROUND( (prompt_tokens     * prompt_unit_price     / 1_000_000), 6 )
completion_cost = ROUND( (completion_tokens * completion_unit_price / 1_000_000), 6 )
image_cost      = ROUND( (image_units       * image_unit_price      / 1_000), 6 )  -- (future use)
```

`total_cost = prompt_cost + completion_cost + image_cost`

## Insert Flow

1. Assistant `chat_messages` row inserted (successful, no error).
2. Trigger calls function.
3. Function resolves user_id, pricing, computes costs, inserts snapshot row.
4. `user_usage_daily.estimated_cost` incremented.

## No Backfill

Historical messages prior to deployment do not receive cost rows.

## Manual Test Script (Example)

```sql
-- 1. Create a test session
INSERT INTO public.chat_sessions (id, user_id, title) VALUES ('sess_test', '00000000-0000-0000-0000-000000000001', 'Cost Test')
ON CONFLICT DO NOTHING;

-- 2. Ensure model exists with pricing (per million)
INSERT INTO public.model_access (model_id, model_name, prompt_price, completion_price, status, is_free, is_pro, is_enterprise)
VALUES ('test/model', 'Test Model', '0.2000', '0.4000', 'active', true, true, true)
ON CONFLICT (model_id) DO UPDATE SET prompt_price='0.2000', completion_price='0.4000';

-- 3. Insert assistant message (100 prompt, 50 completion tokens)
INSERT INTO public.chat_messages (id, session_id, role, content, model, total_tokens, input_tokens, output_tokens)
VALUES ('msg_cost_1', 'sess_test', 'assistant', 'Hello!', 'test/model', 150, 100, 50);

-- 4. Verify cost row
SELECT * FROM public.message_token_costs WHERE assistant_message_id = 'msg_cost_1';

-- Expected prompt_cost = 100 * 0.2000 / 1_000_000 = 0.000020
-- Expected completion_cost = 50 * 0.4000 / 1_000_000 = 0.000020
-- total_cost = 0.000040

-- 5. Daily aggregate view
SELECT * FROM public.user_costs_daily_aggregated WHERE user_id = '00000000-0000-0000-0000-000000000001';
```

## Maintenance

Use `database/maintenance/dev_reset_conversations.sql` to wipe conversation & cost data in development.

## Future Enhancements

- Pricing history snapshots
- Backfill with historical pricing
- Real-time streaming cost estimates
- Budget thresholds & alerts
