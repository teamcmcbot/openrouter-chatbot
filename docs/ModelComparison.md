# ModelComparison

## Purpose
- Modal window to compare available models in a table.
- Lets users search, filter and select a model.

## Props
| Prop | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| `models` | `ModelInfo[]` | Yes | List of models to show. |
| `isOpen` | `boolean` | Yes | Whether the modal is visible. |
| `onClose` | `() => void` | Yes | Closes the modal. |
| `onSelectModel` | `(id: string) => void` | No | Called when the Select button is clicked. |

## State Variables
- `searchTerm`: `""` – search input for filtering models.

## useEffect Hooks
- None

## Event Handlers
- `handleSelectModel` – invokes `onSelectModel` and closes the modal.

## Data Flow
- Filters the provided models by name and description before rendering.

## Usage Locations
- Not imported elsewhere in this repo.

## Notes for Juniors
- Formatting helpers convert token counts and prices into readable strings.
