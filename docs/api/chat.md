# Endpoint: `/api/chat`

**Method:** `POST`

## Description
Handles chat completion requests by sending user messages to the OpenRouter API and returning the assistant response with usage and metadata. Performs request validation and token limit calculations before forwarding the request. The endpoint returns the assistant message along with token usage statistics and other metadata.

## Usage in the Codebase
- Called from `stores/useChatStore.ts` when sending a new message.


