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

### Mobile long-press actions

- Touch-only long-press (500ms) on a conversation row opens an Action Sheet with contextual actions: Delete and Edit Title.
- Movement > 8px cancels the long-press (prevents accidental triggers during scroll).
- A one-time hint toast is shown on first mobile use to teach the long-press gesture.
- The sheet has no separate title label; only the contextual header (conversation title + one-line preview) is shown.

#### iOS hardening

- Suppresses iOS selection/callout during long-press: `user-select: none`, `-webkit-touch-callout: none`.
- Allows vertical scrolling while preventing unintended gestures: `touch-action: pan-y`.
- Prevents the system context menu via `contextmenu` event suppression while the sheet is opening.

#### Visual selection and context

- When the Action Sheet opens, the corresponding conversation row is highlighted (ring) and non-selected rows are dimmed for clarity.
- The selected row is auto-scrolled into view to ensure context.
- The Action Sheet header displays the conversation title and a short last-message preview.

#### Delete and edit semantics

- Delete performs immediately with no Undo flow. After successful deletion, a toast.success("Conversation deleted successfully.") is shown.
- Edit Title presents an inline rename form rendered inside the Action Sheet with Save/Cancel.
- On successful save, a toast.success("Conversation title updated.") is shown and the sheet closes.

#### Accessibility

- Action Sheet supports keyboard dismissal (Escape) and backdrop click to close; first actionable button is focused on open.
- The selected list item sets `aria-selected` to true while the sheet is open and has a stable DOM id for linking.
