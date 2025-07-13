# MarkdownComponents

## Purpose
- Provides styled elements used when rendering markdown content.
- Includes code blocks with copy buttons, tables, blockquotes and links.

## Props
| Prop | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| various | – | – | Each export has its own simple props mirroring HTML tags. |

## State Variables
- `copied` in `CustomPreBlock`: `false` – shows a "Copied" message when code is copied.

## useEffect Hooks
- None

## Event Handlers
- `handleCopy` in `CustomPreBlock` – copies the code text to the clipboard.

## Data Flow
- Used by `MarkdownRenderer` and `MessageList` to render markdown elements with extra UI.

## Usage Locations
- `components/chat/MarkdownRenderer.tsx`
- `components/chat/MessageList.tsx`

## Notes for Juniors
- These components are basic wrappers around regular HTML elements with Tailwind styles.
