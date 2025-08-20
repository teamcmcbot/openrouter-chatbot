# Multiple GET /api/user/data calls during sign-in

Observed: After successful sign-in and redirect to `/chat?auth=success`, the client performs three GET requests to `/api/user/data` before syncing chat histories.

Network trace provided:

1. http://localhost:3000/chat?auth=success
2. http://localhost:3000/api/user/data
3. https://<supabase>/rest/v1/profiles?select=account_type&id=eq.<user_id>
4. http://localhost:3000/api/models
5. http://localhost:3000/api/user/data
6. http://localhost:3000/api/user/data
7. http://localhost:3000/api/chat/sync

## Root cause analysis

Three independent components fetch user data when the `/chat` page mounts:

- Theme initializer fetch (first call)

  - File: `components/system/ThemeInitializer.tsx`
  - Behavior: On first sign-in, directly calls `fetchUserData()` to read `preferences.ui.theme` and apply the server theme.
  - Code: `const data = await fetchUserData()` inside a `useEffect` guarded by `isAuthenticated` and a local `isInitialized` ref.

- Chat header/account tier (second call)

  - File: `components/chat/ChatInterface.tsx`
  - Behavior: Uses `useUserData({ enabled: !!isAuthenticated })` to read `profile.subscription_tier` and render `TierBadge`.

- Message composer gating (third call)
  - File: `components/chat/MessageInput.tsx`
  - Behavior: Uses `useUserData({ enabled: !!isAuthenticated })` to determine user tier for feature gating (web search, images, etc.).

The custom hook `hooks/useUserData.ts` attempts to avoid duplicate fetches using local component state (`lastFetchedUserId`, `isFetching`). However, those guards are per-instance. When multiple components call the hook concurrently, each instance issues its own GET to `/api/user/data`. Additionally, `ThemeInitializer` bypasses the hook and calls the service directly, contributing one more call.

This matches the observed total of three calls: 1 (ThemeInitializer) + 1 (ChatInterface) + 1 (MessageInput).

Notes:

- `components/ui/UserSettings.tsx` only fetches when its modal is open (`useUserData({ enabled: isOpen })`), so it’s not part of the initial three calls.
- `components/auth/SimpleAuthButton.tsx` imports the hook with `{ enabled: false }`, so it does not fetch.
- In React dev with StrictMode, effects may double-mount; `ThemeInitializer` uses a ref guard but would still re-run on a strict re-mount. The reported trace consistently shows three calls, which aligns with one run per component in production mode.

## Files involved (references)

- API: `src/app/api/user/data/route.ts` (GET handler wrapped with `withProtectedAuth` and `withRateLimit`)
- Client service: `lib/services/user-data.ts` (`fetchUserData`, `updateUserPreferences`)
- Hook: `hooks/useUserData.ts` (per-instance cache, no cross-instance dedupe)
- Callers on /chat:
  - `components/system/ThemeInitializer.tsx` (direct `fetchUserData()`)
  - `components/chat/ChatInterface.tsx` (`useUserData` for `TierBadge`)
  - `components/chat/MessageInput.tsx` (`useUserData` for feature gating)

## Impact

- Unnecessary duplicate load on the API route and Supabase RPC (`get_user_complete_profile`).
- Slightly slower initial UI readiness (network contention), though generally acceptable.
- Increased rate-limit pressure against `/api/user/data` (mitigated by middleware but still wasteful).

## Recommendations

Choose one of these approaches (A is preferred for minimal code churn):

A) Add a global in-memory cache and in-flight de-duplication to `useUserData`

- Implement module-level cache keyed by `userId` plus an `inFlight` Promise map to coalesce concurrent calls across all component instances.
- Example sketch inside `hooks/useUserData.ts`:
  - `const cache = new Map<string, UserDataResponse>()`
  - `const inFlight = new Map<string, Promise<UserDataResponse>>()`
  - On fetch start: if `inFlight.has(userId)`, await it; else create and store; on resolve, populate `cache` and clear `inFlight`.
  - Hook instances first return cached data if present; `forceRefresh()` bypasses cache but still uses the single in-flight promise slot.
- Refactor `ThemeInitializer` to use the hook instead of calling the service directly, so it benefits from de-duplication and cache.
- Expected result: A single GET on first sign-in; subsequent consumers read from cache.

B) Introduce a `UserDataProvider`

- Create a context/provider that fetches user data once on auth change and shares the result via context.
- Replace direct `useUserData` calls in `ChatInterface`, `MessageInput`, `ThemeInitializer` with the provider’s context consumer.
- Slightly larger refactor but clean ownership and single source of truth.

C) Adopt a data library with request de-duplication (SWR/React Query)

- Wrap `/api/user/data` with SWR or React Query keyed by `userId` and let the library coalesce requests and cache.
- Requires adding the provider at the app root and migrating callers.

Additional tweaks (independent of approach):

- Remove the direct `fetchUserData()` call in `ThemeInitializer` and replace with the shared data source.
- Keep `UserSettings` using `forceRefresh()` to bypass cache when the modal opens.

## Acceptance criteria

- After sign-in redirect to `/chat`, only one GET `/api/user/data` occurs before models load and chat sync.
- `TierBadge`, `MessageInput` gating, and theme application still work based on the same fetched data.
- `UserSettings` can still refresh data on demand.

## Reproduction steps (current)

1. Sign in successfully.
2. Redirect lands on `/chat?auth=success`.
3. Observe three GET calls to `/api/user/data` before `/api/chat/sync`.

## Suggested implementation tasks (follow-up)

- [ ] Add cross-instance cache + in-flight dedupe to `hooks/useUserData.ts`.
- [ ] Refactor `components/system/ThemeInitializer.tsx` to consume `useUserData` instead of calling the service directly.
- [ ] Verify single-request behavior locally (dev/prod) and update tests/mocks if needed.
- [ ] Add a short doc note in `docs/components/user-data-integration.md` about the shared cache behavior and `forceRefresh`.

---

Owner: frontend
Severity: low-medium (perf, rate limiting)
Status: Investigated; ready for fix

## Verification (after fix)

- Centralized cache and in-flight de-duplication added to `hooks/useUserData.ts` and `ThemeInitializer` refactored to use the hook.
- Build: PASS (Next.js build succeeded with no type errors)
- Tests: Added `tests/hooks/useUserData.dedupe.test.tsx` covering:
  - Multiple consumers mounting concurrently coalesce into a single GET.
  - Overlapping initial fetch and `forceRefresh()` still result in a single GET.
  - A subsequent `forceRefresh()` after the initial resolve issues a new GET for fresh data.
- All tests PASS locally.

Next steps: manual smoke on `/chat` to confirm a single GET before `/api/chat/sync` and that opening User Settings refreshes once.
