# Backlog: Auth Snapshot Invalidation for Ban/Unban

Context:

- We cache a minimal auth snapshot in Redis (see `lib/utils/authSnapshot.ts`) used only for ban enforcement in `lib/middleware/auth.ts`.
- If the snapshot indicates a ban, middleware returns early, before reading the latest profile from the DB (by design for speed).
- Admin ban/unban API routes already call `deleteAuthSnapshot(id)` to invalidate the cache immediately.
- Risk: If ban state is changed outside the provided admin endpoints (e.g., direct DB update, ad-hoc script), users may remain blocked/unblocked until the snapshot TTL expires.

Why now:

- Stripe/tier changes are immediate because tier gating uses the fresh profile each request. Ban gating, however, can be subject to snapshot staleness if not invalidated.

Impact:

- Potential up-to-TTL (default 900s, configurable via `AUTH_SNAPSHOT_CACHE_TTL_SECONDS`) lag when unbanning if invalidation is skipped.

Proposed solution (minimum-risk):

1. Centralize ban state changes through a service helper that handles DB update + cache invalidation.
2. Document the requirement: always use the helper or admin endpoints for ban/unban; do not update the DB directly.
3. Add lightweight tests to ensure the helper calls `deleteAuthSnapshot`.

Stretch ideas (optional, evaluate later):

- Add a small audit log or metric when a ban snapshot is older than TTL to surface misconfigurations.
- Provide a safe script `scripts/unban-user.ts` that uses the helper.

Acceptance criteria:

- Using the admin API or helper, an unbanned user is able to access protected endpoints immediately (no TTL lag).
- Tests cover snapshot invalidation behavior.
- Docs clearly call out TTL behavior and the helper usage.

Tasks:

- [ ] Create `lib/services/banService.ts` with:
  - [ ] `setBanStatus(userId: string, opts: { isBanned: boolean; bannedUntil?: string | null }): Promise<void>`
  - [ ] Inside, update `profiles.is_banned` / `profiles.banned_until` then call `deleteAuthSnapshot(userId)`
- [ ] Refactor admin routes:
  - [ ] `src/app/api/admin/users/[id]/ban/route.ts` → use `setBanStatus(id, { isBanned: true, bannedUntil: ... })`
  - [ ] `src/app/api/admin/users/[id]/unban/route.ts` → use `setBanStatus(id, { isBanned: false, bannedUntil: null })`
- [ ] Tests:
  - [ ] Add `tests/api/admin/banService.invalidateSnapshot.test.ts` that mocks Supabase update, asserts `deleteAuthSnapshot` called with `userId`
- [ ] Docs:
  - [ ] Update `docs/api/admin/users-ban-unban.md` to describe snapshot caching, `AUTH_SNAPSHOT_CACHE_TTL_SECONDS`, and the helper requirement
- [ ] (Optional) Scripts:
  - [ ] Add `scripts/unban-user.ts` for safe unban via service helper

References:

- `lib/middleware/auth.ts` (ban enforcement uses Redis snapshot)
- `lib/utils/authSnapshot.ts` (get/set/delete with TTL, default 900s)
- `src/app/api/admin/users/[id]/ban/route.ts` and `unban/route.ts` (already delete snapshot)
- `docs/api/admin/users-ban-unban.md` (document invalidation requirement)
