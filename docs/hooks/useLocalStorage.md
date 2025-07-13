# useLocalStorage

## Purpose / high-level description
- Stores a stateful value and keeps it in `localStorage` for persistence.
- Useful for remembering small settings like a selected theme or model.

## Parameters
| Name | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| `key` | `string` | Yes | The `localStorage` key under which the value is saved. |
| `initialValue` | `T` | Yes | Value used if nothing is stored yet. |

## Returned values
| Name | Type | Description |
| ---- | ---- | ----------- |
| `[value, setValue]` | `[T, (v: T \| ((val: T) => T)) => void]` | Current value and a setter that also writes to `localStorage`. |

## State variables
- `storedValue` – loaded from `localStorage` or `initialValue` – holds the persisted value.

## Side effects
- No `useEffect` hooks. The initializer reads from `localStorage`, and `setValue`
  writes back to it.

## Persistence mechanisms
- Uses `window.localStorage` to save and retrieve the value as JSON.

## Example usage
```tsx
const [username, setUsername] = useLocalStorage('user', '');
```

## Notes for juniors
- Values are serialized with `JSON.stringify`, so arrays and objects are allowed.
- In server-side rendering, the hook falls back to `initialValue` until the
  browser is ready.
