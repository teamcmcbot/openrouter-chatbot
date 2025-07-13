# Input

## Purpose
- Small wrapper around `<input>` with label, helper text and error display.
- Supports forwarding refs for form libraries.

## Props
| Prop | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| `label` | `string` | No | Label text above the field. |
| `error` | `string` | No | Error message shown in red. |
| `helperText` | `string` | No | Additional hint below the input. |
| `...` | `InputHTMLAttributes<HTMLInputElement>` | No | All standard input props. |

## State Variables
- None

## useEffect Hooks
- None

## Event Handlers
- None

## Data Flow
- Passes props straight to the underlying `<input>` element.

## Usage Locations
- Not referenced elsewhere in the repo.

## Notes for Juniors
- The `id` is auto-generated if you don't supply one.
