# Usage Costs Page & API

Last Updated: 2025-08-12
Status: Phase 2 (initial API + UI implemented; tests & final verification pending)

## Purpose

Provide authenticated users insight into per-message token usage and USD cost with filtering (date presets + model) and pagination. Supplies summary metrics and top model breakdowns to inform optimization and future budgeting features.

## Endpoints

### GET /api/usage/costs

Auth: withProtectedAuth (requires authenticated user + profile)

Query Params:

- range: today | 7d | 30d | custom (default 7d)
- start, end: yyyy-mm-dd (required when range=custom)
- model_id: filter to a single model
- page: 1-based page index (default 1)
- page_size: default 50 (max 200)

Response Shape:

```
{
  items: [
    {
      assistant_message_id,
      session_id,
      model_id,
      message_timestamp,
      prompt_tokens,
      completion_tokens,
      total_tokens,
      prompt_cost,
      completion_cost,
      image_cost,
      total_cost
    }
  ],
  pagination: { page, page_size, total, total_pages },
  summary: {
    prompt_tokens,
    completion_tokens,
    total_tokens,
    total_cost,
    cost_per_1k,
    top_models: {
      by_tokens: [ { model_id, total_tokens, total_cost, share_tokens, share_cost } ],
      by_cost:   [ { model_id, total_tokens, total_cost, share_tokens, share_cost } ]
    }
  },
  range: { start, end, key }
}
```

### GET /api/usage/costs/daily

Auth: withProtectedAuth
Same date/model query params as above (no paging).
Returns daily rollups (sorted asc by date) and overall summary.

## Date Range Logic

Implemented in `lib/utils/usageCosts.ts`:

- today: UTC current day only.
- 7d: inclusive of today and previous 6 UTC days.
- 30d: inclusive of today and previous 29 UTC days.
- custom: explicit start/end (UTC midnights) required.

All filtering uses half-open interval: >= start 00:00 UTC and < (end + 1 day) for simpler inclusive semantics at day boundary.

## Top Models Calculation

`buildTopModels(rows, 3)` sorts copies of model aggregate list by tokens and cost separately. Percent shares are rounded to 2 decimals. Unknown/null model ids surface as 'unknown'.

## Frontend Page

File: `src/app/usage/costs/page.tsx`
Features:

- Preset range buttons.
- Model filter select (options accumulate from items + top models so filtering does not reduce available list).
- Page size selector (25–200).
- Summary metric cards (Total Cost, Total Tokens + breakdown, Cost / 1K, Top Model by Tokens).
- Top Models tables (by tokens, by cost).
- Paginated per-message table.

State Management: Local React state with manual fetch; potential future enhancement to switch to SWR for caching & revalidation (decided low priority in initial pass).

Accessibility/UX Notes:

- Uses semantic tables; consider adding captions and aria-sort for future accessibility improvement.
- Loading + empty states handled in table body.

## Security & RLS

- Endpoints wrap with `withProtectedAuth` ensuring user & profile present.
- Queries filter by `user_id = auth.user.id` and rely on Postgres RLS as defense in depth.

## Performance Considerations

- Pagination uses `range()` and `count: 'exact'` to emit total; for very large datasets may replace total count with approximated count or separate HEAD query.
- Summaries done in-memory; if performance degrades, consider SQL aggregation or materialized view.

## Testing Plan (Pending Implementation)

Unit tests to add:

1. `usageCosts.resolveDateRange` presets and custom validation.
2. `buildTopModels` share calculations and ordering.
3. API handler success path: page size, pagination math, summary totals (mock Supabase client).
4. API handler auth rejection (no user in context).
5. Daily endpoint aggregation producing expected day buckets.

## Known Gaps / Future Enhancements

- No SWR caching (acceptable now).
- No charts (Phase 3 scope).
- No sorting beyond timestamp desc for items (may add by cost/model).
- Potential index tuning once data volume grows (currently relies on planned idx_message_token_costs_user_time).

## Manual Verification Steps

1. Create messages spanning multiple days & models for a test user.
2. Hit `/api/usage/costs?range=7d` verify totals match manual SQL sum.
3. Apply `model_id` filter verify subset.
4. Change `page_size` smaller and assert pagination metadata.
5. Access endpoint without auth (simulate) -> 401.
6. Hit `/api/usage/costs/daily` verify day rollups sum to main endpoint summary.

After tests + verification: mark Phase 2 docs task complete in spec.
