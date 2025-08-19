# Web Search – Database Notes

Updated: 2025-08-20
Status: Canonical schema merged

## Schema changes

- `public.chat_messages`

  - `has_websearch BOOLEAN NOT NULL DEFAULT false`
  - `websearch_result_count INTEGER NOT NULL DEFAULT 0 CHECK (websearch_result_count >= 0 AND websearch_result_count <= 50)`
  - Indexes: `idx_chat_messages_has_websearch_true` (partial), `idx_chat_messages_websearch_count`

- `public.chat_message_annotations` (new)

  - Columns: `id UUID PK`, `user_id UUID`, `session_id TEXT`, `message_id TEXT`, `annotation_type TEXT CHECK IN ('url_citation')`, `url TEXT`, `title TEXT`, `content TEXT`, `start_index INT`, `end_index INT`, `created_at TIMESTAMPTZ`
  - Constraint: start/end index sanity check
  - Indexes: by `message_id`; `(user_id, created_at DESC)`; by `session_id`
  - RLS: owner-scoped select/insert/delete

- `public.message_token_costs`

  - `websearch_cost DECIMAL(12,6)` added
  - Index: `idx_message_token_costs_websearch_cost`
  - `pricing_source` JSON includes `web_search_price`, `websearch_results`, `websearch_unit_basis='per_result'`

- `public.model_access`
  - `web_search_price VARCHAR(20)` already present; used as unit price when > 0

## Cost recompute

Function `public.recompute_image_cost_for_user_message(p_user_message_id TEXT)` now also computes websearch cost:

- Determine assistant pair for the given user message
- Read `has_websearch`, `websearch_result_count`; cap billable results at 50
- Unit price: `COALESCE(model_access.web_search_price::decimal, 0.004)` with fallback to `0.004`
- `websearch_cost = ROUND(LEAST(results, 50) * unit_price, 6)`
- Upsert `public.message_token_costs` and set `total_cost = prompt + completion + image + websearch`
- Update `public.user_usage_daily.estimated_cost` by delta only

## Notes

- No separate `websearch_results` columns in `message_token_costs` or `user_usage_daily` yet; only cost is tracked in canonical schema.
- Partial index on `has_websearch` aids analytics queries for adoption.
- Annotations table stores normalized `url_citation` rows for reliable joins.
