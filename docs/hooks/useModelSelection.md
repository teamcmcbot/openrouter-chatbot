# useModelSelection

## Purpose / high-level description
- Keeps track of which AI model the user has chosen.
- Pulls available models from `useModelData` and persists the selection to `localStorage`.

## Parameters
| Name | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| – | – | – | This hook does not accept parameters. |

## Returned values
| Name | Type | Description |
| ---- | ---- | ----------- |
| `availableModels` | `ModelInfo[] \| string[]` | Models supplied by `useModelData`. |
| `selectedModel` | `string` | ID of the currently selected model. |
| `setSelectedModel` | `(id: string) => void` | Updates the selection and saves it. |
| `isLoading` | `boolean` | `true` while models are being fetched. |
| `error` | `Error \| null` | Error returned by `useModelData`. |
| `isEnhanced` | `boolean` | `true` when `availableModels` contain extra info. |
| `refreshModels` | `() => Promise<void>` | Re-fetches the list of models. |
| `lastUpdated` | `Date \| null` | Timestamp of the last successful fetch. |

## State variables
- `selectedModel` – `""` – ID persisted in `localStorage` under `selectedModel`.

## Side effects
- Sets a default model when the list loads and none is chosen yet.
- If the chosen model disappears from the list, it resets to the first one.

## Persistence mechanisms
- Uses `useLocalStorage` internally so the selection survives page reloads.

## Example usage
```tsx
const { selectedModel, availableModels, setSelectedModel } = useModelSelection();
```

## Notes for juniors
- `availableModels` may contain only IDs or detailed objects depending on API mode.
- Always check `isLoading` and `error` before rendering the dropdown.
