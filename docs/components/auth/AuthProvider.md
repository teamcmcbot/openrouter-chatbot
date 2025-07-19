# AuthProvider

## Purpose
- Initializes authentication state on app startup.
- Registers chat synchronization via `useChatSync`.
- Provides its children once initialization completes.

## Props
| Prop | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| `children` | `React.ReactNode` | Yes | Elements that require auth context. |

## State Variables
- `isInitialized` from `useAuthStore` ensures initialization happens once.

## useEffect Hooks
- Calls `initialize()` when not yet initialized.

## Event Handlers
- None

## Data Flow
- Invokes `useChatSync` to keep conversations in sync with the server.
- Renders `children` directly after setup.

## Usage Locations
- Wrapped around the root layout in `src/app/layout.tsx`.

## Notes for Juniors
- Only minimal logic lives here; most auth functions reside in `useAuthStore`.
