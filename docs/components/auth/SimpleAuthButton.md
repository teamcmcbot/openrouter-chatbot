# SimpleAuthButton

## Purpose
- Provides a combined sign in / sign out button with a built-in modal.
- Uses `useAuth` Zustand store for authentication actions.

## Props
| Prop | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| – | – | – | This component does not accept props. |

## State Variables
- `showModal`: `false` – toggles the internal modal.

## useEffect Hooks
- Initializes auth state on mount via `initialize()`.

## Event Handlers
- `handleSignOut` calls `signOut` from the store.
- `handleGoogleSignIn` triggers Google authentication and closes the modal.

## Data Flow
- Shows the user's avatar when authenticated.
- Displays a modal with a Google sign in button when not authenticated.

## Usage Locations
- Earlier prototypes before `AuthButton` and `UserMenu` were introduced.

## Notes for Juniors
- Useful reference for integrating Zustand auth logic with UI components.
