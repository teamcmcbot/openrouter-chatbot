# ErrorBoundary

## Purpose
- Catches JavaScript errors in the component tree.
- Shows a fallback UI and lets users retry or refresh.

## Props
| Prop | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| `children` | `ReactNode` | Yes | Elements wrapped by the boundary. |
| `fallback` | `ComponentType<{ error?: Error; retry: () => void }>` | No | Custom UI when an error occurs. |

## State Variables
- `hasError`: `false` – whether an error has been caught.
- `error`: `undefined` – error object captured.

## useEffect Hooks
- None (class component uses lifecycle methods instead).

## Event Handlers
- `retry` – resets the error state so children re-render.

## Data Flow
- Uses `getDerivedStateFromError` and `componentDidCatch` to handle errors.

## Usage Locations
- `src/app/layout.tsx`

## Notes for Juniors
- Wrap large sections of your app in this boundary to prevent white screens.
