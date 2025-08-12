# Endpoint: `/api/admin/model-access`

Administrative management of model access records.

**Methods:** `GET`, `PATCH`

## Authentication & Authorization

- **Admin Only**: Wrapped with `withAdminAuth` middleware.
- **Rate Limiting**: Tier-based limits applied automatically.

## Description

- **GET**: Lists `model_access` rows with optional status filtering and pagination. Passing `meta=statuses` returns a list of distinct status values.
- **PATCH**: Batch updates status or tier flags (`is_free`, `is_pro`, `is_enterprise`) for specified models via the `update_model_tier_access` RPC. Successful updates are audit logged.

## Query Parameters (GET)

- `status` – filter by status (`new`, `active`, `disabled`, `inactive`, `all`).
- `limit` – number of records to return (default `100`, max `500`).
- `offset` – pagination offset.
- `meta=statuses` – return only distinct statuses.

## Request Body (PATCH)

```json
{
  "updates": [
    {
      "model_id": "gpt-4",
      "status": "active",
      "is_pro": true
    }
  ]
}
```

## Response

GET responds with `{ success: true, items, totalCount, filteredCount }`.
PATCH responds with `{ success, results: [{ model_id, success, error? }] }` and may return status `200`, `207`, or `400` depending on individual update results.

## Error Responses

- `401 Unauthorized` if admin authentication fails.
- `400 Bad Request` for invalid filters or update payloads.
- `500 Internal Server Error` for unexpected failures.

