## Component: ChatSidebar

The ChatSidebar renders a paginated list of conversation summaries and triggers lazy loading of messages when a conversation is selected.

### Data flow

- On mount: calls `useChatStore.loadInitialConversations()` which requests GET `/api/chat/sync?summary_only=true`.
- "Load more…": calls `useChatStore.loadMoreConversations()` with the cursor from `meta.nextCursor`.
- On click of a conversation item:
  1. `useChatStore.switchConversation(id)` marks it active.
  2. If messages for that session aren’t in state, `useChatStore.loadConversationMessages(id)` fetches GET `/api/chat/messages?session_id=...` and merges them.

### UX notes

- The list is ordered by `last_message_timestamp DESC` (server-enforced), newest first.
- A subtle loading state is recommended when messages are first loading.
- "Load more…" is shown when `meta.hasMore` is true.

### Error handling

- API errors are logged; store maintains an `error` string you can surface as a toast if desired.
