# AuthButton

## Purpose
- Shows a sign in button when the user is logged out.
- Displays the `UserMenu` when the user is signed in.
- Opens `SignInModal` to handle Google sign in.

## Props
| Prop | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| – | – | – | This component does not accept props. |

## State Variables
- `showSignInModal`: `false` – controls `SignInModal` visibility.

## useEffect Hooks
- None

## Event Handlers
- Button click toggles the sign‑in modal.
- Modal `onClose` hides the modal.

## Data Flow
- Reads auth state from `AuthContext` via `useAuth`.
- When authenticated, renders `UserMenu`; otherwise renders a Sign In button.

## Usage Locations
- Likely used in the site header for authentication actions.

## Notes for Juniors
- The modal remains open on sign‑in errors so the user can retry.
