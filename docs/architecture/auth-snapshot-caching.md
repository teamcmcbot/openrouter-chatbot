# Auth Snapshot Caching (Redis)

This document explains the authentication snapshot cache used for fast, consistent ban and tier checks.

## What is an auth snapshot?

A compact JSON snapshot of a user's access-critical fields:

- v: number (schema version)
- isBanned: boolean
- bannedUntil: ISO string or null
- tier: 'free' | 'pro' | 'enterprise'
- accountType: 'user' | 'admin' | null
- updatedAt: ISO timestamp

Key format in Redis: `auth:snapshot:user:{userId}`.

## Where it's used

- Middleware in `lib/middleware/auth.ts` reads the snapshot first via `getAuthSnapshot(userId)`.
- On cache miss, it falls back to the profile from DB, then sets the snapshot via `setAuthSnapshot`.
- Admin ban/unban routes call `deleteAuthSnapshot(userId)` to invalidate immediately.

## TTL control

Environment variable: `AUTH_SNAPSHOT_CACHE_TTL_SECONDS`

- Default (when unset): `900` seconds (15 minutes)
- Trade-offs:
  - Lower = faster propagation after state changes (ban/unban), more Redis reads
  - Higher = fewer reads, slower propagation
- Recommended starting values: 300 (dev), 900 (prod), 1800 (low-churn prod)

## Failure modes and fallbacks

- Redis disabled/unavailable: functions return null and middleware uses DB profile directly.
- Parse errors or unexpected types: snapshot getter returns null and DB fallback applies.
- Safety: final, authoritative ban check is performed against the profile even if cache says "not banned".

## Invalidation

- Admin endpoints at `src/app/api/admin/users/[id]/ban/route.ts` and `.../unban/route.ts` both call `deleteAuthSnapshot(id)` so enforcement changes apply on the next request.

## Privacy & logging

- Follow `lib/utils/logger.ts` standards: do not log sensitive data; include requestId; keep context small.
- Do not include prompts, responses, headers, or tokens in logs.

## Configuration snippet

Add to `.env.local` or your hosting env:

```
AUTH_SNAPSHOT_CACHE_TTL_SECONDS=900
```

See also:

- `lib/utils/authSnapshot.ts`
- `lib/middleware/auth.ts`
- `docs/api/auth-middleware.md`
