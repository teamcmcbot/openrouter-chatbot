# MessageInput

## Purpose
- Text area for the user to compose and send a message.
- Triggers `onSendMessage` when Enter is pressed or the send button is clicked.

## Props
| Prop | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| `onSendMessage` | `(msg: string) => void` | Yes | Called with the trimmed text. |
| `disabled` | `boolean` | No | Disables input and shows a spinner. |

## State Variables
- `message`: `""` – current text in the textarea.

## useEffect Hooks
- None

## Event Handlers
- `handleSend` – sends the message and clears the field.
- `handleKeyPress` – submits on Enter unless Shift is held.
- `onInput` – auto-resizes the textarea height.

## Data Flow
- Sends the entered text upward via `onSendMessage`.

## Usage Locations
- `components/chat/ChatInterface.tsx`

## Notes for Juniors
- Prevent the default Enter behavior so the form does not submit or add a new line.
