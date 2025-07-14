# useUIStore

## Purpose / Overview
Holds UI related state such as sidebar visibility, selected tabs
and the current theme. A subset of preferences persists in
`localStorage`.

## State Shape
| State Variable | Type | Description |
| -------------- | ---- | ----------- |
| `selectedDetailModel` | `ModelInfo \| null` | Model shown in the details sidebar. |
| `isDetailsSidebarOpen` | `boolean` | Whether the model details sidebar is open. |
| `isChatSidebarOpen` | `boolean` | Chat history sidebar open state. |
| `selectedTab` | `'overview' \| 'pricing' \| 'capabilities'` | Active tab in details view. |
| `selectedGenerationId` | `string | undefined` | Generation to highlight. |
| `hoveredGenerationId` | `string \| undefined` | Message hovered via generation ID. |
| `scrollToCompletionId` | `string \| undefined` | Triggers scroll to a completion item. |
| `theme` | `'light' \| 'dark' \| 'system'` | Preferred color theme. |
| `isMobile` | `boolean` | Responsive flag set by the layout. |

## Actions / Methods
| Action | Parameters | Description |
| ------ | ---------- | ----------- |
| `setSelectedDetailModel` | `(model \| null)` | Update the model shown in the sidebar. |
| `setIsDetailsSidebarOpen` | `(open: boolean)` | Toggle model details sidebar. |
| `setIsChatSidebarOpen` | `(open: boolean)` | Set chat sidebar visibility. |
| `toggleChatSidebar` | `()` | Convenience toggle for the chat sidebar. |
| `setSelectedTab` | `(tab)` | Change the active details tab. |
| `setSelectedGenerationId` | `(id \| undefined)` | Store the active generation ID. |
| `setHoveredGenerationId` | `(id \| undefined)` | Store the generation being hovered. |
| `setScrollToCompletionId` | `(id \| undefined)` | Scroll to a particular message. |
| `setTheme` | `(theme)` | Update the color theme. |
| `setIsMobile` | `(mobile: boolean)` | Flag the layout as mobile or desktop. |
| `showModelDetails` | `(model, tab?, generationId?)` | Open the model details sidebar. |
| `closeDetailsSidebar` | `()` | Hide the details sidebar. |
| `handleModelClickFromMessage` | `(modelId, tab?, generationId?)` | Placeholder for clicks. |
| `handleGenerationClick` | `(generationId: string)` | Trigger scrolling to a message. |

## Selectors / Computed State
None. Components subscribe directly to state slices via the store hook.

## Persistence Behavior
- Persists `theme` and `isChatSidebarOpen` under `STORAGE_KEYS.UI_PREFERENCES`.
- Other values reset when the page reloads.

## SSR Considerations
No hydration flag is used. Persistence only occurs in the browser via
`localStorage`.

## Wrapper Hooks
- `useDetailsSidebar()` exposes convenient getters for the details sidebar.
- `useChatSidebarState()` manages the chat sidebar toggle.
- `useTheme()` returns the theme and setter.

## Developer Tips
- The store logs actions through `createLogger('UIStore')` when devtools are enabled.
- Only theme and chat sidebar openness persist; clear localStorage to reset them.
