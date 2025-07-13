# useDebounce

## Purpose / high-level description
- Returns a value that updates only after a delay.
- Helpful for search boxes or other inputs where you want to limit rapid updates.

## Parameters
| Name | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| `value` | `T` | Yes | The current value you want to debounce. |
| `delay` | `number` | Yes | Time in milliseconds to wait before updating. |

## Returned values
| Name | Type | Description |
| ---- | ---- | ----------- |
| `debouncedValue` | `T` | The latest `value` after the specified delay. |

## State variables
- `debouncedValue` – initial `value` – holds the delayed result.

## Side effects
- `useEffect` sets a `setTimeout` every time `value` or `delay` changes and
  clears it on cleanup.

## Persistence mechanisms
- None. The value only lives in memory.

## Example usage
```tsx
const [search, setSearch] = useState("");
const debouncedSearch = useDebounce(search, 300);

useEffect(() => {
  fetchResults(debouncedSearch);
}, [debouncedSearch]);
```

## Notes for juniors
- Adjust `delay` to balance responsiveness and API call frequency.
- Cleaning up the timeout prevents outdated updates when the component unmounts.
