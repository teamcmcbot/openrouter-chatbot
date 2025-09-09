# MessageContent

## Purpose

- Displays the content of a single chat message.
- Lazily loads the markdown renderer when needed for markdown messages.
- Renders AI-generated images in assistant messages.

## Props

| Prop      | Type          | Required? | Description             |
| --------- | ------------- | --------- | ----------------------- |
| `message` | `ChatMessage` | Yes       | Message data to render. |

## State Variables

- None (stateless component)

## useEffect Hooks

- None

## Event Handlers

- None (delegates to child components)

## Data Flow

- Receives a `ChatMessage` and renders markdown through `MarkdownRenderer` if `message.contentType` is `markdown`.
- Falls back to a plain paragraph for text content.
- Renders `ImageGenerationGallery` for assistant messages containing generated images.

## Image Generation Support

When an assistant message contains generated images, the component automatically renders an `ImageGenerationGallery` below the text content:

```tsx
{
  message.role === "assistant" &&
    message.images &&
    message.images.length > 0 && (
      <ImageGenerationGallery
        images={message.images}
        messageId={message.id}
        className="mt-4"
      />
    );
}
```

The `images` array contains:

- `attachmentId`: Database reference for the image
- `url`: Signed URL for secure image access
- `mimeType`: Image format (PNG, JPEG, WebP)

## Message Types

### Text Messages

- Plain text rendered in paragraph tags
- Basic formatting preserved

### Markdown Messages

- Full markdown rendering via `MarkdownRenderer`
- Syntax highlighting for code blocks
- Link processing and safety

### Assistant Messages with Images

- Text content rendered first (markdown or plain)
- Image gallery rendered below content
- Responsive grid layout for multiple images

## Usage Locations

- `components/chat/MessageList.tsx` - Main message rendering
- `components/chat/ChatInterface.tsx` - Individual message display

## Child Components

- `MarkdownRenderer` - Handles markdown processing (lazy loaded)
- `ImageGenerationGallery` - Renders AI-generated images

## Notes for Juniors

- Uses `React.lazy` and `Suspense` so the markdown renderer is loaded only when needed.
- Image rendering is conditional based on message role and presence of images.
- Component remains stateless - all image state managed by `ImageGenerationGallery`.
