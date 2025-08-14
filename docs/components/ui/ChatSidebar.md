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

## Usage Locations

- `components/chat/ChatInterface.tsx`

## Notes for Juniors

- Conversations come from `useChatStore` and may be synced to the backend when signed in.
