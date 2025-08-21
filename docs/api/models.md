# Endpoint: `/api/models`

**Method:** `GET`

## Overview

Provides the client with the list of models that are currently allowed for the user. The endpoint returns enhanced model metadata directly from the database, filtered by the user's tier. This ensures fast response times (~100ms) and eliminates external API dependencies.

**✨ Behavior**: For authenticated users, the API automatically prioritizes the user's default model by placing it first in the response when available.

**🚀 Performance**: Models data is served directly from the `model_access` database table, which is kept current through hourly synchronization with OpenRouter's API via cron jobs.

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
GET /api/models
```

## Response

### Response Shape

**Default Model Prioritization**: When a user is authenticated and has a default model configured, their preferred model will appear first in the response, improving UX by reducing selection time.

```json
{
  "models": [
    {
      "id": "claude-3-5-sonnet", // ← User's default model (moved to first position)
      "name": "Claude 3.5 Sonnet",
      "description": "...",
      "context_length": 200000,
      "pricing": { "prompt": "...", "completion": "..." },
      "input_modalities": ["text"],
      "output_modalities": ["text"],
      "supported_parameters": ["max_tokens", "reasoning"]
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

### Response Headers

Performance and monitoring headers are included:

```
X-Response-Time: 95
X-Models-Count: 17
X-Total-Models-Available: 25
X-Models-Source: database
```

## Data Flow

1. **Database Query**  
   Reads active model data directly from the `model_access` table in Supabase.  
   Based on the user's tier, only models with the corresponding flags (`is_free`, `is_pro`, `is_enterprise`) are returned.

2. **Data Transformation**  
   Database rows are transformed to the `ModelInfo` format using `transformDatabaseModel()` for consistent frontend consumption.

3. **Default Model Prioritization** ⭐  
   For authenticated users with a `default_model` configured in their profile, the system searches for this model in the results and moves it to the first position. This provides better UX by showing the user's preferred model first in dropdown menus.

4. **Performance Monitoring**  
   Response includes headers for monitoring performance and data source verification.

## Data Freshness

- **Update Frequency**: Model data is synchronized hourly via Vercel cron job (`/api/cron/models/sync`)
- **Data Source**: All model metadata comes from the `model_access` table, populated from OpenRouter API
- **Sync Monitoring**: Full audit logging tracks sync operations and any failures
- **Fallback**: If sync fails, the last successful data remains available

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
- `500 Internal Server Error` if database connection fails

## Performance Benefits

| Metric               | Previous (Broken Cache)  | Current (Database)        | Improvement           |
| -------------------- | ------------------------ | ------------------------- | --------------------- |
| **Response Time**    | 3-5 seconds              | ~100ms                    | **95% faster**        |
| **API Dependencies** | OpenRouter every request | None                      | **100% elimination**  |
| **Cost per Request** | ~$0.002                  | ~$0.00005                 | **97% reduction**     |
| **Reliability**      | Cache misses frequent    | Database always available | **High availability** |

## Usage in the Codebase

- Invoked from `stores/useModelStore.ts` to populate the model selector.

### Reasoning capability note

- Clients use `supported_parameters` to detect reasoning support (`"reasoning"` or legacy `"include_reasoning"`).
- When present and the user is Enterprise tier, the UI shows a Reasoning toggle. Otherwise, the toggle is hidden or shows an upgrade notice.

## Related Documentation

- [Default Model Prioritization Feature](./models-default-prioritization.md) - Comprehensive documentation for the default model prioritization feature
- [Model Synchronization](../ops/cron-jobs.md) - Documentation on the hourly model sync process
- [Database Schema](../database/model-access.md) - Details on the `model_access` table structure
