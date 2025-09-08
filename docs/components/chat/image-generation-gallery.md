# Image Generation Gallery

Component responsible for rendering AI-generated images within assistant messages, with support for lightbox viewing, download functionality, and loading states.

## Purpose

- Display AI-generated images attached to assistant messages
- Provide lightbox modal for full-size image viewing
- Handle image loading states and error recovery
- Support image download and sharing functionality

## Props

| Prop        | Type               | Required? | Description                          |
| ----------- | ------------------ | --------- | ------------------------------------ |
| `images`    | `GeneratedImage[]` | Yes       | Array of generated image metadata    |
| `messageId` | `string`           | Yes       | Message ID for context and analytics |
| `className` | `string`           | No        | Additional CSS classes               |

## Types

```typescript
interface GeneratedImage {
  attachmentId: string; // Unique attachment identifier
  url: string; // Signed URL for image access
  mimeType: string; // image/png, image/jpeg, image/webp
  alt?: string; // Optional alt text for accessibility
}
```

## State Variables

- `lightboxOpen`: boolean - Controls lightbox modal visibility
- `selectedImageIndex`: number - Index of currently viewed image in lightbox
- `imageErrors`: Record<string, boolean> - Tracks failed image loads
- `loadingStates`: Record<string, boolean> - Tracks image loading states

## Key Features

### Grid Layout

- **Single Image**: Full-width display with rounded corners
- **Multiple Images**: CSS Grid layout with responsive sizing
- **Mobile Optimization**: Horizontal scroll on smaller screens
- **Aspect Ratio**: Maintains image proportions while constraining dimensions

### Lightbox Modal

- **Navigation**: Arrow keys and click navigation between images
- **Keyboard Support**: ESC to close, arrow keys for navigation
- **Body Scroll Lock**: Prevents background scrolling when open
- **Click Outside**: Closes modal when clicking overlay
- **Image Counter**: Shows "1 of 3" style position indicator

### Loading & Error States

- **Loading Skeleton**: Animated placeholder while images load
- **Error Fallback**: Retry button and error message for failed loads
- **Progressive Enhancement**: Images fade in smoothly when loaded

## Event Handlers

### `handleImageClick(index: number)`

Opens lightbox modal at specified image index.

### `handleLightboxClose()`

Closes lightbox modal and restores body scroll.

### `handleImageError(attachmentId: string)`

Marks image as failed and shows error state.

### `handleImageLoad(attachmentId: string)`

Removes loading state when image successfully loads.

### `handleDownload(image: GeneratedImage)`

Triggers download of full-resolution image.

## Accessibility Features

- **Alt Text**: Generated from image context or fallback descriptions
- **Keyboard Navigation**: Full keyboard support for lightbox
- **Screen Reader**: Proper ARIA labels and live regions
- **Focus Management**: Traps focus within lightbox when open
- **Color Contrast**: High contrast error states and loading indicators

## Styling

### CSS Classes

```css
.image-generation-gallery {
  /* Grid container */
}

.image-generation-gallery__single {
  /* Single image full-width layout */
}

.image-generation-gallery__grid {
  /* Multi-image grid layout */
}

.image-generation-gallery__item {
  /* Individual image container */
}

.image-generation-gallery__image {
  /* Image styling with loading states */
}

.image-generation-gallery__lightbox {
  /* Modal overlay and positioning */
}

.image-generation-gallery__error {
  /* Error state styling */
}
```

### Responsive Breakpoints

- **Mobile (< 640px)**: Single column, horizontal scroll
- **Tablet (640px - 1024px)**: 2-column grid for multiple images
- **Desktop (> 1024px)**: 3-column grid maximum

## Data Flow

1. **Receive Props**: Component receives `images` array from parent message
2. **Load Images**: Initiates loading for each image URL
3. **Handle States**: Manages loading, success, and error states per image
4. **User Interaction**: Responds to clicks, keyboard input, and gestures
5. **Lightbox Control**: Opens/closes modal and manages navigation

## Integration Points

### Parent Components

- `MessageContent.tsx` - Renders gallery within assistant messages
- `MessageList.tsx` - Provides message context and scrolling container

### API Dependencies

- `GET /api/attachments/:id/signed-url` - Fetches fresh signed URLs on expiry
- Signed URL caching via `lib/utils/signedUrlCache.ts`

### Storage Integration

- **Supabase Storage**: Images stored in `attachments-images` bucket
- **Signed URLs**: Time-limited access (1 hour default)
- **Cache Strategy**: SessionStorage for URL caching with TTL

## Error Handling

### Image Load Failures

```typescript
const handleImageError = (attachmentId: string) => {
  setImageErrors((prev) => ({ ...prev, [attachmentId]: true }));

  // Show retry button and error message
  toast.error("Failed to load image. Click to retry.");
};
```

### Signed URL Expiry

```typescript
const refreshImageUrl = async (attachmentId: string) => {
  try {
    const response = await fetch(`/api/attachments/${attachmentId}/signed-url`);
    const { signedUrl } = await response.json();

    // Update image source and clear error state
    updateImageUrl(attachmentId, signedUrl);
  } catch (error) {
    setImageErrors((prev) => ({ ...prev, [attachmentId]: true }));
  }
};
```

## Usage Example

```tsx
import { ImageGenerationGallery } from "./ImageGenerationGallery";

const MessageContent = ({ message }: { message: ChatMessage }) => {
  return (
    <div className="message-content">
      <MarkdownRenderer content={message.content} />

      {message.images && message.images.length > 0 && (
        <ImageGenerationGallery
          images={message.images}
          messageId={message.id}
          className="mt-4"
        />
      )}
    </div>
  );
};
```

## Performance Considerations

### Image Optimization

- **Lazy Loading**: Images load when scrolled into view
- **Progressive Enhancement**: Text content renders immediately
- **Memory Management**: Object URLs released when component unmounts

### Caching Strategy

- **Signed URL Cache**: Prevents redundant API calls
- **Browser Cache**: Standard HTTP caching for image assets
- **Preloading**: Next/previous images preloaded in lightbox

## Mobile Considerations

### Touch Gestures

- **Swipe Navigation**: Left/right swipe in lightbox
- **Pinch Zoom**: Native browser zoom in lightbox
- **Touch Feedback**: Visual feedback for touch interactions

### Performance

- **Image Sizing**: Appropriate dimensions for mobile screens
- **Network Awareness**: Progressive loading on slower connections
- **Battery Optimization**: Efficient rendering and event handling

## Related Components

- [`MessageContent`](./MessageContent.md) - Parent container for message rendering
- [`InlineAttachment`](../ui/InlineAttachment.md) - Input attachment rendering
- [`Lightbox`](../ui/Lightbox.md) - Shared lightbox modal component

## Security Notes

- **Signed URLs**: All image access uses time-limited signed URLs
- **Cross-Origin**: Images served from Supabase with proper CORS headers
- **Content Security Policy**: Images comply with CSP image-src directives
