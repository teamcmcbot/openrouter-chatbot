# useModelData

## Purpose / high-level description
- Retrieves the list of available OpenRouter models and caches them in `localStorage`.
- Provides auto refreshing, offline support and a flag indicating if enhanced model
  details are available.

## Parameters
| Name | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| – | – | – | This hook does not accept parameters. |

## Returned values
| Name | Type | Description |
| ---- | ---- | ----------- |
| `models` | `ModelInfo[] \| string[]` | Array of models fetched from `/api/models`. |
| `loading` | `boolean` | `true` while fetching data. |
| `error` | `Error \| null` | Error from the last fetch attempt. |
| `isEnhanced` | `boolean` | Indicates if model items include extra metadata. |
| `refresh` | `() => Promise<void>` | Manually re-fetches the models. |
| `lastUpdated` | `Date \| null` | When the data was last successfully fetched. |
| `clearCache` | `() => void` | Removes the cached models from `localStorage`. |

## State variables
- `state.models` – `[]` – array of model IDs or detailed info.
- `state.loading` – `true` – tracks fetch progress.
- `state.error` – `null` – holds any fetch error.
- `state.isEnhanced` – `false` – whether the models include extra information.
- `state.lastUpdated` – `null` – timestamp of the last update.

## Side effects
- On mount, loads models from cache and then fetches fresh data.
- Sets up a Web Worker or interval to refresh models in the background every hour.
- Listens for page visibility and network changes to refresh stale data.
- Cleans up timers and workers when the component unmounts.

## Persistence mechanisms
- Uses `localStorage` to cache fetched models with a 24‑hour TTL.
- Stores cache versioning to safely invalidate old data.

## Example usage
```tsx
const { models, loading, error, refresh } = useModelData();

if (loading) return <p>Loading models...</p>;
```

## Notes for juniors
- Cached data lets the app work offline but may be outdated.
- `refresh` ignores the cache and always fetches from the API.
- Background refresh is skipped when the device is offline.
