# Button

## Purpose
- Generic styled button used across the UI.
- Supports different sizes, colors and a loading spinner.

## Props
| Prop | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| `variant` | `'primary' \| 'secondary' \| 'danger' \| 'ghost'` | No | Visual style. |
| `size` | `'sm' \| 'md' \| 'lg'` | No | Button padding and font size. |
| `loading` | `boolean` | No | Shows a spinner and disables clicks. |
| `...` | `ButtonHTMLAttributes<HTMLButtonElement>` | No | Any normal button props. |

## State Variables
- None

## useEffect Hooks
- None

## Event Handlers
- None (uses native `onClick` passed in props).

## Data Flow
- Displays children and optionally a spinner when `loading` is true.

## Usage Locations
- `components/ui/ModelDetailsSidebar.tsx`
- `components/ui/ModelComparison.tsx`
- `components/ui/ChatSidebar.tsx`
- `components/ui/ErrorBoundary.tsx`

## Notes for Juniors
- When `loading` is true the button becomes disabled to prevent extra clicks.
