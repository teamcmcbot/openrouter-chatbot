# Chat Session API Documentation

## Overview

The Chat Session API provides endpoints for managing chat sessions, including updating session metadata such as titles and active status.

## Authentication & Authorization

- **Authentication Required**: Uses `withProtectedAuth` middleware - requires valid user authentication
- **Rate Limiting**: Tier-based rate limits applied via `withRedisRateLimit` middleware:
  - **Anonymous**: 20 requests/hour _(N/A - authentication required)_
  - **Free**: 100 requests/hour
  - **Pro**: 500 requests/hour
  - **Enterprise**: 2000 requests/hour
- **Ownership Validation**: Users can only update their own sessions
- **Feature Flags**: Automatic tier-based access control applied

## Update Session Title

### Endpoint

```
POST /api/chat/session
```

### Description

Updates session metadata including title and active status. This endpoint is used to:

- Update conversation titles from the frontend UI
- Set/unset active session status
- Modify other session metadata

### Authentication

- Requires authenticated user via standardized `withProtectedAuth` middleware
- Only allows updates to sessions owned by the current user
- Automatic rate limiting applied based on user's subscription tier

### Request Format

#### Headers

```
Content-Type: application/json
```

#### Request Body

```json
{
  "id": "session-uuid",
  "title": "New Session Title",
  "is_active": true
}
```

#### Parameters

| Parameter   | Type    | Required | Description                                      |
| ----------- | ------- | -------- | ------------------------------------------------ |
| `id`        | string  | Yes      | The session UUID to update                       |
| `title`     | string  | No       | New title for the session                        |
| `is_active` | boolean | No       | Set session as active (true) or inactive (false) |

### Response Format

#### Success Response (200 OK)

```json
{
  "session": {
    "id": "session-uuid",
    "title": "New Session Title",
    "user_id": "user-uuid",
    "is_active": true,
    "updated_at": "2024-01-01T00:00:00.000Z",
    "message_count": 10,
    "total_tokens": 500,
    "last_model": "gpt-4",
    "last_message_preview": "Last message content...",
    "last_message_timestamp": "2024-01-01T00:00:00.000Z"
  },
  "success": true
}
```

#### Error Responses

**400 Bad Request - Missing Session ID**

```json
{
  "error": "Session ID required"
}
```

**401 Unauthorized - Not Authenticated**

```json
{
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

**403 Forbidden - Access Denied**

```json
{
  "error": "Forbidden",
  "message": "Access denied to this session"
}
```

**429 Too Many Requests - Rate Limit Exceeded**

```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please try again later.",
  "retryAfter": 3600
}
```

**404 Not Found - Session Not Found or Access Denied**

```json
{
  "error": "Session not found or access denied"
}
```

**500 Internal Server Error**

```json
{
  "error": "Internal server error"
}
```

## Usage Examples

### Frontend Implementation (React/TypeScript)

```typescript
// Update session title
async function updateSessionTitle(sessionId: string, newTitle: string) {
  try {
    const response = await fetch("/api/chat/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: sessionId,
        title: newTitle,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update session title: ${response.statusText}`);
    }

    const result = await response.json();
    console.log("Session updated:", result.session);
    return result.session;
  } catch (error) {
    console.error("Error updating session title:", error);
    throw error;
  }
}

// Set session as active
async function setActiveSession(sessionId: string) {
  try {
    const response = await fetch("/api/chat/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: sessionId,
        is_active: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to set active session: ${response.statusText}`);
    }

    const result = await response.json();
    return result.session;
  } catch (error) {
    console.error("Error setting active session:", error);
    throw error;
  }
}
```

### cURL Examples

**Update Session Title:**

```bash
curl -X POST http://localhost:3000/api/chat/session \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-session-token" \
  -d '{
    "id": "session-uuid-here",
    "title": "My Updated Chat Title"
  }'
```

**Set Active Session:**

```bash
curl -X POST http://localhost:3000/api/chat/session \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-session-token" \
  -d '{
    "id": "session-uuid-here",
    "is_active": true
  }'
```

## Integration with Frontend

### ChatSidebar Component

The `ChatSidebar` component uses this API to update session titles when users edit conversation names:

```typescript
// In components/ui/ChatSidebar.tsx
const handleSaveEdit = async (id: string) => {
  if (editTitle.trim()) {
    try {
      await updateConversationTitle(id, editTitle.trim());
    } catch (error) {
      console.error("Failed to update conversation title:", error);
    }
  }
  setEditingId(null);
  setEditTitle("");
};
```

### Store Integration

The `useChatStore` handles the API integration with optimistic updates:

```typescript
// In stores/useChatStore.ts
updateConversationTitle: async (id, title) => {
  // Update local state immediately for optimistic UI
  set((state) => ({
    conversations: state.conversations.map((conv) =>
      conv.id === id
        ? { ...conv, title, updatedAt: new Date().toISOString() }
        : conv
    ),
  }));

  // Update session title on server for authenticated users
  if (user?.id && conversation?.userId === user.id) {
    try {
      const response = await fetch("/api/chat/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id, title: title }),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to update session title: ${response.statusText}`
        );
      }

      const result = await response.json();
      logger.debug("Session title updated successfully", result);
    } catch (error) {
      logger.error("Failed to update session title on server", error);
    }
  }
};
```

## Database Schema

The session updates modify the `chat_sessions` table:

```sql
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'New Chat',
  is_active BOOLEAN DEFAULT false,
  message_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  last_model TEXT,
  last_message_preview TEXT,
  last_message_timestamp TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Security Considerations

1. **Standardized Authentication**: Uses `withProtectedAuth` middleware for consistent security
2. **User Ownership**: Users can only update their own sessions via AuthContext validation
3. **Input Validation**: Session ID is validated and sanitized
4. **Rate Limiting**: Automatic tier-based rate limiting prevents abuse
5. **SQL Injection Protection**: Parameterized queries prevent SQL injection
6. **Audit Logging**: All authentication and authorization events are logged

## Rate Limiting

All responses include rate limit headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 2025-08-07T09:30:00.000Z
Retry-After: 3600 (when rate limit exceeded)
```

## Error Handling

The API implements comprehensive error handling:

- Input validation with descriptive error messages
- Authentication and authorization checks
- Database error handling with rollback capabilities
- Proper HTTP status codes for different error scenarios
- Detailed logging for debugging

## Performance Considerations

- Uses database transactions for data consistency
- Implements optimistic updates on the frontend for better UX
- Efficient queries with proper indexing on `user_id` and `id` fields
- Minimal data transfer with selective field updates
