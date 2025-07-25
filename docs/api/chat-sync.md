# Endpoint: `/api/chat/sync`

**Methods:** `POST`, `GET`

## Description
Synchronizes conversations between the client and the server. `POST` accepts an array of conversations from the client and upserts them into Supabase. `GET` returns the latest conversations (with messages) for the authenticated user.

## Usage in the Codebase
- Called from `stores/useChatStore.ts` to upload local conversations (`POST`) and to load conversations for a user (`GET`).


