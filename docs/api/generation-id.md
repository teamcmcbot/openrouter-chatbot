# Endpoint: `/api/generation/{id}`

**Method:** `GET`

## Description
Fetches generation details from the OpenRouter API for the given `id`. It proxies the request to OpenRouter with the configured API key and returns the parsed response.

## Usage in the Codebase
- Used in `components/ui/ModelDetailsSidebar.tsx` when displaying model pricing or metrics for a completion.


