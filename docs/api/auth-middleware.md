# Auth Middleware and Ban Enforcement

Standardized wrappers ensure consistent auth, tier, and ban enforcement.

## Wrappers

- `withAuth(handler, options)`: Base wrapper
  - Options: `required`, `requireProfile`, `allowAnonymous`, `minimumTier`, `enforceBan` (default false)
- `withProtectedAuth(handler, { enforceBan? })`: Requires auth + profile
  - Default `enforceBan: true`, overridable per-route
- `withEnhancedAuth(handler)`: Optional auth
  - `enforceBan: false` by default (read-only endpoints)
- `withTierAuth(handler, minimumTier)`: Requires auth + profile, enforces ban
- `withAdminAuth(handler)`: Admin only, enforces ban
- `withConversationOwnership(handler)`: Adds POST ownership validation on top of protected

See `lib/middleware/auth.ts` for implementations.

## Ban policy (chat-only ban)

- Banned users are blocked from execution endpoints:
  - `POST /api/chat`
  - `POST /api/chat/stream`
  - uploads endpoints (e.g., `/api/uploads/images`)
- Banned users may access read-only endpoints and manage conversations:
  - `GET /api/chat/messages`
  - `/api/chat/session`, `/api/chat/sessions`, `clear-all` (overridden with `enforceBan: false`)

## Snapshot usage

- Wrapper checks Redis snapshot first via `getAuthSnapshot`, then falls back to DB profile.
- On cache miss, it seeds the snapshot from profile with TTL from `AUTH_SNAPSHOT_CACHE_TTL_SECONDS`.
- Final authoritative ban check validates profile fields even if cache is stale.

## Environment

```
# Seconds (default 900 if unset)
AUTH_SNAPSHOT_CACHE_TTL_SECONDS=900
```

## Error codes

- `ACCOUNT_BANNED`: returned when ban enforcement blocks a request.
- Other standardized codes: `AUTH_REQUIRED`, `TIER_UPGRADE_REQUIRED`, etc.

## Examples

- Enforced ban (chat):
  ```ts
  export const POST = withAuth(
    withTieredRateLimit(handler, { tier: "tierA" }),
    { required: false, allowAnonymous: true, enforceBan: true }
  );
  ```
- Allowed for banned (conversation mgmt):
  ```ts
  export const POST = withProtectedAuth(handler, { enforceBan: false });
  ```

See also:

- `docs/architecture/auth-snapshot-caching.md`
- `docs/api/admin/users-ban-unban.md`
