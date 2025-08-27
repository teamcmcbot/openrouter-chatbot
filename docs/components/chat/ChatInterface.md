# ChatInterface

## Purpose

- Renders the main chat area with model selection and sidebars.
- Coordinates chat messages, model details, and responsive layout.

## Props

| Prop | Type | Required? | Description                           |
| ---- | ---- | --------- | ------------------------------------- |
| –    | –    | –         | This component does not accept props. |

## State Variables

- `selectedDetailModel`: `null` – model shown in the details sidebar.
- `isDetailsSidebarOpen`: `false` – whether the model details sidebar is visible on mobile.
- `isChatSidebarOpen`: `false` – open state of the chat history sidebar on mobile.
- `selectedTab`: `'overview'` – active tab in the model details sidebar.
- `selectedGenerationId`: `undefined` – generation ID to load pricing/capabilities info.
- `hoveredGenerationId`: `undefined` – highlights a message when hovering a generation ID.
- `scrollToCompletionId`: `undefined` – triggers scroll to a specific message.

## useEffect Hooks

- None in this component.

## Event Handlers

- `handleRetry` – retries the last user message when the error banner’s Retry button is clicked.

### Error banner visibility (updated)

- The banner is shown only when the last failed user message has `retry_available !== false`.
- Previously persisted failures (loaded from server) are marked with `retry_available: false` and won’t trigger the global banner.
- `handleShowDetails` – opens model details for a model picked from the dropdown.
- `handleModelSelect` – updates `selectedModel` and shows details when a model is chosen.
- `handleCloseDetailsSidebar` – hides the details sidebar and clears the selected model info.
- `handleModelClickFromMessage` – opens details when the user clicks a model name in a message.
- `handleGenerationHover` – highlights a message when hovering a generation ID.
- `handleGenerationClick` – scrolls to a message associated with a generation ID.
- `handleNewChat` – reloads the page to start a new conversation.
- `handleToggleChatSidebar` – toggles the chat history sidebar on mobile.

## Data Flow

- Fetches messages and error state from `useChat`.
- Gets available models and the current model from `useModelSelection`.
- Passes messages to `MessageList` and handles sending via `MessageInput`.
- Selected model and details are shared with `ModelDropdown` and `ModelDetailsSidebar`.
- Errors are displayed through `ErrorDisplay` with the ability to retry.

## Usage Locations

- `src/app/chat/page.tsx`

## Notes for Juniors

- `handleNewChat` simply reloads the page; in a real app you might clear state instead.
- The details sidebar auto-opens on desktop using `window.matchMedia('(min-width: 768px)')`.
- When resending a message via `handleRetry`, the original failed message’s error flag is cleared.
