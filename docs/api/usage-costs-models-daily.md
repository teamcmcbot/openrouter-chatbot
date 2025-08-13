# GET /api/usage/costs/models/daily

Last Updated: 2025-08-13
Status: Stable (Phase 3)
Auth: withProtectedAuth (user must be authenticated)

## Purpose

Return per-day stacked data for top models (tokens & cost) used to render charts on the Usage Costs page. Separates top N models (tokens and cost independently) and aggregates the remainder as `Others` per chart.

## Query Parameters

| Param         | Values                       | Default | Notes                                                                       |
| ------------- | ---------------------------- | ------- | --------------------------------------------------------------------------- |
| `range`       | today \| 7d \| 30d \| custom | 7d      | Same semantics as other usage endpoints.                                    |
| `start`,`end` | yyyy-mm-dd                   | —       | Required when `range=custom`. Inclusive UTC dates.                          |
| `model_id`    | model id string              | (all)   | Filters to a single model (disables Others logic effectively).              |
| `top_models`  | integer 1–12                 | 8       | Max distinct model segments per chart (tokens and cost compute separately). |

## Response Shape

```
{
  "range": { "start": "2025-08-07", "end": "2025-08-13" },
  "charts": {
    "tokens": {
      "models": ["anthropic/claude-3", "openai/gpt-4o-mini", "Others"?],
      "days": [
        { "date": "2025-08-07", "segments": {"anthropic/claude-3": 1200, "openai/gpt-4o-mini": 800}, "others": 0, "total": 2000 },
        { "date": "2025-08-08", "segments": { ... }, "others": 560, "total": 4120 }
      ]
    },
    "cost": {
      "models": ["openai/gpt-4o-mini", "anthropic/claude-3"],
      "days": [
        { "date": "2025-08-07", "segments": {"openai/gpt-4o-mini": 0.0021, "anthropic/claude-3": 0.0012}, "others": 0, "total": 0.0033 },
        { "date": "2025-08-08", "segments": { ... }, "others": 0.0004, "total": 0.0047 }
      ]
    }
  }
}
```

Notes:

- `models` arrays are ordered descending by aggregate metric for that chart (tokens or cost). They may differ between charts.
- `Others` does not appear in `models` array; instead it is conditionally added to data rows if remainder > 0. UI logic appends an `Others` bar segment when present.
- Each `total` equals sum(segments values + others).

## Behavior & Logic

1. Fetches rows from `user_model_costs_daily` view for the user/date range. If the view is missing, falls back to aggregating raw `message_token_costs` rows.
2. Totals by model computed separately.
3. Top N models chosen for tokens; top N chosen for cost (independent sets).
4. For each day, contributions of non-top models are summed into `others` per chart.
5. Days with no usage are still emitted with zeros (ensures contiguous timeline for charts).

## Example Request

```
GET /api/usage/costs/models/daily?range=7d&top_models=8
```

## Errors

| Status | Reason                                                     |
| ------ | ---------------------------------------------------------- |
| 400    | Invalid date range (custom without start/end, start > end) |
| 401    | Unauthorized (no user)                                     |
| 500    | Unexpected server error                                    |

## Caching

Currently no HTTP caching headers are set (dynamic). Future improvement: short-lived (e.g. 30s) `Cache-Control` for non-today ranges.

## Security

- Protected by `withProtectedAuth` middleware.
- DB RLS ensures only rows for `auth.uid()` are visible.

## Future Enhancements

- Optional `granularity=week|month` parameter.
- Include per-model min/max/avg for tooltips (now computed client-side if needed).
- CSV export.
