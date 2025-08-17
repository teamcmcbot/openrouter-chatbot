# POST /api/uploads/images

Protected upload endpoint for image attachments. Validates tier-based size limits and MIME types, stores the file in a private Supabase bucket, inserts a `chat_attachments` row, and returns metadata (optionally with a short-lived preview URL).

## Authentication & Rate Limits

- Auth: withProtectedAuth (cookies or Bearer)
- Rate limits (initial): 30/min/user, 120/min/IP; Pro/Enterprise ×2
- Headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After

## Request

- Method: POST
- Content-Type: multipart/form-data
- Fields:
  - image: File (required). Allowed: image/png, image/jpeg, image/webp
  - sessionId: string (optional)
  - draftId: string (required, uuid)
  - originalName: string (optional)

Example (HTTP):

```http
POST /api/uploads/images
Content-Type: multipart/form-data; boundary=---BOUNDARY

-----BOUNDARY
Content-Disposition: form-data; name="image"; filename="photo.jpg"
Content-Type: image/jpeg

...binary...
-----BOUNDARY
Content-Disposition: form-data; name="draftId"

1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d
-----BOUNDARY--
```

## Successful Response

- Status: 200 OK
- Body:

```json
{
  "id": "7f2b1f7c-6a1e-4d4a-9b3e-9a8e4a1c2b3d",
  "mime": "image/jpeg",
  "size": 482193,
  "storagePath": "<userId>/2025/08/17/drafts/<draftId>/<uuid>.jpg",
  "previewUrl": "https://...signed...",
  "previewUrlTtlSeconds": 300,
  "originalName": "photo.jpg"
}
```

Notes:

- `previewUrl` may be omitted; clients can request a signed URL later via the signed-url endpoint.

## Errors

- 400 Bad Request: invalid/missing file, disallowed MIME, over cap (>3 for draft)
- 401 Unauthorized: missing/invalid auth (middleware)
- 413 Payload Too Large: over per-tier size cap (Free ≤ 5MB; Pro/Enterprise ≤ 10MB)
- 429 Too Many Requests: rate limit exceeded
- 500 Internal Server Error: storage failure or unexpected error

## Behavior Details

- Cap enforcement: server counts ready, non-deleted attachments for (user_id, draft_id, optional session_id); the 4th upload is rejected.
- Path: stored in private bucket `attachments-images` at `userId/yyyy/mm/dd/drafts/<draftId>/<uuid>.<ext>`.
- Security: server ignores any client-provided path; ownership and RLS enforced via Supabase session.
- Next steps: use GET /api/attachments/:id/signed-url to preview or include in chat send.
