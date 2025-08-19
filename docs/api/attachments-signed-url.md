# GET /api/attachments/:id/signed-url

Returns a fresh signed URL (TTL ~5 minutes) to view a private image attachment owned by the caller.

## Authentication & Rate Limits

- Auth: withProtectedAuth
- Rate limits (initial): 120/min/user, 300/min/IP
- Headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Cache-Control: no-store

## Request

- Method: GET
- Path params:
  - id: string (UUID) — attachment id

Example:

```http
GET /api/attachments/7f2b1f7c-6a1e-4d4a-9b3e-9a8e4a1c2b3d/signed-url
```

## Successful Response

- Status: 200 OK
- Body:

```json
{
  "id": "7f2b1f7c-6a1e-4d4a-9b3e-9a8e4a1c2b3d",
  "signedUrl": "https://...signed...",
  "ttlSeconds": 300
}
```

## Errors

- 401 Unauthorized: not authenticated (middleware)
- 403/404 Not Found: not owned by caller or not visible (prefer 404)
- 429 Too Many Requests: rate limit exceeded
- 500 Internal Server Error: storage failure or unexpected error

## Behavior Details

- Verifies ownership and `status='ready'` before signing.
- Does not persist the signed URL in the database.
- Intended for history preview and short-lived embedding in the UI.
