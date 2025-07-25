# Endpoint: `/api/chat/sessions`

**Methods:** `GET`, `POST`, `DELETE`

## Description
Manages chat sessions for the authenticated user. `GET` returns all sessions, `POST` creates a new session, and `DELETE` removes a specific session by ID (also deleting its messages).

## Usage in the Codebase
- Only the `DELETE` method is called from `stores/useChatStore.ts` when a conversation is removed. Other methods are currently unused in the UI.


