# useChatStore

## Purpose / Overview
Manages chat conversations including message history and active conversation.
State is persisted to `localStorage` using Zustand's `persist` middleware.
A hydration flag prevents mismatches during SSR.

## State Shape
| State Variable | Type | Description |
| -------------- | ---- | ----------- |
| `conversations` | `Conversation[]` | All saved conversations. |
| `currentConversationId` | `string \| null` | ID of the active conversation. |
| `isLoading` | `boolean` | `true` while waiting for an API response. |
| `error` | `ChatError \| null` | Last request error. |
| `isHydrated` | `boolean` | `true` once state is restored from storage. |

## Actions / Methods
| Action | Parameters | Description |
| ------ | ---------- | ----------- |
| `createConversation` | `(title?: string)` | Start a new conversation and return its ID. |
| `switchConversation` | `(id: string)` | Mark a conversation as active. |
| `sendMessage` | `(content: string, model?: string)` | Send a user message to the backend. |
| `updateConversationTitle` | `(id: string, title: string)` | Rename a conversation. |
| `deleteConversation` | `(id: string)` | Remove a conversation and select another if available. |
| `clearCurrentMessages` | `()` | Remove all messages from the current conversation. |
| `clearError` | `()` | Reset the `error` state. |
| `clearMessageError` | `(messageId: string)` | Clear the error flag on a specific message. |
| `retryLastMessage` | `()` | Resend the last user message. |

## Selectors / Computed State
| Selector | Description |
| -------- | ----------- |
| `getCurrentConversation()` | Returns the active conversation object. |
| `getCurrentMessages()` | Messages from the active conversation. |
| `getConversationById(id)` | Find a conversation by ID. |
| `getConversationCount()` | Number of stored conversations. |
| `getTotalMessages()` | Total messages across all conversations. |
| `getRecentConversations(limit?)` | Conversations sorted by recent activity. |

## Persistence Behavior
- Uses `persist` with `createJSONStorage` to store conversations in `localStorage`.
- Only `conversations` and `currentConversationId` are persisted.
- Dates are deserialized on rehydrate and `_hasHydrated()` sets `isHydrated`.

## SSR Considerations
`useChat` and `useChatStore` avoid returning data until `isHydrated` is `true`
to prevent hydration mismatches when server rendering.

## Wrapper Hooks
`useChat()` wraps the store for backward compatibility. It hides
internal state until hydration completes.

## Developer Tips
- `createLogger('ChatStore')` logs actions when devtools are enabled.
- Store utilities in `storeUtils.ts` provide safe localStorage helpers.
