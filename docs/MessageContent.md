# MessageContent

## Purpose
- Displays the content of a single chat message.
- Lazily loads the markdown renderer when needed for markdown messages.

## Props
| Prop | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| `message` | `ChatMessage` | Yes | Message data to render. |

## State Variables
- None

## useEffect Hooks
- None

## Event Handlers
- None

## Data Flow
- Receives a `ChatMessage` and renders markdown through `MarkdownRenderer` if `message.contentType` is `markdown`.
- Falls back to a plain paragraph for text content.

## Usage Locations
- Not referenced by other components in this repo.

## Notes for Juniors
- Uses `React.lazy` and `Suspense` so the markdown renderer is loaded only when needed.
