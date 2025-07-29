# Endpoint: `/api/models`

**Method:** `GET`

## Overview

Provides the client with the list of models that are currently allowed for the user. When the `enhanced` query parameter is `true` (or the `NEXT_PUBLIC_ENABLE_ENHANCED_MODELS` feature flag is enabled) the endpoint contacts the OpenRouter API to fetch detailed model metadata, caches the result and returns the filtered metadata. Without the flag it returns a simple list of model IDs.

## Authentication & Authorization

- **Optional Authentication:** The endpoint is wrapped by `withEnhancedAuth`, meaning requests are allowed without signing in.
- **Tier Checks:** If the user is authenticated, their `subscription_tier` from Supabase determines which models are returned (`is_free`, `is_pro`, `is_enterprise`). Anonymous users are treated as `free` tier.

## Request

```http
GET /api/models?enhanced=true
```

`enhanced` (optional): When `true`, model metadata is fetched from OpenRouter.

## Response

### Enhanced Mode

```json
{
  "models": [
    {
      "id": "gpt-3.5-turbo",
      "name": "GPT‑3.5 Turbo",
      "description": "...",
      "context_length": 16384,
      "pricing": { "prompt": "...", "completion": "..." },
      "input_modalities": ["text"],
      "output_modalities": ["text"],
      "supported_parameters": ["max_tokens"]
    }
  ]
}
```

### Legacy Mode

```json
{
  "models": ["gpt-3.5-turbo", "gpt-4", "claude-3-sonnet"]
}
```

## Data Flow

1. **Database Query**  
   Uses the Supabase client to read active rows from the `model_access` table.  
   Based on the user's tier, only the models with the corresponding flags (`is_free`, `is_pro`, `is_enterprise`) are allowed.
2. **Enhanced Model Fetch**  
   If enhanced mode is requested, the service calls `fetchOpenRouterModels()` to retrieve metadata from the OpenRouter API.  
   The call is wrapped in `unstable_cache` so results are cached for 10 minutes. Subsequent requests within that window reuse the cached response.
3. **Filtering & Transformation**  
   The OpenRouter result is filtered against the allowed model IDs and each entry is converted into the simplified `ModelInfo` structure via `transformOpenRouterModel()`.
4. **Fallback**  
   Should the OpenRouter request fail, the endpoint falls back to legacy mode and returns only the model IDs.
5. **Headers**  
   Monitoring headers such as `X-Enhanced-Mode`, `X-Response-Time`, `X-Cache-Status`, and `X-Fallback-Used` are included for observability.

## Usage in the Codebase

- Invoked from `stores/useModelStore.ts` to populate the model selector.
