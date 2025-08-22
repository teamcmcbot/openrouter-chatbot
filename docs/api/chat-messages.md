# Endpoint: `/api/chat/messages`

**Methods:** `GET`, `POST`

## Authentication & Authorization

- **Authentication Required**: Uses `withProtectedAuth` middleware - requires valid user authentication
- **Rate Limiting**: Tier-based rate limits applied via `withRedisRateLimit` middleware:
  - **Anonymous**: 20 requests/hour _(N/A - authentication required)_
  - **Free**: 100 requests/hour
  - **Pro**: 500 requests/hour
  - **Enterprise**: 2000 requests/hour
- **Ownership Validation**: Users can only access messages from their own sessions
- **Feature Flags**: Automatic tier-based access control applied

## Description

This endpoint provides CRUD operations for individual chat messages within a session.

- **GET**: Fetches all messages for a given chat session. Verifies that the requesting user owns the session (via AuthContext middleware). Returns an array of message objects, each including all metadata fields present in the database (`id`, `role`, `content`, `model`, `total_tokens`, `contentType`, `elapsed_time`, `completion_id`, `timestamp`, `error`, etc.).
- **POST**: Inserts a new message or message array into the session. **Auto-creates sessions** if they don't exist with intelligent title generation. Supports both single message and message array formats for efficient batch operations. **Enhanced with session title updates** to handle both auto-generated and explicit titles during message saving. Updates session statistics in the `chat_sessions` table (message count, total tokens, last model, last message preview, last message timestamp, updated_at). Returns the newly created message object(s).

### Enhanced Features

- **Automatic Session Creation**: Sessions are created automatically if they don't exist, eliminating 404 errors
- **Intelligent Title Generation**: New sessions get titles from the first user message content (50 char limit)
- **Session Title Updates**: Supports explicit title updates during message saving to reduce API calls
- **Message Array Support**: Process multiple messages atomically (user/assistant pairs)
- **Error Message Handling**: Support for error messages with metadata (error_code, retry_after, suggestions)
- **Session Title Preservation**: Existing sessions retain their original titles unless explicitly updated

### Calls Made

- **Session Management**: Checks if session exists: `SELECT id, title, message_count FROM chat_sessions WHERE id = ? AND user_id = ?`
- **Auto-Creation**: Creates new sessions when needed: `INSERT INTO chat_sessions (id, user_id, title, updated_at)`
- **Message Retrieval**: Fetches messages from the `chat_messages` table: `SELECT * FROM chat_messages WHERE session_id = ? ORDER BY message_timestamp ASC`
- **Message Insertion**: Inserts new messages into the `chat_messages` table with all metadata fields (supports both single messages and arrays)
- **Statistics Update**: Updates session statistics in the `chat_sessions` table

### Tables Updated

- `chat_messages`: Stores individual chat messages with all metadata fields.
- `chat_sessions`: Updated to reflect new message statistics (message count, total tokens, last model, last message preview, last message timestamp, updated_at).

### Payloads

- **GET Request Payload**:

  - Query parameter: `session_id` (required)
  - Example: `/api/chat/messages?session_id=abc123`

- **POST Request Payload**:
  - **Single Message Format** (backward compatibility):
    ```json
    {
      "sessionId": "abc123",
      "sessionTitle": "Optional title update",
      "message": {
        "id": "msg1",
        "content": "Hello, world!",
        "role": "user",
        "model": "gpt-3.5-turbo",
        "total_tokens": 42,
        "contentType": "text",
        "elapsed_time": 100,
        "completion_id": "gen-123",
        "timestamp": "2025-07-25T12:34:56Z",
        "error": false
      }
    }
    ```
  - **Message Array Format** (new functionality):
    ```json
    {
      "sessionId": "abc123",
      "sessionTitle": "Optional title for new or existing sessions",
      "messages": [
        {
          "id": "msg_user",
          "content": "What is the weather?",
          "role": "user",
          "timestamp": "2025-08-02T12:00:00Z"
        },
        {
          "id": "msg_assistant",
          "content": "I don't have access to real-time weather data.",
          "role": "assistant",
          "model": "gpt-3.5-turbo",
          "total_tokens": 25,
          "elapsed_time": 1500,
          "timestamp": "2025-08-02T12:00:05Z"
        }
      ]
    }
    ```
  - **Error Message Format**:
    ```json
    {
      "sessionId": "abc123",
      "message": {
        "id": "msg_error",
        "content": "",
        "role": "assistant",
        "timestamp": "2025-08-02T12:00:00Z",
        "error_message": "Rate limit exceeded. Please try again.",
        "error_code": "too_many_requests",
        "retry_after": 60,
        "suggestions": [
          "Try again in a few minutes",
          "Switch to a different model"
        ]
      }
    }
    ```
  - All fields in the `ChatMessage` interface are supported.

### Responses

- **GET Response**:

  - Status: `200 OK`
  - Body: Array of message objects, each with all metadata fields:
    ```json
    [
      {
        "id": "msg1",
        "role": "user",
        "content": "Hello, world!",
        "model": "gpt-3.5-turbo",
        "total_tokens": 42,
        "contentType": "text",
        "elapsed_time": 100,
        "completion_id": "gen-123",
        "timestamp": "2025-07-25T12:34:56Z",
        "error": false
      },
      ...
    ]
    ```

- **POST Response**:

  - Status: `201 Created`
  - **Single Message Response**:
    ```json
    {
      "messages": [
        {
          "id": "msg1",
          "role": "user",
          "content": "Hello, world!",
          "model": "gpt-3.5-turbo",
          "total_tokens": 42,
          "contentType": "text",
          "elapsed_time": 100,
          "completion_id": "gen-123",
          "timestamp": "2025-08-02T12:34:56Z",
          "error": false
        }
      ],
      "count": 1,
      "success": true
    }
    ```
  - **Message Array Response**:
    ```json
    {
      "messages": [
        {
          /* user message */
        },
        {
          /* assistant message */
        }
      ],
      "count": 2,
      "success": true
    }
    ```

- **Error Responses**:
  - `401 Unauthorized` if user is not authenticated
  - `403 Forbidden` if user tries to access another user's session
  - `429 Too Many Requests` if rate limit is exceeded (with `Retry-After` header)
  - `400 Bad Request` for missing or invalid payload, or when neither `message` nor `messages` is provided
  - `500 Internal Server Error` for session creation failures or unexpected errors

### Rate Limit Headers

All responses include rate limiting information:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 2025-08-07T09:30:00.000Z
Retry-After: 3600 (when rate limit exceeded)
```

### Session Auto-Creation Behavior

- **New Sessions**: Automatically created when `sessionId` doesn't exist
- **Title Generation**:
  - Prioritizes explicit `sessionTitle` parameter from request
  - Falls back to first user message content (up to 50 characters)
  - Default: "New Chat" if no user message content
- **Existing Sessions**: Titles preserved unless `sessionTitle` parameter provided
- **Title Updates**: Existing sessions can have titles updated via `sessionTitle` parameter
- **Security**: Sessions always tied to authenticated user

### Session Title Parameter (`sessionTitle`)

**Optional Parameter**: `sessionTitle` (string)

**Behavior**:

- **New Sessions**: Used as the session title instead of auto-generation
- **Existing Sessions**: Updates the session title if different from current title
- **Priority**: Takes precedence over auto-generated titles from message content
- **Use Cases**:
  - Auto-generated titles during first message exchange
  - Manual title updates combined with message saving
  - Reducing API calls by combining session creation/update with message saving

**Example Usage**:

```json
{
  "sessionId": "new_session_123",
  "sessionTitle": "Discussion about AI ethics",
  "messages": [
    {
      "role": "user",
      "content": "What are the main ethical concerns with AI?"
    },
    {
      "role": "assistant",
      "content": "There are several key ethical concerns..."
    }
  ]
}
```

## Usage in the Codebase

- **Frontend Integration**: Used by chat store for message persistence instead of bulk sync operations
- **Error Handling**: Supports failed message logging with retry metadata
- **Batch Operations**: Enables efficient user/assistant message pair saves
