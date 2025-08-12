# Endpoint: `/api/usage/costs`

Fetches token usage and cost records for the authenticated user.

**Method:** `GET`

## Authentication & Authorization

- **Authentication Required**: Uses `withProtectedAuth` middleware.
- **Rate Limiting**: Tier-based limits applied automatically.
- Users only see their own usage data.

## Description

Returns detailed token usage and cost entries over a specified date range. Supports model filtering and pagination, and includes aggregated totals and top model statistics.

## Query Parameters

- `range` – `today`, `7d` (default), `30d`, or `custom`.
- `start`, `end` – required when `range=custom` (format `YYYY-MM-DD`).
- `model_id` – optional model filter.
- `page` – page number (default `1`).
- `page_size` – items per page (default `50`, max `200`).

## Response

```json
{
  "items": [
    {
      "assistant_message_id": "msg-id",
      "session_id": "session-id",
      "model_id": "model",
      "message_timestamp": "2025-08-01T12:00:00Z",
      "prompt_tokens": 0,
      "completion_tokens": 0,
      "total_tokens": 0,
      "prompt_cost": 0,
      "completion_cost": 0,
      "image_cost": 0,
      "total_cost": 0
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 50,
    "total": 0,
    "total_pages": 1
  },
  "summary": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0,
    "total_cost": 0,
    "cost_per_1k": 0,
    "top_models": {
      "by_tokens": [],
      "by_cost": []
    }
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
- `400 Bad Request` for invalid parameters.
- `500 Internal Server Error` for unexpected failures.

