# useModelStore

## Purpose / Overview
Tracks available models from the OpenRouter API, the currently
selected model and caching status. Data is cached in `localStorage`
and refreshed in the background when online.

## State Shape
| State Variable | Type | Description |
| -------------- | ---- | ----------- |
| `models` | `ModelInfo[] \| string[]` | List of available models. |
| `selectedModel` | `string` | ID of the chosen model. |
| `isLoading` | `boolean` | `true` while fetching from the API. |
| `error` | `string \| null` | Last fetch error message. |
| `isEnhanced` | `boolean` | Indicates if model objects contain extra metadata. |
| `lastUpdated` | `Date \| null` | Timestamp of the last successful fetch. |
| `isHydrated` | `boolean` | `true` once state is restored from storage. |
| `isOnline` | `boolean` | Reflects browser online/offline status. |
| `backgroundRefreshEnabled` | `boolean` | Whether background refresh is active. |

## Actions / Methods
| Action | Parameters | Description |
| ------ | ---------- | ----------- |
| `fetchModels` | `()` | Load models, using cache when possible. |
| `refreshModels` | `()` | Force a fresh fetch from the API. |
| `setSelectedModel` | `(modelId: string)` | Choose a model from the list. |
| `clearError` | `()` | Clear the error message. |
| `setOnlineStatus` | `(online: boolean)` | Update connectivity status. |
| `startBackgroundRefresh` | `()` | Begin periodic refreshing. |
| `stopBackgroundRefresh` | `()` | Stop the background refresh timer. |
| `clearCache` | `()` | Remove cached model data. |

## Selectors / Computed State
| Selector | Description |
| -------- | ----------- |
| `getModelById(id)` | Find a model by ID. |
| `getAvailableModels()` | Returns the current model list. |
| `getSelectedModelInfo()` | Detailed info for the selected model. |
| `getModelCount()` | Number of models in the list. |
| `isCacheValid()` | `true` if cached data is still fresh. |
| `isRefreshNeeded()` | Checks if a background refresh should run. |

## Persistence Behavior
- Uses `persist` with `createJSONStorage` under key
  `STORAGE_KEYS.MODELS`.
- Persists `selectedModel`, `isEnhanced` and `backgroundRefreshEnabled`.
- `_hasHydrated()` marks the store as ready after rehydration.

## SSR Considerations
The store delays API calls until hydrated to avoid mismatches.
Network events update `isOnline` only in the browser.

## Wrapper Hooks
`useModelData()` and `useModelSelection()` wrap the store to provide
compatibility with earlier hooks and hide data until hydration.

## Developer Tips
- `createLogger('ModelStore')` outputs detailed logs in development.
- Cached data lives under `openrouter-models-cache` with a TTL from `CACHE_CONFIG`.
