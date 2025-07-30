# Endpoint: `/api/chat/sync`

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

## Usage in the Codebase

- Called from `stores/useChatStore.ts` to upload local conversations (`POST`) and to load conversations for a user (`GET`).
