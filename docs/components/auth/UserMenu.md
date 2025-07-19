# UserMenu

## Purpose
- Dropdown menu for authenticated users.
- Shows profile info and a sign out action.

## Props
| Prop | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| – | – | – | This component does not accept props. |

## State Variables
- `isOpen`: `false` – whether the dropdown is visible.

## useEffect Hooks
- Registers a click listener to close the menu when clicking outside.

## Event Handlers
- Button click toggles the dropdown.
- `handleSignOut` calls `signOut` from context and closes the menu.

## Data Flow
- Reads `user` from `useAuth` to display avatar and name.

## Usage Locations
- Triggered by `AuthButton` when a user is logged in.

## Notes for Juniors
- `useRef` is used to detect clicks outside the menu element.
