# useAuth

## Purpose / high-level description
- Convenience hook that exposes authentication data from `AuthContext`.
- Also exports `useUser`, `useSession` and `useIsAuthenticated` helpers.

## Parameters
| Name | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| – | – | – | This hook does not accept parameters. |

## Returned values
| Name | Type | Description |
| ---- | ---- | ----------- |
| `user` | `User \| null` | Current Supabase user. |
| `session` | `Session \| null` | Current auth session. |
| `isAuthenticated` | `boolean` | `true` when `user` is present. |
| `isLoading` | `boolean` | Indicates if auth actions are in progress. |
| `isInitialized` | `boolean` | Whether the auth store has initialized. |
| `error` | `string \| null` | Last auth error message. |
| `signInWithGoogle` | `() => Promise<void>` | Begins the OAuth sign in flow. |
| `signOut` | `() => Promise<void>` | Signs out and clears local stores. |
| `initialize` | `() => Promise<void>` | Loads the current session and subscribes to changes. |
| `clearError` | `() => void` | Resets the error state. |

## State variables
- Managed within `useAuthStore`; this hook just exposes them.

## Side effects
- None

## Persistence mechanisms
- Underlying store uses `localStorage` via Zustand persistence.

## Example usage
```tsx
const { user, signInWithGoogle } = useAuth();
```

## Notes for juniors
- Call `initialize` once at app startup via `AuthProvider`.
