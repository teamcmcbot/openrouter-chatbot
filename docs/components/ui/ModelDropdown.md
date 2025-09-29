# ModelDropdown

## Purpose

- Dropdown menu for selecting an AI model.
- Supports search, filtering and optional enhanced model details.

## Props

| Prop            | Type                         | Required? | Description                               |
| --------------- | ---------------------------- | --------- | ----------------------------------------- |
| `models`        | `ModelInfo[] \| string[]`    | Yes       | List of models to choose from.            |
| `selectedModel` | `string`                     | Yes       | Currently chosen model ID.                |
| `onModelSelect` | `(id: string) => void`       | Yes       | Called when a model is selected.          |
| `isLoading`     | `boolean`                    | No        | Disables the dropdown while loading.      |
| `enhanced`      | `boolean`                    | No        | Indicates if `models` include extra info. |
| `onShowDetails` | `(model: ModelInfo) => void` | No        | Opens the model details sidebar.          |

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

## Refresh lifecycle

- Consumers typically source `models` and `selectedModel` from `useModelSelection()`, which proxies the shared `useModelStore` state. The dropdown itself never issues network requests.
- On first hydration the store restores cached data from `localStorage`. If the cache is missing or older than the 24-hour TTL defined in `CACHE_CONFIG.MODEL_TTL_HOURS`, `fetchModels()` calls `/api/models` and the dropdown re-renders with the fresh list.
- When cached data ages past 80 % of its TTL, the store schedules a background `refreshModels()` run. That refresh happens off the main render path and updates the dropdown as soon as new data arrives.
- Coming back online after an offline period triggers an additional freshness check; if the cache is stale, the store refetches within a second so the dropdown reflects newly available models.
- Optional polling via `startBackgroundRefresh()` (disabled by default) repeats `refreshModels()` every hour (`CACHE_CONFIG.BACKGROUND_REFRESH_INTERVAL`). Any of these store updates flow straight into the dropdown props.

## Usage Locations

- `components/chat/ChatInterface.tsx`

## Notes for Juniors

- Enhanced mode shows badges like "FREE" or "MM" when extra model data is provided.

## Responsive behavior (final)

- Mobile (<640px):

  - Opens as a fixed, centered popover positioned directly under the trigger.
  - Panel width respects viewport; a semi-transparent scrim appears behind (no blur).
  - Position re-computes on open and on `resize`, `scroll`, and `orientationchange` to stay aligned.
  - Escape or scrim tap closes; focus returns to the trigger.

- Tablet/Desktop (≥640px):
  - Opens as an absolutely positioned panel left-anchored to the trigger.
  - Search (if present) autofocuses on desktop; click-outside/Escape closes.

### Visual constraints

- Headers and sidebars use solid backgrounds (no backdrop blur); the mobile scrim has no blur per UX approval.
