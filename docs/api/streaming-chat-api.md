# Streaming Chat API Documentation

## Endpoint: `POST /api/chat/stream`

**Purpose**: Provides real-time streaming chat responses with identical functionality to the standard chat endpoint.

### Authentication

- **Required**: User must be authenticated
- **Method**: Supabase session cookies or Bearer token
- **Rate Limiting**: Tier A (10/20/200/500 requests/hour based on subscription)

### Request Format

```typescript
interface StreamChatRequest {
  message: string; // User message content
  conversationId?: string; // Session ID for message grouping
  model: string; // OpenRouter model ID
  temperature?: number; // Response randomness (0-1)
  systemPrompt?: string; // Custom system prompt
  webSearch?: boolean; // Enable web search (Pro/Enterprise)
  webMaxResults?: number; // Enterprise-only: preferred max results (UI 1–5; server clamps 1–10). Pro is forced to 3.
  reasoning?: { effort: "low" | "medium" | "high" }; // Enable reasoning
  attachmentIds?: string[]; // Image attachment IDs
  imageGeneration?: boolean; // Enable AI image generation (Pro/Enterprise)
}
```

**Example Request**:

```bash
curl -X POST /api/chat/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "message": "Explain quantum computing",
    "model": "anthropic/claude-3-haiku",
    "temperature": 0.7,
    "webSearch": true,
    "webMaxResults": 5,
    "reasoning": { "effort": "low" },
    "imageGeneration": true
  }'
```

### Response Format

The endpoint returns a streaming response with two phases:

#### Phase 1: Content Streaming

Progressive text chunks as they're generated:

```
Let me explain quantum computing step by step.

Quantum computing is a revolutionary...
```

#### Phase 2: Final Metadata

Complete metadata delivered at the end as a single JSON line:

```
{"__FINAL_METADATA__":{
  "response": "Let me explain quantum computing...",
  "usage": {
    "prompt_tokens": 45,
    "completion_tokens": 156,
    "total_tokens": 201,
    "image_tokens": 0,
    "image_cost": 0.00
  },
  "request_id": "msg_1755941032316_d369jl4as",
  "timestamp": "2025-08-23T09:24:04.178Z",
  "elapsed_ms": 2341,
  "contentType": "markdown",
  "id": "gen-1755941033-rhZq1U5diW1edvt4mMdt",
  "reasoning": "**Analysis**: I should provide a clear...",
  "reasoning_details": [
    {
      "type": "reasoning.text",
      "text": "Step 1: Define quantum computing...",
      "format": "unknown",
      "index": 0
    }
  ],
  "annotations": [
    {
      "type": "url_citation",
      "url": "https://example.com/quantum-guide",
      "title": "Quantum Computing Guide",
      "start_index": 45,
      "end_index": 67
    }
  ],
  "has_websearch": true,
  "websearch_result_count": 3,
  "images": [
    {
      "url": "https://storage.supabase.co/object/sign/...",
      "attachmentId": "att_abc123",
      "mimeType": "image/png"
    }
  ]
}}
```

### Response Headers

```
Content-Type: text/plain; charset=utf-8
Cache-Control: no-cache
Connection: keep-alive
Transfer-Encoding: chunked
```

### Image Generation Support

The streaming endpoint supports AI image generation with identical functionality to the standard chat endpoint:

#### Request Configuration

```typescript
const request: StreamChatRequest = {
  message: "Create a picture of a mountain landscape",
  model: "openai/dall-e-3",
  imageGeneration: true,
};
```

#### Streaming Behavior

1. **Text Response**: Assistant response streams normally
2. **Image Processing**: Images are generated after text completion
3. **Storage**: Images are automatically stored via `/api/chat/images/store`
4. **Final Metadata**: Image URLs and metadata included in `__FINAL_METADATA__`

#### Final Metadata with Images

```json
{
  "__FINAL_METADATA__": {
    "response": "I've created a beautiful mountain landscape for you.",
    "usage": {
      "prompt_tokens": 15,
      "completion_tokens": 12,
      "total_tokens": 27,
      "image_tokens": 1000,
      "image_cost": 0.04
    },
    "images": [
      {
        "url": "https://storage.supabase.co/object/sign/...",
        "attachmentId": "att_abc123",
        "mimeType": "image/png"
      }
    ]
  }
}
```

#### Tier Requirements

- **Allowed**: Pro and Enterprise users only
- **Models**: Must support image generation (e.g., DALL-E models)
- **Rate Limiting**: Uses Tier A limits (most restrictive due to cost)
- **Cost Tracking**: Separate tracking for image generation tokens and costs

### Frontend Integration

#### Using Custom Hook

```typescript
import { useChatStreaming } from "../hooks/useChatStreaming";

const ChatComponent = () => {
  const { sendMessage, streamingContent, isStreaming, error } =
    useChatStreaming();

  const handleSubmit = async () => {
    await sendMessage({
      message: "Hello, world!",
      model: "anthropic/claude-3-haiku",
      conversationId: currentSessionId,
    });
  };

  return (
    <div>
      <div className="streaming-content">
        {streamingContent}
        {isStreaming && <BlinkingCursor />}
      </div>
      {error && <ErrorDisplay error={error} />}
    </div>
  );
};
```

#### Manual Stream Processing

```typescript
const streamResponse = async (requestBody: StreamChatRequest) => {
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let content = "";
  let finalMetadata = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      content += chunk;

      // Attempt to parse complete JSON lines for final metadata
      const lines = content.split("\n");
      // Keep the last incomplete line in the buffer
      content = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("{")) {
          // forward normal content lines
          updateStreamingContent((prev) => prev + line + "\n");
          continue;
        }
        try {
          const maybe = JSON.parse(trimmed);
          if (maybe && maybe.__FINAL_METADATA__) {
            finalMetadata = maybe.__FINAL_METADATA__;
          } else {
            // Not metadata, treat as content
            updateStreamingContent((prev) => prev + line + "\n");
          }
        } catch {
          // Not a JSON line, treat as content
          updateStreamingContent((prev) => prev + line + "\n");
        }
      }

      // Update UI with progressive content
      updateStreamingContent(content);
    }
  } finally {
    reader.releaseLock();
  }

  return { content, metadata: finalMetadata };
};
```

### Streaming Markers

- The server may interleave special lines for progressive UI features:
  - `__ANNOTATIONS_CHUNK__{"type":"annotations","data":[...]}`: cumulative, deduped citations (by URL). These are lines on their own and should not be rendered as assistant text.
  - `__REASONING_CHUNK__{"type":"reasoning","data":"..."}`: present only when reasoning is enabled and permitted by tier. Also delivered as standalone lines.
- Clients should treat these marker lines specially and not include them in the assistant content. Final metadata contains the complete annotation set and optional reasoning payload.

### Environment Flags

The streaming behavior can be controlled at runtime via environment flags:

- `STREAM_MARKERS_ENABLED` (default: 1 in dev, may be 0 in some deploys):
  - When 1, progressive marker lines may be forwarded for reasoning/annotations.
  - When 0, markers are suppressed; final metadata still includes the complete annotation set and any reasoning that’s permitted.
- `STREAM_REASONING_ENABLED` (default: 1 in dev):
  - When 1, reasoning is forwarded only if requested and permitted by model/tier.
  - When 0, reasoning content is suppressed in the streaming path, regardless of request.
- `STREAM_DEBUG` (default: 0):
  - When 1, enables verbose development logs (chunk boundaries, marker emissions, TTF_annotation).

### Debugging

Set `STREAM_DEBUG=1` in the server environment to log chunk boundaries, marker emissions, and high-level parsing events during development. This is disabled by default in production.

### Error Handling

#### Common Error Responses

```typescript
// Rate limit exceeded
{
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 3600
}

// Authentication required
{
  "error": "Authentication required",
  "code": "AUTH_REQUIRED"
}

// Invalid model
{
  "error": "Model not supported",
  "code": "INVALID_MODEL",
  "supportedModels": ["anthropic/claude-3-haiku", "..."]
}

// OpenRouter API error
{
  "error": "Upstream service error",
  "code": "UPSTREAM_ERROR",
  "details": "OpenRouter API unavailable"
}
```

#### Stream Interruption Handling

```typescript
const handleStreamError = (error: Error) => {
  console.error("Stream error:", error);

  // Fallback to non-streaming
  const fallbackResponse = await fetch("/api/chat", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });

  return fallbackResponse.json();
};
```

### Feature Compatibility

| Feature                 | Supported | Notes                         |
| ----------------------- | --------- | ----------------------------- |
| **Text Chat**           | ✅        | Full streaming support        |
| **Image Attachments**   | ✅        | Multimodal streaming          |
| **Web Search**          | ✅        | Annotations in metadata       |
| **Reasoning**           | ✅        | Progressive reasoning display |
| **System Prompts**      | ✅        | Custom instructions           |
| **Temperature Control** | ✅        | Response randomness           |
| **Model Selection**     | ✅        | All supported models          |
| **Token Counting**      | ✅        | Accurate usage tracking       |
| **Rate Limiting**       | ✅        | Same limits as non-streaming  |

### Performance Characteristics

- **Time to First Token**: ~200-500ms (vs 2-10s for complete response)
- **Throughput**: ~50-100 tokens/second depending on model
- **Memory Usage**: Minimal - processes chunks incrementally
- **Connection Overhead**: Standard HTTP streaming
- **Concurrent Streams**: Limited by rate limiting, not technical constraints

### Database Integration

Streaming responses are automatically persisted to the database after completion:

```sql
-- Messages table populated identically to non-streaming
INSERT INTO chat_messages (
  id, session_id, role, content, model,
  reasoning, reasoning_details, total_tokens,
  input_tokens, output_tokens, completion_id,
  output_image_tokens, output_image_costs,
  has_websearch, websearch_result_count,
  message_timestamp, elapsed_ms
) VALUES (...);

-- Attachments linked if present (including generated images)
UPDATE chat_attachments
SET message_id = $1, session_id = $2
WHERE id = ANY($3);
```

### Monitoring & Observability

#### Request Logging

```typescript
logger.info("Chat stream request received", {
  userId: user.id,
  model,
  messageLength: message.length,
  hasAttachments: attachmentIds?.length > 0,
  webSearchEnabled: !!webSearch,
  reasoningEnabled: !!reasoning,
});
```

#### Completion Logging

```typescript
logger.info("Chat stream completed", {
  userId: user.id,
  model,
  elapsedMs,
  totalTokens: metadata.usage.total_tokens,
  hasReasoning: !!metadata.reasoning,
  annotationCount: metadata.annotations?.length || 0,
});
```

#### Error Logging

```typescript
logger.error("Chat stream error", {
  userId: user.id,
  model,
  error: error.message,
  elapsedMs,
  stage: "streaming|metadata|database",
});
```

### Security Considerations

- **Input Validation**: All inputs sanitized and validated
- **Rate Limiting**: Tier-based limits prevent abuse
- **Authentication**: Required for all requests
- **Content Filtering**: Same safety measures as non-streaming
- **Error Handling**: No sensitive information in error responses

---

## Migration from Non-Streaming

To migrate existing chat implementations to streaming:

1. **Replace endpoint**: `/api/chat` → `/api/chat/stream`
2. **Update response handling**: Process chunks instead of complete JSON
3. **Add metadata parsing**: Handle `__FINAL_METADATA__` marker
4. **Implement progressive UI**: Update content as chunks arrive
5. **Add error fallback**: Graceful degradation to non-streaming

The request format remains identical, ensuring easy migration with enhanced user experience.
