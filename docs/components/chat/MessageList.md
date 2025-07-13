# MessageList

## Purpose
- Shows the entire conversation thread with copy and scroll helpers.
- Handles markdown rendering and message highlighting.

## Props
| Prop | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| `messages` | `ChatMessage[]` | Yes | Messages to display. |
| `isLoading` | `boolean` | Yes | Whether a bot response is being streamed. |
| `onModelClick` | `(id: string, tab?, generationId?) => void` | No | Opens model details. |
| `hoveredGenerationId` | `string` | No | ID of the message currently highlighted. |
| `scrollToCompletionId` | `string` | No | When set, scrolls to the matching message. |

## State Variables
- `copiedMessageId`: `null` – which message was copied to the clipboard.

## useEffect Hooks
- `[scrollToCompletionId]` – scrolls to a specific message when the ID changes.
- `[messages, isLoading]` – keeps the list scrolled to the bottom after updates.

## Event Handlers
- `handleCopyMessage` – triggered by the copy button on each message.
- `scrollToMessage` – locates a message element and scrolls it into view.

## Data Flow
- Receives messages and renders them with avatars and timestamps.
- Calls `onModelClick` when a model or generation ID is clicked.

## Usage Locations
- `components/chat/ChatInterface.tsx`

## Notes for Juniors
- Uses `ReactMarkdown` for rich content and memoizes it for performance.
