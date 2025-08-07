# Endpoint: `/api/models`

**Method:** `GET`

## Overview

Provides the client with the list of models that are currently allowed for the user. When the `enhanced` query parameter is `true` (or the `NEXT_PUBLIC_ENABLE_ENHANCED_MODELS` feature flag is enabled) the endpoint contacts the OpenRouter API to fetch detailed model metadata, caches the result and returns the filtered metadata. Without the flag it returns a simple list of model IDs.

**✨ New Feature**: For authenticated users in enhanced mode, the API automatically prioritizes the user's default model by placing it first in the response when available.

## Authentication & Authorization

- **Optional Authentication:** Uses `withEnhancedAuth` middleware - works for both authenticated and anonymous users
- **Rate Limiting**: Tier-based rate limits applied automatically:
  - **Anonymous:** 20 requests/hour
  - **Free:** 100 requests/hour
  - **Pro:** 500 requests/hour
  - **Enterprise:** 2000 requests/hour
- **Tier Checks:** If the user is authenticated, their `subscription_tier` from Supabase determines which models are returned (`is_free`, `is_pro`, `is_enterprise`). Anonymous users are treated as `free` tier
- **Graceful Degradation**: Enhanced features for authenticated users, basic access for anonymous users
- **Default Model Prioritization**: Authenticated users with a `default_model` set will see their preferred model first in the list

## Request

```http
GET /api/models?enhanced=true
```

`enhanced` (optional): When `true`, model metadata is fetched from OpenRouter.

## Response

### Enhanced Mode

**Default Model Prioritization**: When a user is authenticated and has a default model configured, their preferred model will appear first in the response, improving UX by reducing selection time.

```json
{
  "models": [
    {
      "id": "claude-3-5-sonnet",  // ← User's default model (moved to first position)
      "name": "Claude 3.5 Sonnet",
      "description": "...",
      "context_length": 200000,
      "pricing": { "prompt": "...", "completion": "..." },
      "input_modalities": ["text"],
      "output_modalities": ["text"],
      "supported_parameters": ["max_tokens"]
    },
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
   
4. **Default Model Prioritization** ⭐  
   For authenticated users with a `default_model` configured in their profile, the system searches for this model in the filtered results and moves it to the first position. This provides better UX by showing the user's preferred model first in dropdown menus. The feature includes comprehensive logging and graceful error handling.
   
5. **Fallback**  
   Should the OpenRouter request fail, the endpoint falls back to legacy mode and returns only the model IDs.
5. **Headers**  
   Monitoring headers such as `X-Enhanced-Mode`, `X-Response-Time`, `X-Cache-Status`, and `X-Fallback-Used` are included for observability. Rate limit headers are also included.

## Rate Limit Headers

All responses include rate limiting information:

```
X-RateLimit-Limit: 20 (anonymous) / 100+ (authenticated)
X-RateLimit-Remaining: 19
X-RateLimit-Reset: 2025-08-07T09:30:00.000Z
Retry-After: 3600 (when rate limit exceeded)
```

## Error Responses

- `429 Too Many Requests` if rate limit is exceeded (with `Retry-After` header)
- `500 Internal Server Error` if database connection fails or OpenRouter API is unavailable

## Usage in the Codebase

- Invoked from `stores/useModelStore.ts` to populate the model selector.

## Related Documentation

- [Default Model Prioritization Feature](./models-default-prioritization.md) - Comprehensive documentation for the default model prioritization feature including implementation details, monitoring, and analytics.
