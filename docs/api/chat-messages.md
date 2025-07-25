# Endpoint: `/api/chat/messages`

**Methods:** `GET`, `POST`

## Description

This endpoint provides CRUD operations for individual chat messages within a session.

- **GET**: Fetches all messages for a given chat session. Verifies that the requesting user owns the session (via Supabase auth and session lookup). Returns an array of message objects, each including all metadata fields present in the database (`id`, `role`, `content`, `model`, `total_tokens`, `contentType`, `elapsed_time`, `completion_id`, `timestamp`, `error`, etc.).
- **POST**: Inserts a new message into the session. Verifies session ownership before allowing insertion. Updates session statistics in the `chat_sessions` table (message count, total tokens, last model, last message preview, last message timestamp, updated_at). Returns the newly created message object.

### Calls Made

- Verifies session ownership by querying the `chat_sessions` table: `SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?`
- Fetches messages from the `chat_messages` table: `SELECT * FROM chat_messages WHERE session_id = ? ORDER BY message_timestamp ASC`
- Inserts new messages into the `chat_messages` table with all metadata fields.
- Updates session statistics in the `chat_sessions` table.

### Tables Updated

- `chat_messages`: Stores individual chat messages with all metadata fields.
- `chat_sessions`: Updated to reflect new message statistics (message count, total tokens, last model, last message preview, last message timestamp, updated_at).

### Payloads

- **GET Request Payload**:

  - Query parameter: `session_id` (required)
  - Example: `/api/chat/messages?session_id=abc123`

- **POST Request Payload**:
  - JSON body:
    ```json
    {
      "sessionId": "abc123",
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
  - Body: The newly created message object (same structure as above).

- **Error Responses**:
  - `401 Unauthorized` if user is not authenticated.
  - `404 Not Found` if session does not exist or does not belong to user.
  - `400 Bad Request` for missing or invalid payload.
  - `500 Internal Server Error` for unexpected errors.

## Usage in the Codebase

- Currently not called by the frontend code. Present for potential future use and referenced in documentation.
