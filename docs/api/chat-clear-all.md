# Endpoint: `/api/chat/clear-all`

**Method:** `DELETE`

## Description
Deletes all chat sessions and their messages for the authenticated user. It fetches the user sessions from Supabase, removes all related messages, then removes the sessions themselves.

## Usage in the Codebase
- Invoked from `stores/useChatStore.ts` when the user chooses to clear all conversations.


