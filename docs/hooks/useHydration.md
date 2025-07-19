# useHydration

## Purpose / high-level description
- Detects when the component has hydrated on the client.
- Helps avoid SSR and localStorage mismatches.

## Parameters
| Name | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| – | – | – | This hook accepts no parameters. |

## Returned values
| Name | Type | Description |
| ---- | ---- | ----------- |
| `isHydrated` | `boolean` | `true` after the first client render. |

## State variables
- `isHydrated` – `false` initially, toggled true in `useEffect`.

## Side effects
- Sets the hydrated flag in a `useEffect` once mounted.

## Persistence mechanisms
- None

## Example usage
```tsx
const ready = useHydration();
if (!ready) return null;
```

## Notes for juniors
- Use this when reading from `localStorage` to prevent React hydration warnings.
