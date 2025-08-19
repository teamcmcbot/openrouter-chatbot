# MessageList

## Purpose

- Shows the entire conversation thread with copy and scroll helpers.
- Handles markdown rendering and message highlighting.
- Displays user avatars for signed in users.

## Props

| Prop                   | Type                                        | Required? | Description                                |
| ---------------------- | ------------------------------------------- | --------- | ------------------------------------------ |
| `messages`             | `ChatMessage[]`                             | Yes       | Messages to display.                       |
| `isLoading`            | `boolean`                                   | Yes       | Whether a bot response is being streamed.  |
| `onModelClick`         | `(id: string, tab?, generationId?) => void` | No        | Opens model details.                       |
| `hoveredGenerationId`  | `string`                                    | No        | ID of the message currently highlighted.   |
| `scrollToCompletionId` | `string`                                    | No        | When set, scrolls to the matching message. |

## State Variables

- `copiedMessageId`: `null` – which message was copied to the clipboard.
- `failedAvatars`: `Set<string>` – avatar URLs that failed to load.

## useEffect Hooks

- `[scrollToCompletionId]` – scrolls to a specific message when the ID changes.
- `[messages, isLoading]` – keeps the list scrolled to the bottom after updates.

## Event Handlers

- `handleCopyMessage` – triggered by the copy button on each message.
- `scrollToMessage` – locates a message element and scrolls it into view.
- `handleAvatarError` – falls back to initials when the avatar fails to load.

## Data Flow

- Receives messages and renders them with avatars and timestamps.
- Calls `onModelClick` when a model or generation ID is clicked.
- `useAuthStore` supplies user info for avatar display.
- Timestamp rendering uses `formatMessageTime` from `lib/utils/dateFormat`.

## Usage Locations

- `components/chat/ChatInterface.tsx`

## Notes for Juniors

- Uses `ReactMarkdown` for rich content and memoizes it for performance.
- Avatar images are rendered with Next.js `Image` and fall back to "ME" if they fail to load.

## Web Search Indicators

- When an assistant message was generated with web search, a small "Web" chip appears next to the model tag.
- If the response includes URL citations (from OpenRouter annotations), a "Sources" section renders under the message, listing each citation with a clickable title/URL and optional snippet.
