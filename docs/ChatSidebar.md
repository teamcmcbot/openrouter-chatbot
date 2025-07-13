# ChatSidebar

## Purpose
- Mobile-friendly panel listing previous chat sessions.
- Allows creating, editing and deleting chat titles.

## Props
| Prop | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| `isOpen` | `boolean` | Yes | Whether the sidebar is visible. |
| `onClose` | `() => void` | Yes | Called when the user closes the sidebar. |
| `onNewChat` | `() => void` | Yes | Triggered by the New Chat button. |
| `className` | `string` | No | Extra CSS classes.

## State Variables
- `chatHistory`: sample chats list used for the sidebar.
- `editingId`: `null` – ID of the chat currently being renamed.
- `editTitle`: `""` – text for the new title.

## useEffect Hooks
- None

## Event Handlers
- `handleStartEdit` – begins renaming a chat.
- `handleSaveEdit` – applies the edited title.
- `handleCancelEdit` – exits edit mode without saving.
- `handleDeleteChat` – removes a chat from the list.

## Data Flow
- Maintains local chat history and displays it with edit controls.

## Usage Locations
- `components/chat/ChatInterface.tsx`

## Notes for Juniors
- The chat history here is mock data; in a real app you would load it from storage.
