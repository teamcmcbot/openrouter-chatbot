# useChat

## Purpose / high-level description
- Manages the chat conversation between the user and the assistant.
- Sends messages to `/api/chat` and stores both the request and response.

## Parameters
| Name | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| – | – | – | This hook takes no parameters. |

## Returned values
| Name | Type | Description |
| ---- | ---- | ----------- |
| `messages` | `ChatMessage[]` | Ordered list of user and assistant messages. |
| `isLoading` | `boolean` | `true` while awaiting a reply from the server. |
| `error` | `{ message: string; code?: string; suggestions?: string[]; retryAfter?: number; timestamp?: string } \| null` | Details about the last request error. |
| `sendMessage` | `(content: string, model?: string) => Promise<void>` | Sends a user message to the API. |
| `clearMessages` | `() => void` | Removes all messages and any error. |
| `clearError` | `() => void` | Clears the error state only. |
| `clearMessageError` | `(id: string) => void` | Resets the error flag on a specific message. |

## State variables
- `messages` – `[]` – stores every chat message.
- `isLoading` – `false` – indicates when a request is in progress.
- `error` – `null` – holds information about the last failure.

## Side effects
- No `useEffect` hooks are used.
- `sendMessage` performs an asynchronous fetch and updates state when it completes.

## Persistence mechanisms
- None. All state lives only in memory.

## Example usage
```tsx
const { messages, sendMessage, isLoading } = useChat();

const handleSend = async () => {
  await sendMessage(inputValue);
};
```

## Notes for juniors
- Ignore empty input strings; the hook does not send them.
- Network errors add a placeholder assistant message in development mode.
- Use `clearMessages` to reset the conversation when starting over.
