# Endpoint: `/api/admin/users`

Administrative search and bulk update operations for user profiles.

**Methods:** `GET`, `PATCH`

## Authentication & Authorization

- **Admin Only**: Wrapped with `withAdminAuth` middleware.
- **Rate Limiting**: Tier-based limits applied automatically.

## Description

- **GET**: Searches and lists user profiles with optional text search, tier/account-type filters, and pagination. `meta=filters` returns available tier and account type values.
- **PATCH**: Batch updates subscription tier, account type, or credits for specified users. Tier changes are applied via the `update_user_tier` RPC and successful updates are audit logged.

## Query Parameters (GET)

- `q` – search string for email or name.
- `tier` – filter by subscription tier (`free`, `pro`, `enterprise`, `all`).
- `account_type` – filter by account type (`user`, `admin`, `all`).
- `limit` – number of records to return (default `50`, max `200`).
- `offset` – pagination offset.
- `meta=filters` – return available filter values.

## Request Body (PATCH)

```json
{
  "updates": [
    {
      "id": "user-uuid",
      "subscription_tier": "pro",
      "account_type": "user",
      "credits": 1000
    }
  ]
}
```

## Response

GET responds with `{ success: true, items, totalCount, filteredCount }`.
PATCH responds with `{ success, results: [{ id, success, error? }] }` and may return status `200`, `207`, or `400` depending on individual update results.

## Error Responses

- `401 Unauthorized` if admin authentication fails.
- `400 Bad Request` for invalid parameters or update payloads.
- `500 Internal Server Error` for unexpected failures.

