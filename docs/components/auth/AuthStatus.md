# AuthStatus

## Purpose
- Displays the current authentication state using Supabase directly.
- Shows the signed-in email and a sign out link.

## Props
| Prop | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| – | – | – | This component does not accept props. |

## State Variables
- `user`: `null` – the current user from Supabase.
- `loading`: `true` – indicates initial auth check.

## useEffect Hooks
- Subscribes to Supabase auth changes on mount.

## Event Handlers
- Sign out button calls `supabase.auth.signOut()` and redirects home.

## Data Flow
- Fetches initial session then updates when auth state changes.

## Usage Locations
- Useful for debugging or lightweight auth status display.

## Notes for Juniors
- Removing the listener on unmount prevents memory leaks.
