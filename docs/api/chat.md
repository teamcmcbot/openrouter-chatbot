# Endpoi## Authentication & Authorization

- **Optional Authentication:** Uses `withEnhancedAuth` middleware - works for both authenticated and anonymous users
- **Rate Limiting**: Tier-based rate limits applied via `withRateLimit` middleware:
  - **Anonymous:** 20 requests/hour, 5000 tokens/request
  - **Free:** 100 requests/hour, 10000 tokens/request
  - **Pro:** 500 requests/hour, 20000 tokens/request
  - **Enterprise:** 2000 requests/hour, 50000 tokens/request
- **Feature Checks:** `validateChatRequestWithAuth` ensures optional features (custom system prompt, temperature, etc.) are only used if the user's subscription tier allows them
- **Graceful Degradation**: Anonymous users get limited access, authenticated users get enhanced features/chat`

**Method:** `POST`

## Overview

Handles chat completion requests by sending user messages to the OpenRouter API and returning the assistant response with usage and metadata. The endpoint accepts both the legacy `message` field and the Phase&nbsp;2 `messages` array. It validates the payload against the authenticated user's feature set, applies model‑aware token limits and rate limiting, then forwards the request to OpenRouter. Responses include the assistant message, token usage, elapsed time and other metadata.

## Authentication & Authorization

- **Optional Authentication:** Wrapped by `withEnhancedAuth`, so anonymous requests are allowed.
- **Rate Limiting:** `withRateLimit` applies pertier limits:
  - **Anonymous:** 20 requests/hour, 5000 tokens/request
  - **Free:** 100 requests/hour, 10000 tokens/request
  - **Pro:** 500 requests/hour, 20000 tokens/request
  - **Enterprise:** 2000 requests/hour, 50000 tokens/request
- **Feature Checks:** `validateChatRequestWithAuth` ensures optional features (custom system prompt, temperature, etc.) are only used if the user's subscription tier allows them.

## Request

```http
POST /api/chat
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "model": "gpt-3.5-turbo",
  "temperature": 0.7,
  "systemPrompt": "You are a helpful assistant"
}
```

`messages` may be omitted in favor of a single `message` string for legacy clients.

## Response

```json
{
  "response": "Hi! How can I assist you today?",
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 15,
    "total_tokens": 27
  },
  "request_id": "msg-123",
  "timestamp": "2025-07-29T12:00:00Z",
  "elapsed_time": 1.2,
  "contentType": "markdown",
  "id": "gen-abc"
}
```

## Rate Limit Headers

All responses include rate limiting information:

```
X-RateLimit-Limit: 20 (anonymous) / 100+ (authenticated)
X-RateLimit-Remaining: 18
X-RateLimit-Reset: 2025-08-07T09:30:00.000Z
Retry-After: 3600 (when rate limit exceeded)
```

## Error Responses

- `429 Too Many Requests` if rate limit is exceeded (with `Retry-After` header)
- `400 Bad Request` for invalid requests (feature not available for tier, token limits exceeded, etc.)
- `401 Unauthorized` for invalid authentication tokens (when provided)
- `403 Forbidden` for requests that exceed user's tier permissions
- `500 Internal Server Error` if OpenRouter API is unavailable or other server errors

```

## Data Flow

1. **Validation** – `validateChatRequestWithAuth` checks message content, feature access and token counts.
2. **Token Strategy** – `getModelTokenLimits` determines `max_tokens` for the chosen model; total input tokens are estimated with `estimateTokenCount`.
3. **OpenRouter Call** – `getOpenRouterCompletion` sends the formatted request to OpenRouter.
4. **Response Transformation** – `detectMarkdownContent` sets `contentType`; metadata such as `request_id` and `elapsed_time` are added.
5. **Headers** – Standard rate‑limit headers are included via `addRateLimitHeaders`.

## Usage in the Codebase

- Called from `stores/useChatStore.ts` when sending a new message.
```
