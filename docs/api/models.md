# Endpoint: `/api/models`

**Method:** `GET`

## Description
Returns the list of available models. When the `enhanced` query parameter is `true`, it fetches and caches model metadata from OpenRouter and filters the response based on allowed models. Otherwise it returns a simple array of model IDs.

## Usage in the Codebase
- Called from `stores/useModelStore.ts` to populate the model selector (both enhanced and legacy modes).


