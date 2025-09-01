# ChatSidebar

## Purpose

- Mobile-friendly panel listing previous chat sessions.
- Allows creating, editing and deleting chat titles.
- Shows sync status when a user is signed in.
- Provides access to user settings.

## Props

| Prop        | Type         | Required? | Description                              |
| ----------- | ------------ | --------- | ---------------------------------------- |
| `isOpen`    | `boolean`    | Yes       | Whether the sidebar is visible.          |
| `onClose`   | `() => void` | Yes       | Called when the user closes the sidebar. |
| `onNewChat` | `() => void` | Yes       | Triggered by the New Chat button.        |
| `className` | `string`     | No        | Extra CSS classes.                       |

## State Variables

- `editingId`: `null` – ID of the conversation currently being renamed.
- `editTitle`: `""` – new title value while editing.

## useEffect Hooks

- None

## Event Handlers

- `handleStartEdit` – begins renaming a chat.
- `handleSaveEdit` – applies the edited title.
- `handleCancelEdit` – exits edit mode without saving.
- `handleDeleteChat` – removes a chat from the list.
- `handleClearAllConversations` – deletes all saved conversations.
- `handleConversationClick` – switches the active conversation and closes the panel on mobile.
- `handleSettingsClick` – opens the `UserSettings` modal.

## Data Flow

- Reads conversations from `useChatStore` and displays them with edit controls.
- Uses `useChatSync` to perform initial sign-in sync of conversations when authenticated.
- Relative timestamps are formatted with `formatConversationTimestamp`.
- When not authenticated, a prompt encourages the user to sign in for sync.
- Conversation titles automatically update after the first successful message, including retries.

## Usage Locations

- `components/chat/ChatInterface.tsx`

## Notes for Juniors

- Conversations come from `useChatStore` and may be synced to the backend when signed in.

## Mobile Long‑Press Actions

- Long‑press (500ms) on a conversation row opens a bottom Action Sheet with actions: Delete and Edit Title.
- The sheet has no separate title label; it shows a contextual header with the conversation title and a one‑line preview.
- The Action Sheet receives `contextTitle` and `contextSubtitle` to display the selected conversation’s title and a one‑line preview.
- Movement over 8px cancels the long‑press to avoid accidental triggers during scroll.

### iOS considerations

- Disable text selection and touch callout during long‑press (`user-select: none`, `-webkit-touch-callout: none`).
- Allow vertical scroll while suppressing unintended gestures (`touch-action: pan-y`).
- Prevent the system context menu while the sheet is opening (suppress `contextmenu`).

### Visual state and a11y

- When the sheet opens, the pressed row is highlighted with a ring; others are dimmed; the row is scrolled into view.
- The highlighted row sets `aria-selected` for assistive tech.
- The sheet focuses the first action on open and closes on Escape or backdrop click.

### Deletion and editing semantics

- Delete executes immediately with no Undo. On success, a toast notification confirms: “Conversation deleted successfully.”
- Edit Title renders an inline form inside the Action Sheet with Save/Cancel. On successful save, a toast.success("Conversation title updated.") is shown and the sheet closes.
