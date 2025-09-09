# Image Generation Architecture

## Overview

The image generation system integrates AI-powered image creation into the chat experience, supporting both streaming and non-streaming modes. The architecture provides seamless image generation through OpenRouter's API, automatic storage management, cost tracking, and tier-based access controls.

## System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Chat Frontend │    │   API Endpoints  │    │   OpenRouter    │
│                 │    │                  │    │                 │
│ • Image Toggle  │◄──►│ /api/chat        │◄──►│ • DALL-E Models │
│ • Gallery View  │    │ /api/chat/stream │    │ • Image Gen API │
│ • Cost Display  │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                        │
         │                       ▼                        │
         │              ┌──────────────────┐              │
         │              │ Image Processing │              │
         │              │                  │              │
         │              │ • Validation     │              │
         │              │ • Base64 Decode  │              │
         │              │ • Storage        │              │
         │              └──────────────────┘              │
         │                       │                        │
         │                       ▼                        │
         │              ┌──────────────────┐              │
         │              │ /api/chat/images/│              │
         │              │      store       │              │
         │              │                  │              │
         │              │ • Auth Check     │              │
         │              │ • File Upload    │              │
         │              │ • DB Record      │              │
         │              └──────────────────┘              │
         │                       │                        │
         │                       ▼                        │
         │              ┌──────────────────┐              │
         │              │ Supabase Storage │              │
         │              │                  │              │
         │              │ • Private Bucket │              │
         │              │ • Signed URLs    │              │
         │              │ • Retention      │              │
         │              └──────────────────┘              │
         │                       │                        │
         │                       ▼                        │
         └──────────────► ┌──────────────────┐ ◄──────────┘
                         │ Database Storage │
                         │                  │
                         │ • Messages       │
                         │ • Attachments    │
                         │ • Usage Costs    │
                         │ • Tokens         │
                         └──────────────────┘
```

## Core Components

### 1. Request Processing

#### Chat Endpoints

- **Standard Mode**: `/api/chat` processes image generation synchronously
- **Streaming Mode**: `/api/chat/stream` handles image generation after text completion
- **Parameter**: `imageGeneration: true` enables the feature

#### Validation Pipeline

```typescript
// 1. Tier Validation
if (!features.imageGeneration && imageGeneration) {
  throw new ApiErrorResponse("Image generation requires Pro+ subscription");
}

// 2. Model Validation
if (imageGeneration && !model.supports_image_generation) {
  throw new ApiErrorResponse("Model does not support image generation");
}

// 3. Rate Limiting (Tier A - most restrictive)
export const POST = withProtectedAuth(
  withTieredRateLimit(chatHandler, { tier: "tierA" })
);
```

### 2. OpenRouter Integration

#### Request Transformation

```typescript
// Base chat request enhanced with image generation
const openRouterRequest = {
  model,
  messages,
  temperature,
  // Image generation is enabled via model selection
  // OpenRouter DALL-E models automatically generate images
};
```

#### Response Processing

```typescript
interface OpenRouterResponse {
  choices: [
    {
      message: {
        content: string;
        // Images provided as data URLs or base64
        attachments?: {
          type: "image";
          data: string; // base64 or data URL
          mimetype: string;
        }[];
      };
    }
  ];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    // Image-specific usage
    image_tokens?: number;
    image_cost?: number;
  };
}
```

### 3. Image Storage Pipeline

#### Immediate Processing

1. **Image Extraction**: Extract images from OpenRouter response
2. **Format Validation**: Support data URLs and base64 strings
3. **Size Validation**: 10MB limit per image
4. **MIME Validation**: PNG, JPEG, WebP only

#### Storage Process

```typescript
// 1. Storage Path Generation
const storagePath = `${userId}/${yyyy}/${mm}/${dd}/assistant/${sessionId}/${messageId}/${uuid}.${ext}`;

// 2. Supabase Upload
const { error } = await supabase.storage
  .from("attachments-images")
  .upload(storagePath, buffer, {
    contentType: mimeType,
    upsert: false,
  });

// 3. Database Record
const attachment = await supabase.from("chat_attachments").insert({
  user_id: userId,
  message_id: messageId,
  session_id: sessionId,
  kind: "image",
  mime: mimeType,
  size_bytes: buffer.length,
  storage_bucket: "attachments-images",
  storage_path: storagePath,
  status: "ready",
});

// 4. Signed URL Generation
const { data: signedUrl } = await supabase.storage
  .from("attachments-images")
  .createSignedUrl(storagePath, 3600); // 1 hour expiry
```

## Database Schema Extensions

### Enhanced Message Storage

```sql
-- chat_messages table extensions
ALTER TABLE chat_messages ADD COLUMN output_image_tokens INTEGER DEFAULT 0;
ALTER TABLE chat_messages ADD COLUMN output_image_costs DECIMAL(10,6) DEFAULT 0.0;

-- Updated message record
INSERT INTO chat_messages (
  id, session_id, role, content, model,
  total_tokens, input_tokens, output_tokens,
  output_image_tokens,    -- NEW: Image generation tokens
  output_image_costs,     -- NEW: Image generation costs (USD)
  message_timestamp, elapsed_ms
) VALUES (
  $1, $2, 'assistant', $3, $4,
  $5, $6, $7,
  $8,  -- Image tokens from OpenRouter
  $9,  -- Image costs from OpenRouter
  NOW(), $10
);
```

### Attachment Relationships

```sql
-- Automatic linking of generated images
UPDATE chat_attachments
SET message_id = $messageId, session_id = $sessionId
WHERE id = ANY($attachmentIds);

-- Query messages with images
SELECT
  m.*,
  ARRAY_AGG(
    JSON_BUILD_OBJECT(
      'id', a.id,
      'mime', a.mime,
      'size_bytes', a.size_bytes,
      'storage_path', a.storage_path
    )
  ) FILTER (WHERE a.id IS NOT NULL) as images
FROM chat_messages m
LEFT JOIN chat_attachments a ON a.message_id = m.id AND a.kind = 'image'
WHERE m.session_id = $sessionId
GROUP BY m.id
ORDER BY m.message_timestamp;
```

## Cost Tracking & Analytics

### Token Accounting

```typescript
interface UsageTracking {
  // Standard text tokens
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;

  // Image-specific metrics
  image_tokens: number; // OpenRouter image generation tokens
  image_cost: number; // Direct USD cost from OpenRouter
}
```

### Database Cost Records

```sql
-- usage_costs table automatically tracks image costs
INSERT INTO usage_costs (
  user_id, model,
  input_tokens, output_tokens,
  output_image_tokens, output_image_costs,
  total_cost_usd, created_at
) VALUES (
  $userId, $model,
  $promptTokens, $completionTokens,
  $imageTokens, $imageCostUsd,  -- Separate image tracking
  $textCost + $imageCostUsd,    -- Combined total
  NOW()
);
```

### Analytics Queries

```sql
-- Daily image generation costs
SELECT
  DATE_TRUNC('day', created_at) as date,
  SUM(output_image_tokens) as total_image_tokens,
  SUM(output_image_costs) as total_image_costs,
  COUNT(*) FILTER (WHERE output_image_tokens > 0) as image_requests
FROM usage_costs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date;

-- Top image generation models
SELECT
  model,
  SUM(output_image_tokens) as total_tokens,
  SUM(output_image_costs) as total_costs,
  AVG(output_image_costs) as avg_cost_per_image
FROM usage_costs
WHERE output_image_tokens > 0
GROUP BY model
ORDER BY total_costs DESC;
```

## Streaming vs Non-Streaming

### Non-Streaming Mode (`/api/chat`)

**Flow**:

1. Complete request to OpenRouter
2. Process text and images together
3. Store images immediately
4. Return complete response with image URLs

**Advantages**:

- Simpler client handling
- Atomic operations
- Immediate image availability

**Response**:

```json
{
  "response": "I've created an image for you.",
  "images": [{ "url": "...", "attachmentId": "...", "mimeType": "..." }],
  "usage": { "image_tokens": 1000, "image_cost": 0.04 }
}
```

### Streaming Mode (`/api/chat/stream`)

**Flow**:

1. Stream text response progressively
2. Generate images after text completion
3. Store images during final metadata processing
4. Include image URLs in `__FINAL_METADATA__`

**Advantages**:

- Better user experience (immediate text feedback)
- Progressive content loading
- Consistent with existing streaming patterns

**Response Flow**:

```
[Streaming text chunks...]
I've created an image for you.

{"__FINAL_METADATA__": {
  "response": "I've created an image for you.",
  "images": [{"url": "...", "attachmentId": "...", "mimeType": "..."}],
  "usage": {"image_tokens": 1000, "image_cost": 0.04}
}}
```

## Security & Access Control

### Tier-Based Access

```typescript
// Feature flags by subscription tier
const features = {
  anonymous: { imageGeneration: false },
  free: { imageGeneration: false },
  pro: { imageGeneration: true },
  enterprise: { imageGeneration: true },
};
```

### Rate Limiting Strategy

```typescript
// Tier A - Most restrictive (highest cost operations)
const imageLimits = {
  anonymous: 0, // Blocked
  free: 0, // Blocked
  pro: 200, // 200/hour
  enterprise: 500, // 500/hour
};
```

### Storage Security

- **Private Bucket**: All images stored in private `attachments-images` bucket
- **Signed URLs**: 1-hour expiry for secure access
- **Path Isolation**: User-specific storage paths prevent cross-user access
- **Ownership Validation**: Message/session ownership verified before storage

## Error Handling & Recovery

### Validation Errors

```typescript
// Comprehensive error responses
if (!features.imageGeneration) {
  return ApiErrorResponse("Image generation requires Pro+ subscription", 403);
}

if (!model.supports_image_generation) {
  return ApiErrorResponse("Model does not support image generation", 400);
}

if (buffer.length > MAX_SIZE_BYTES) {
  return ApiErrorResponse("Image exceeds size limit (10MB)", 413);
}
```

### Storage Failures

```typescript
// Automatic cleanup on failure
try {
  await storeImage(imageData);
} catch (error) {
  // Clean up any partial uploads
  await supabase.storage.from(BUCKET).remove([storagePath]);
  throw error;
}
```

### OpenRouter Failures

```typescript
// Graceful degradation
try {
  const response = await openRouterRequest();
  return response;
} catch (error) {
  if (error.code === "CONTENT_POLICY_VIOLATION") {
    return ApiErrorResponse("Image request violates content policy", 400);
  }

  logger.error("OpenRouter image generation failed", { error, requestId });
  return ApiErrorResponse("Image generation service unavailable", 503);
}
```

## Performance Considerations

### Latency Optimization

- **Streaming**: Text responds immediately, images process in background
- **Parallel Processing**: Multiple images generated concurrently
- **Efficient Storage**: Direct buffer uploads without intermediate files

### Memory Management

- **Streaming Processing**: Images processed as they arrive
- **Buffer Limits**: 10MB maximum per image prevents memory exhaustion
- **Cleanup**: Automatic cleanup of failed uploads

### Cost Optimization

- **Tier Restrictions**: Prevent accidental usage by lower tiers
- **Token Tracking**: Separate tracking for accurate cost attribution
- **Rate Limiting**: Prevent runaway costs through request limits

## Monitoring & Observability

### Request Logging

```typescript
logger.info("Image generation request", {
  requestId,
  userId,
  model,
  imageGeneration: true,
  sessionId,
});
```

### Success Metrics

```typescript
logger.info("Image generation completed", {
  requestId,
  imageCount: images.length,
  totalImageTokens,
  totalImageCost,
  storageSuccess: true,
});
```

### Error Tracking

```typescript
logger.error("Image generation failed", {
  requestId,
  error: error.message,
  phase: "generation|storage|validation",
  userId,
  model,
});
```

## Integration Points

### Frontend Components

- **Image Toggle**: Enable/disable image generation per request
- **Gallery Renderer**: Display generated images in chat
- **Cost Display**: Show image generation costs in usage tracking

### Database Triggers

- **Cost Aggregation**: Automatic rollup of image costs in daily summaries
- **Attachment Cleanup**: Tier-based retention policies for generated images
- **Usage Analytics**: Real-time cost tracking and alerts

### External Services

- **OpenRouter**: Primary image generation provider
- **Supabase Storage**: Secure image storage with signed URL access
- **Redis**: Rate limiting enforcement across distributed instances

This architecture provides a robust, scalable foundation for AI image generation while maintaining security, cost control, and performance optimization.
