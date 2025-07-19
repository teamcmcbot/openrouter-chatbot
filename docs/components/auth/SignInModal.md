# SignInModal

## Purpose
- Reusable modal prompting the user to sign in with Google.
- Provides backdrop click and close button behavior.

## Props
| Prop | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| `isOpen` | `boolean` | Yes | Whether the modal is visible. |
| `onClose` | `() => void` | Yes | Called when the user closes the modal. |

## State Variables
- `loading`: `false` – shows a spinner while signing in.

## useEffect Hooks
- None

## Event Handlers
- `handleGoogleSignIn` triggers `signInWithGoogle` from context and handles errors.
- Clicking the backdrop or close button invokes `onClose`.

## Data Flow
- Uses `useAuth` for the `signInWithGoogle` method.
- Renders children only when `isOpen` is true.

## Usage Locations
- Used by `AuthButton` and potentially other sign-in flows.

## Notes for Juniors
- Keep the modal mounted only while needed to avoid event listeners persisting.
