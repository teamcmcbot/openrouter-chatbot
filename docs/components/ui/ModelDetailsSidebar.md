# ModelDetailsSidebar

## Purpose
- Sidebar showing detailed information about a selected model.
- Can display pricing, capabilities and generation metrics.

## Props
| Prop | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| `model` | `ModelInfo \| null` | Yes | Model to show or `null` for placeholder. |
| `isOpen` | `boolean` | Yes | Controls sidebar visibility on mobile. |
| `onClose` | `() => void` | Yes | Closes the sidebar. |
| `initialTab` | `'overview' \| 'pricing' \| 'capabilities'` | No | Tab shown on open. |
| `generationId` | `string` | No | Optional generation to fetch pricing for. |
| `onGenerationHover` | `(id?: string) => void` | No | Highlights a message on hover. |
| `onGenerationClick` | `(id: string) => void` | No | Scrolls to the related message. |

## State Variables
- `activeTab`: from `initialTab` – which tab is currently active.
- `generationData`: `null` – data fetched for `generationId`.
- `loadingGeneration`: `false` – loading state for generation fetch.
- `generationError`: `null` – error message from the fetch.
- `isGenerationIdHovered`: `false` – whether the ID is highlighted.

## useEffect Hooks
- `[initialTab, model?.id]` – resets the active tab when props change.
- `[generationId, activeTab]` – fetches generation data when viewing pricing.

## Event Handlers
- `setActiveTab` triggered by tab buttons.
- Hover and click handlers on generation IDs communicate with parent callbacks.

## Data Flow
- Displays `model` information and optionally fetches extra data from `/api/generation`.
- Uses `Button` for closing and interacts with `MessageList` via hover/click callbacks.

## Usage Locations
- `components/chat/ChatInterface.tsx`

## Notes for Juniors
- Clearing `generationData` when the tab changes avoids showing stale info.
