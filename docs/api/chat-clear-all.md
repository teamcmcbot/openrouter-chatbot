# Endpoint: `/api/chat/clear-all`

**Method:** `DELETE`

## Overview

Deletes all chat sessions and their messages for the authenticated user. The endpoint uses Supabase server-side authentication to identify the user, fetches all of their session IDs, removes associated messages from `chat_messages` and then deletes the sessions themselves.

## Authentication & Authorization

- **Authentication Required:** Uses `supabase.auth.getUser()` to ensure the request originates from a signed‑in user.
- **Authorization:** Each operation is scoped to the authenticated user's `user_id` to prevent cross-account deletion.

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

## Data Flow

1. **Lookup Sessions** – Query `chat_sessions` for all IDs belonging to the user.
2. **Delete Messages** – Remove rows from `chat_messages` where `session_id` matches any of those IDs.
3. **Delete Sessions** – Remove rows from `chat_sessions` for the user.
4. **Return Result** – Respond with the number of sessions deleted or an error message if something fails.

## Usage in the Codebase

- Invoked from `stores/useChatStore.ts` when the user chooses to clear all conversations.
