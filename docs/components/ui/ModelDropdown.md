# ModelDropdown

## Purpose
- Dropdown menu for selecting an AI model.
- Supports search, filtering and optional enhanced model details.

## Props
| Prop | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| `models` | `ModelInfo[] \| string[]` | Yes | List of models to choose from. |
| `selectedModel` | `string` | Yes | Currently chosen model ID. |
| `onModelSelect` | `(id: string) => void` | Yes | Called when a model is selected. |
| `isLoading` | `boolean` | No | Disables the dropdown while loading. |
| `enhanced` | `boolean` | No | Indicates if `models` include extra info. |
| `onShowDetails` | `(model: ModelInfo) => void` | No | Opens the model details sidebar. |

## State Variables
- `isOpen`: `false` – whether the listbox is visible.
- `searchTerm`: `""` – text typed in the search field.
- `filterBy`: `'all'` – current filter category.

## useEffect Hooks
- `[isOpen]` – focuses the search input when the menu opens.
- `[]` – sets up a click-outside listener to close the menu.
- `[isOpen]` – handles keyboard navigation (Escape/Arrow keys).

## Event Handlers
- `handleModelSelect` – chooses a model and closes the menu.
- `handleShowDetails` – calls `onShowDetails` for info buttons.

## Data Flow
- Filters and formats `models` for display, returning the selected ID via `onModelSelect`.

## Usage Locations
- `components/chat/ChatInterface.tsx`

## Notes for Juniors
- Enhanced mode shows badges like "FREE" or "MM" when extra model data is provided.
