# Endpoint: `/api/chat/clear-all`

**Method:** `DELETE`

## Authentication & Authorization

- **Authentication Required**: Uses `withProtectedAuth` middleware - requires valid user authentication
- **Rate Limiting**: Tier-based rate limits applied via `withRedisRateLimit` middleware:
  - **Anonymous**: 20 requests/hour _(N/A - authentication required)_
  - **Free**: 100 requests/hour
  - **Pro**: 500 requests/hour
  - **Enterprise**: 2000 requests/hour
- **Data Isolation**: Users can only delete their own conversations and messages
- **Feature Flags**: Automatic tier-based access control applied

## Overview

Deletes all chat sessions and their messages for the authenticated user. The endpoint uses standardized `withProtectedAuth` middleware for authentication, applies automatic rate limiting, and ensures each operation is scoped to the authenticated user's `user_id` to prevent cross-account deletion.

## Authentication & Authorization

- **Authentication Required:** Uses standardized `withProtectedAuth` middleware to ensure the request originates from a signed‑in user
- **Authorization:** Each operation is scoped to the authenticated user's `user_id` via AuthContext to prevent cross-account deletion
- **Rate Limiting:** Automatic tier-based rate limiting prevents abuse

## Request

```http
DELETE /api/chat/clear-all
```

No body is required; authentication cookies are used implicitly.

## Response

```json
{
  "success": true,
  "message": "All conversations cleared successfully",
  "deletedCount": 3
}
```

If the user has no conversations, `deletedCount` will be `0` and the message will indicate nothing was deleted.

## Rate Limit Headers

All responses include rate limiting information:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 2025-08-07T09:30:00.000Z
Retry-After: 3600 (when rate limit exceeded)
```

## Error Responses

- `401 Unauthorized` if user is not authenticated
- `429 Too Many Requests` if rate limit is exceeded (with `Retry-After` header)
- `500 Internal Server Error` for unexpected database or server errors

## Data Flow

1. **Lookup Sessions** – Query `chat_sessions` for all IDs belonging to the user.
2. **Delete Messages** – Remove rows from `chat_messages` where `session_id` matches any of those IDs.
3. **Delete Sessions** – Remove rows from `chat_sessions` for the user.
4. **Return Result** – Respond with the number of sessions deleted or an error message if something fails.

## Usage in the Codebase

- Invoked from `stores/useChatStore.ts` when the user chooses to clear all conversations.
