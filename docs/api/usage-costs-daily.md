# Endpoint: `/api/usage/costs/daily`

Provides daily aggregated token usage and cost totals for the authenticated user.

**Method:** `GET`

## Authentication & Authorization

- **Authentication Required**: Uses `withProtectedAuth` middleware.
- **Rate Limiting**: Tier-based limits applied automatically.

## Description

Aggregates token usage and costs by day for a given date range. Each item represents a day with token counts, cost, and assistant message count, plus overall totals for the range.

## Query Parameters

- `range` – `today`, `7d` (default), `30d`, or `custom`.
- `start`, `end` – required when `range=custom` (format `YYYY-MM-DD`).
- `model_id` – optional model filter.

## Response

```json
{
  "items": [
    {
      "usage_date": "2025-08-07",
      "prompt_tokens": 0,
      "completion_tokens": 0,
      "total_tokens": 0,
      "total_cost": 0,
      "assistant_messages": 0
    }
  ],
  "summary": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0,
    "total_cost": 0
  },
  "range": {
    "start": "2025-08-01",
    "end": "2025-08-07",
    "key": "7d"
  }
}
```

## Error Responses

- `401 Unauthorized` if authentication fails.
- `400 Bad Request` for invalid date ranges.
- `500 Internal Server Error` for unexpected failures.

