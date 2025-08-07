# Endpoint: `/api/chat/sessions`

**Methods:** `GET`, `POST`, `DELETE`

## Authentication & Authorization

- **Authentication Required**: Uses `withProtectedAuth` middleware - requires valid user authentication
- **Rate Limiting**: Tier-based rate limits applied via `withRateLimit` middleware:
  - **Anonymous**: 20 requests/hour _(N/A - authentication required)_
  - **Free**: 100 requests/hour
  - **Pro**: 500 requests/hour
  - **Enterprise**: 2000 requests/hour
- **Ownership Validation**: Users can only access their own sessions
- **Feature Flags**: Automatic tier-based access control applied

## Description

Manages chat sessions for the authenticated user. `GET` returns all sessions, `POST` creates a new session, and `DELETE` removes a specific session by ID (also deleting its messages).

## Rate Limit Headers

All responses include rate limiting information:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 2025-08-07T09:30:00.000Z
Retry-After: 3600 (when rate limit exceeded)
```

## Error Responses

- `401 Unauthorized` if user is not authenticated
- `403 Forbidden` if user tries to access another user's session
- `429 Too Many Requests` if rate limit is exceeded (with `Retry-After` header)
- `400 Bad Request` for invalid payload or missing required fields
- `404 Not Found` if session doesn't exist or user doesn't have access
- `500 Internal Server Error` for unexpected database or server errors

## Usage in the Codebase

- Only the `DELETE` method is called from `stores/useChatStore.ts` when a conversation is removed. Other methods are currently unused in the UI.
