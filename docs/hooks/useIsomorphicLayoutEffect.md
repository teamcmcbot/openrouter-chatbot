# useIsomorphicLayoutEffect

## Purpose / high-level description
- Uses `useLayoutEffect` in the browser and `useEffect` during server-side rendering.
- Prevents React warnings about using layout effect on the server.

## Parameters
| Name | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| – | – | – | This is a direct export of either hook so no parameters. |

## Returned values
- The appropriate React effect hook depending on the environment.

## State variables
- None

## Side effects
- None

## Persistence mechanisms
- None

## Example usage
```tsx
useIsomorphicLayoutEffect(() => {
  // Safe to access DOM here
});
```

## Notes for juniors
- Helpful when writing hooks that must run during SSR without warnings.
