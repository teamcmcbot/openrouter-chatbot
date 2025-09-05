# Admin: Ban / Unban Users

Admin-only endpoints to manage account bans. Bans block chat execution (including streaming and uploads) but allow read-only endpoints (chat history, conversation management) per current policy.

- Auth: Admin (`withAdminAuth`)
- Rate limiting: Tier D (admin/testing)
- Snapshots: Invalidate Redis auth snapshot on changes

## POST /api/admin/users/{id}/ban

Body:

```
{
  "reason": "string (required, >=3 chars)",
  "until": "2025-12-31T00:00:00.000Z" | null
}
```

Response 200:

```
{ "success": true, "result": { /* RPC return */ } }
```

Response 400/403/500:

```
{ "success": false, "error": "message" }
```

Notes:

- Prevents self-ban.
- On success, invalidates `auth:snapshot:user:{id}` via `deleteAuthSnapshot`.

## POST /api/admin/users/{id}/unban

Body:

```
{
  "reason": "string (optional)"
}
```

Response 200:

```
{ "success": true, "result": { /* RPC return */ } }
```

On success, invalidates snapshot for immediate effect.

## Enforcement policy summary

- Blocked when banned: `POST /api/chat`, `POST /api/chat/stream`, uploads endpoints
- Allowed when banned: read-only endpoints like `GET /api/chat/messages`, conversation management (`/api/chat/session`, `/api/chat/sessions`, `clear-all`) via per-route `enforceBan: false` override in `withProtectedAuth`.

See also:

- `src/app/api/admin/users/[id]/ban/route.ts`
- `src/app/api/admin/users/[id]/unban/route.ts`
- `docs/api/auth-middleware.md`
- `docs/architecture/auth-snapshot-caching.md`
