# useUserData

Purpose

- Fetch and update authenticated user data (profile, tier, preferences, usage snapshots) via `/api/user/data`.
- Provide a single, deduplicated source of truth across components with shared in-memory cache.

Signature

- `useUserData(options?: { enabled?: boolean })`

Returns

- `data: UserDataResponse | null` — consolidated user data.
- `loading: boolean` — initial fetch in progress.
- `refreshing: boolean` — background refresh in progress (e.g., UserSettings open).
- `error: string | null` — last error message, if any.
- `refetch: () => Promise<void>` — re-run a cached fetch (uses cache when available).
- `forceRefresh: () => Promise<void>` — bypass cache and fetch fresh data.
- `updatePreferences: (prefs: UserPreferencesUpdate) => Promise<void>` — PUT preferences then update local state.

Options

- `enabled?: boolean` — default true. Set false to disable automatic fetch on mount; useful for conditional fetches (e.g., modal open).

How deduplication works

- Module-scoped Maps backed by `globalThis`:
  - Cache: `Map<userId, UserDataResponse>` for resolved results.
  - In-flight: `Map<userId, Promise<UserDataResponse>>` for ongoing requests.
- On fetch:
  - If not `force`, return cached data if present.
  - If a request is already in-flight for the same `userId`, return that promise instead of starting a new one.
  - On resolve, populate cache; on settle, clear the in-flight entry.
- `forceRefresh()` always bypasses the cache but still shares the in-flight promise to coalesce overlapping refresh triggers.

Typical usage

- ThemeInitializer (applies server theme once):
  - `const { data } = useUserData({ enabled: isAuthenticated })`
  - Read `data.preferences.ui.theme` and call `setTheme` if needed.
- ChatInterface / MessageInput (tier & feature gating):
  - `const { data } = useUserData({ enabled: isAuthenticated })`
  - Use `data.profile.subscription_tier` to render `TierBadge` or gate features.
- UserSettings (always get latest when opening):
  - `const { data, forceRefresh } = useUserData({ enabled: isOpen })`
  - Call `forceRefresh()` when the modal opens to get the freshest data. Overlapping requests are deduped.

Behavior on auth changes

- When `user.id` changes, the hook fetches for the new user and resets local state.
- When the user signs out, it clears its state.

Error modes

- Network / server error: `error` set, `data` cleared on initial fetch.
- Preference update error: `error` set; rethrows so caller can show a toast.

Examples

```tsx
// Basic consumption
const { data, loading, error } = useUserData({ enabled: isAuthenticated });

// Force fresh data when opening settings
useEffect(() => {
  if (isOpen) void forceRefresh();
}, [isOpen, forceRefresh]);
```

Notes

- Do not call `/api/user/data` directly in components. Use this hook so all callers share the single request and cache.
- For public/optional access, set `enabled: false` until the user is authenticated.
- The API route is protected via standardized middleware; avoid manual auth checks client-side.
