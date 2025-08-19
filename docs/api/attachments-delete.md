# DELETE /api/attachments/:id

Idempotent deletion of a pending (unlinked) image attachment. Deletes the Storage object and soft-deletes the DB row.

## Authentication & Rate Limits

- Auth: withProtectedAuth
- Rate limits (initial): 60/min/user, 120/min/IP
- Headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset

## Request

- Method: DELETE
- Path params:
  - id: string (UUID) — attachment id

Example:

```http
DELETE /api/attachments/7f2b1f7c-6a1e-4d4a-9b3e-9a8e4a1c2b3d
```

## Successful Response

- Status: 204 No Content
- Body: empty

Notes:

- Repeat calls are allowed; if already deleted or not found (but owned), return 204.

## Errors

- 401 Unauthorized: not authenticated (middleware)
- 403/404 Not Found: not owned by caller or not visible (prefer 404)
- 409 Conflict: already linked to a message (cannot delete)
- 429 Too Many Requests: rate limit exceeded
- 500 Internal Server Error: storage failure or unexpected error

## Behavior Details

- Preconditions: `message_id IS NULL` AND `status='ready'`.
- On success: remove Storage object (best-effort), mark DB row `status='deleted'`, set `deleted_at=now()`.
- Designed for UI “×” remove control during composition.
