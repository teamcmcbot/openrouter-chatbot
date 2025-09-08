# POST /api/chat/images/store

**Purpose**: Stores AI-generated images from chat responses into the database and Supabase storage, creating permanent attachment records for assistant messages.

## Authentication & Authorization

- **Authentication**: **Required** - User must be authenticated
- **Method**: Supabase session cookies or Bearer token
- **Middleware**: `withProtectedAuth` + `withTieredRateLimit`
- **Rate Limiting**: Tier B (20/50/500/1000 requests/hour by subscription tier)
- **Access Control**: Only authenticated users can store assistant images

## Overview

This endpoint handles the storage of AI-generated images that were produced during chat conversations. When the chat API generates images, the frontend receives image data (base64 or data URLs) which must then be permanently stored. This endpoint:

1. Validates ownership of the message and session
2. Processes and validates image data (base64/data URL)
3. Uploads the image to Supabase storage
4. Creates a `chat_attachments` record linking the image to the message
5. Returns attachment metadata and optional signed URL

## Request Format

```typescript
interface StoreImageRequest {
  messageId: string; // ID of the assistant message
  sessionId: string; // Chat session ID
  imageData: string; // Base64 data or data URL
  mimeType: string; // Must be: image/png, image/jpeg, or image/webp
}
```

### Request Body

```json
{
  "messageId": "123e4567-e89b-12d3-a456-426614174000",
  "sessionId": "987fcdeb-51a2-43d8-9c7f-8a1b2c3d4e5f",
  "imageData": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...",
  "mimeType": "image/jpeg"
}
```

### Field Validation

- **messageId**: Required string UUID of an existing assistant message
- **sessionId**: Required string UUID that must belong to the authenticated user
- **imageData**: Required string containing either:
  - Data URL format: `data:image/jpeg;base64,<base64data>`
  - Plain base64 string: `<base64data>`
- **mimeType**: Required string, must be one of:
  - `image/png`
  - `image/jpeg`
  - `image/webp`

## Response Format

### Success Response (200)

```json
{
  "success": true,
  "attachmentId": "att_abc123def456",
  "signedUrl": "https://storage.supabase.co/object/sign/attachments-images/...",
  "storagePath": "user123/2024/01/15/assistant/session456/message789/uuid.jpg"
}
```

### Error Responses

#### 400 Bad Request

```json
{
  "error": "Field \"messageId\" is required",
  "code": "BAD_REQUEST",
  "details": {},
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### 401 Unauthorized

```json
{
  "error": "Authentication required",
  "code": "AUTH_REQUIRED",
  "details": {},
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### 404 Not Found

```json
{
  "error": "Message not found or access denied",
  "code": "NOT_FOUND",
  "details": {},
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### 413 Payload Too Large

```json
{
  "error": "Image exceeds size limit (10MB)",
  "code": "PAYLOAD_TOO_LARGE",
  "details": {},
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Security & Validation

### Access Control

- Verifies the message exists and belongs to an assistant role
- Confirms the session belongs to the authenticated user
- Prevents storing images for user messages (assistant-only)

### Data Validation

- **Size Limit**: 10MB maximum per image
- **MIME Types**: Only PNG, JPEG, and WebP allowed
- **Format**: Accepts both data URLs and plain base64
- **Base64**: Validates proper encoding before processing

### Storage Security

- **Private Bucket**: Stored in `attachments-images` bucket (not public)
- **Organized Path**: `{userId}/{yyyy}/{mm}/{dd}/assistant/{sessionId}/{messageId}/{uuid}.{ext}`
- **Signed URLs**: Generate 1-hour expiry URLs for immediate access
- **Cleanup**: Failed uploads are automatically removed

## Storage Details

### Bucket Structure

```
attachments-images/
└── {userId}/
    └── {year}/
        └── {month}/
            └── {day}/
                └── assistant/
                    └── {sessionId}/
                        └── {messageId}/
                            └── {uuid}.{ext}
```

### Database Record

Creates entry in `chat_attachments` table:

```sql
{
  id: uuid,
  user_id: uuid,
  session_id: uuid,
  message_id: uuid,
  kind: 'image',
  mime: 'image/jpeg|png|webp',
  size_bytes: integer,
  storage_bucket: 'attachments-images',
  storage_path: 'user/path/to/file.ext',
  draft_id: null,  -- Assistant images are not drafts
  status: 'ready',
  created_at: timestamp,
  updated_at: timestamp
}
```

## Rate Limiting

Uses **Tier B** rate limiting (storage operations):

- **Anonymous**: 0 requests/hour (authentication required)
- **Free**: 50 requests/hour
- **Pro**: 500 requests/hour
- **Enterprise**: 1000 requests/hour

## Usage Example

```bash
curl -X POST '/api/chat/images/store' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -d '{
    "messageId": "123e4567-e89b-12d3-a456-426614174000",
    "sessionId": "987fcdeb-51a2-43d8-9c7f-8a1b2c3d4e5f",
    "imageData": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB...",
    "mimeType": "image/png"
  }'
```

## Error Handling

The endpoint includes comprehensive error handling with automatic cleanup:

1. **Validation Errors**: Returns 400 with specific field requirements
2. **Authentication Errors**: Returns 401 for missing/invalid auth
3. **Permission Errors**: Returns 404 if message/session access denied
4. **Upload Failures**: Returns 500 and logs storage errors
5. **Database Failures**: Cleans up uploaded files and returns 500

All errors include structured logging with `requestId` for debugging.

## Related Endpoints

- [`/api/chat`](./chat.md) - Generate images via chat completion
- [`/api/chat/stream`](./streaming-chat-api.md) - Generate images via streaming
- [`/api/attachments/signed-url`](./attachments-signed-url.md) - Get signed URLs for stored images
- [`/api/uploads/images`](./uploads-images.md) - Upload user images (input attachments)

## Implementation Notes

- **Automatic Cleanup**: Failed operations clean up partial uploads
- **UUID Generation**: Uses crypto.randomUUID() when available, falls back to Math.random()
- **Concurrent Safety**: Uses `upsert: false` to prevent overwrites
- **Signed URL Fallback**: Optional signed URL generation continues even if it fails
- **Assistant-Only**: Explicitly restricted to assistant role messages
