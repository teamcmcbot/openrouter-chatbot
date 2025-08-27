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

- `handleRetry` – retries the last user message when the error banner’s Retry button is clicked. Dismisses the ephemeral banner for the active conversation before retry.

### Error banner visibility (session-only)

- The banner renders when `conversationErrorBanners[currentConversationId]` exists.
- It’s session-scoped and per-conversation; not persisted and not shown for historical failures after sign-in/out.
- Retry button visibility depends on the failed user message (non-retryable codes are filtered; `retry_available === false` hides the button).
- `handleShowDetails` – opens model details for a model picked from the dropdown.
- `handleModelSelect` – updates `selectedModel` and shows details when a model is chosen.
- `handleCloseDetailsSidebar` – hides the details sidebar and clears the selected model info.
- `handleModelClickFromMessage` – opens details when the user clicks a model name in a message.
- `handleGenerationHover` – highlights a message when hovering a generation ID.
- `handleGenerationClick` – scrolls to a message associated with a generation ID.
- `handleNewChat` – creates a new conversation, closes the sidebar on mobile, and focuses the input.
- `handleToggleChatSidebar` – toggles the chat history sidebar on mobile.

## Data Flow

- Fetches messages and streaming state from `useChatStreaming`.
- Gets available models and the current model from `useModelSelection`.
- Passes messages to `MessageList` and handles sending via `MessageInput`.
- Selected model and details are shared with `ModelDropdown` and `ModelDetailsSidebar`.
- Errors are displayed via `ErrorDisplay` using the ephemeral per-conversation banner.

## Usage Locations

- `src/app/chat/page.tsx`

## Notes for Juniors

- `handleNewChat` simply reloads the page; in a real app you might clear state instead.
- The details sidebar auto-opens on desktop using `window.matchMedia('(min-width: 768px)')`.
- Manual banner dismissal does not mutate `message.error`; successful retry clears message error flags as part of the retry flow.

### Related docs

- See `docs/components/chat/error-banner-session-behavior.md` for the full banner lifecycle.
