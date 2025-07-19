# useAuthStore

## Purpose / Overview
Manages user authentication state using Zustand and Supabase.
Provides sign-in, sign-out and initialization helpers used across the app.

## State Shape
| State Variable | Type | Description |
| -------------- | ---- | ----------- |
| `user` | `User \| null` | Current Supabase user. |
| `session` | `Session \| null` | Active auth session. |
| `isAuthenticated` | `boolean` | True when a user is logged in. |
| `isLoading` | `boolean` | Indicates sign-in/out in progress. |
| `isInitialized` | `boolean` | Whether the store has set up listeners. |
| `isHydrated` | `boolean` | Set after state rehydrates from storage. |
| `error` | `string \| null` | Last authentication error. |
| `lastUpdated` | `Date \| null` | Timestamp of last state change. |

## Actions / Methods
| Action | Parameters | Description |
| ------ | ---------- | ----------- |
| `setUser` | `(user: User \| null)` | Updates user and auth status. |
| `setSession` | `(session: Session \| null)` | Updates session and user. |
| `setLoading` | `(loading: boolean)` | Toggles loading flag. |
| `setInitialized` | `(initialized: boolean)` | Marks initialization complete. |
| `signInWithGoogle` | `()` | Starts the Google OAuth flow. |
| `signOut` | `()` | Signs out and clears all other stores. |
| `initialize` | `()` | Loads current session and subscribes to changes. |
| `clearAuth` | `()` | Resets auth state to defaults. |
| `clearAllStores` | `()` | Clears related stores and localStorage keys. |
| `_hasHydrated` | `()` | Called by Zustand persistence after rehydration. |
| `clearError` | `()` | Removes any error message. |
| `reset` | `()` | Restores the initial state. |

## Selectors / Computed State
- Helper hooks `useAuth`, `useAuthUser` and `useAuthStatus` expose subsets of the store.

## Persistence Behavior
- Uses Zustand's `persist` middleware to store auth data in `localStorage`.

## SSR Considerations
- The store should be initialized in `AuthProvider` to avoid hydration mismatches.

## Developer Tips
- `clearAllStores` dynamically imports other stores to avoid circular dependencies.
