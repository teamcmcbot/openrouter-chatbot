# Endpoi## Authentication & Authorization

- **Authentication Required:** Uses `withConversationOwnership` middleware, which requires valid user authentication via `withProtectedAuth`
- **Feature Check:** Users must have `canSyncConversations` enabled in their feature flags
- **Rate Limiting:** Tier-based rate limits applied via `withRateLimit` middleware:
  - **Anonymous:** 20 requests/hour _(N/A - authentication required)_
  - **Free:** 100 requests/hour
  - **Pro:** 500 requests/hour
  - **Enterprise:** 2000 requests/hour
- **Conversation Ownership:** Automatic validation that all conversations belong to the authenticated user/chat/sync`

**Methods:** `POST`, `GET`

## Overview

Synchronizes conversations between the client and the server. `POST` accepts an array of conversations from the client and upserts them into Supabase. `GET` returns the latest conversations (with messages) for the authenticated user. The endpoint enforces conversation ownership, validates feature access and rate limits requests.

## Authentication & Authorization

- **Authentication Required:** Wrapped by `withConversationOwnership`, which in turn uses `withProtectedAuth` to require a signedin user.
- **Feature Check:** Users must have `canSyncConversations` enabled in their feature flags.
- **Rate Limiting:** All requests pass through `withRateLimit` using the user's tier limits:
  - **Anonymous:** 20 requests/hour, 5000 tokens/request
  - **Free:** 100 requests/hour, 10000 tokens/request
  - **Pro:** 500 requests/hour, 20000 tokens/request
  - **Enterprise:** 2000 requests/hour, 50000 tokens/request

## POST Request

```http
POST /api/chat/sync
Content-Type: application/json

{
  "conversations": [
    {
      "id": "conv-1",
      "title": "Example",
      "messages": [ { "id": "msg-1", "role": "user", "content": "Hello" } ]
    }
  ]
}
```

## POST Response

```json
{
  "success": true,
  "results": {
    "synced": 1,
    "errors": 0,
    "details": [
      { "conversationId": "conv-1", "status": "synced", "messageCount": 1 }
    ]
  },
  "syncTime": "2025-07-29T12:00:00Z"
}
```

## GET Request

```http
GET /api/chat/sync
```

## GET Response

```json
{
  "conversations": [
    {
      "id": "conv-1",
      "title": "Example",
      "messages": [{ "id": "msg-1", "role": "user", "content": "Hello" }],
      "createdAt": "2025-07-29T11:59:00Z",
      "updatedAt": "2025-07-29T12:00:00Z"
    }
  ],
  "syncTime": "2025-07-29T12:00:00Z"
}
```

## Data Flow

1. **Validation** – `withConversationOwnership` parses the payload (for POST) and ensures all conversations belong to the signed‑in user.
2. **Database Upsert** – Conversations are inserted or updated in the `chat_sessions` table, and each message is upserted into `chat_messages`.
3. **Stats Update** – Message counts and token totals are updated for each session.
4. **Fetch Conversations (GET)** – Retrieves up to 20 most recent sessions with their messages sorted by timestamp.
5. **Rate Limit Headers** – Responses include `X-RateLimit-*` headers added by the middleware.

## Rate Limit Headers

All responses include rate limiting information:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 98
X-RateLimit-Reset: 2025-08-07T09:30:00.000Z
Retry-After: 3600 (when rate limit exceeded)
```

## Error Responses

- `401 Unauthorized` if user is not authenticated
- `403 Forbidden` if user lacks sync permissions or tries to sync conversations they don't own
- `429 Too Many Requests` if rate limit is exceeded (with `Retry-After` header)
- `400 Bad Request` for invalid payload or malformed conversation data
- `500 Internal Server Error` for database errors or unexpected server errors

## Usage in the Codebase

- Called from `stores/useChatStore.ts` to upload local conversations (`POST`) and to load conversations for a user (`GET`).
