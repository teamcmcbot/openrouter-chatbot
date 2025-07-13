# MarkdownRenderer

## Purpose
- Converts markdown text into formatted HTML.
- Applies GitHub-flavored markdown and code highlighting.

## Props
| Prop | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| `content` | `string` | Yes | Markdown string to display. |

## State Variables
- None

## useEffect Hooks
- None

## Event Handlers
- None

## Data Flow
- Uses `ReactMarkdown` with `remark-gfm` and `rehype-highlight`.
- Custom components from `MarkdownComponents` handle code blocks and tables.

## Usage Locations
- `components/chat/MessageContent.tsx`

## Notes for Juniors
- Wrapped in `React.memo` to avoid re-rendering when content does not change.
