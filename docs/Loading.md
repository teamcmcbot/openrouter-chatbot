# Loading

## Purpose
- Reusable loading indicator with spinner, dots or skeleton variants.
- Useful while waiting for async data.

## Props
| Prop | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| `size` | `'sm' \| 'md' \| 'lg'` | No | Control icon dimensions. |
| `text` | `string` | No | Optional label below the indicator. |
| `variant` | `'spinner' \| 'skeleton' \| 'dots'` | No | Type of loading animation. |

## State Variables
- None

## useEffect Hooks
- None

## Event Handlers
- None

## Data Flow
- Renders different markup depending on the chosen `variant`.

## Usage Locations
- Not referenced elsewhere in the repo.

## Notes for Juniors
- The skeleton variant shows placeholder bars instead of an icon.
