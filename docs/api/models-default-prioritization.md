# Models API - Default Model Prioritization Feature

## Overview

The Models API (`/api/models`) includes intelligent default model prioritization that automatically reorders the models list to place a user's preferred default model at the first position when available.

## Feature Details

### When It Activates

The default model prioritization feature activates when the following conditions are met:

1. **User is authenticated** - Valid session with `authContext.isAuthenticated = true`
2. **User has default model set** - `authContext.profile.default_model` is not null/empty
3. **Default model is accessible** - The model exists in the user's tier-based allowed models list

### Behavior

| Scenario                           | Action                 | Logging                         |
| ---------------------------------- | ---------------------- | ------------------------------- |
| Default model found (position > 0) | Move to first position | `default_model_prioritized`     |
| Default model already first        | No change              | `already_prioritized`           |
| Default model not in allowed list  | No change              | `model_not_accessible` (WARN)   |
| Invalid default model value        | Skip feature           | `invalid_configuration` (DEBUG) |
| Authentication/processing error    | Skip feature           | `prioritization_failed` (ERROR) |

### Performance Impact

- **Time Complexity**: O(n) for array search + O(n) for array reordering
- **Space Complexity**: O(1) - in-place array manipulation
- **Typical Impact**: < 1ms additional processing time for 100-500 models
- **Fallback**: Feature failures don't affect API response

## API Response Format

The prioritized models response maintains the same format as the standard enhanced models response:

```typescript
interface ModelsResponse {
  models: ModelInfo[];
}

interface ModelInfo {
  id: string;
  name: string;
  context_length: number;
  description?: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  // ... other fields
}
```

## Implementation Details

### Code Location

The prioritization logic is implemented in `/src/app/api/models/route.ts` after the `filterAllowedModels()` call and before the `transformOpenRouterModel()` transformation.

### Key Components

1. **Authentication Check**: Uses `AuthContext` from middleware
2. **Profile Access**: Reads `default_model` from user profile
3. **Model Search**: Uses `Array.findIndex()` for efficient lookup
4. **Array Reordering**: Uses `splice()` + `unshift()` for in-place manipulation
5. **Comprehensive Logging**: Structured logs for monitoring and analytics

### Error Handling

The feature implements graceful degradation:

- **Try-catch wrapper** prevents any prioritization errors from affecting the API response
- **Input validation** ensures safe string operations
- **Fallback logging** captures errors for debugging without user impact
- **Continuation guarantee** - API always returns valid response regardless of feature status

## Monitoring and Analytics

### Structured Logging

All prioritization events are logged with structured data for analytics:

```typescript
// Successful prioritization
{
  userId: string,
  defaultModelId: string,
  previousPosition: number,
  newPosition: 0,
  totalModels: number,
  action: 'reordered',
  performance: 'optimal'
}

// Model not accessible
{
  userId: string,
  defaultModelId: string,
  userTier: string,
  totalAvailableModels: number,
  action: 'model_not_found',
  suggestion: 'user_should_update_default'
}
```

### Key Metrics

Monitor these log events for usage analytics:

- `default_model_prioritized` - Feature successfully activated
- `already_prioritized` - Default model was already first
- `model_not_accessible` - User's default model not in their tier
- `prioritization_failed` - Technical error occurred

### Performance Monitoring

Response headers include performance metrics:

- `X-Response-Time` - Total API response time
- `X-Models-Count` - Number of models returned
- `X-Cache-Status` - OpenRouter API cache status

## User Experience Impact

### Benefits

1. **Improved UX** - User's preferred model appears first in dropdown menus
2. **Faster Selection** - Reduces time to find preferred model
3. **Personalization** - Respects user preferences automatically
4. **Consistency** - Same model ordering across app sessions

### Edge Cases

1. **Tier Downgrades** - If user downgrades subscription, premium default model becomes inaccessible
2. **Model Deprecation** - If default model is deprecated, it won't appear in results
3. **Profile Updates** - Changes to default model take effect on next API call
4. **Session Expiry** - Unauthenticated users don't get prioritization

## Testing Scenarios

### Unit Tests

- Authenticated user with valid default model
- Authenticated user with invalid default model
- Authenticated user with no default model
- Unauthenticated user
- Default model already at first position
- Default model not in allowed models
- Error during prioritization process

### Integration Tests

- End-to-end API flow with different user tiers
- Database profile updates reflecting in API response
- Cache behavior with prioritization active
- Performance under high concurrency

## Configuration

### Environment Variables

No special flags are required; the endpoint is enhanced-only by default.

### Database Requirements

Requires user profiles with `default_model` field:

```sql
-- User profile structure
profiles (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  default_model TEXT, -- Model ID for prioritization
  subscription_tier TEXT DEFAULT 'free',
  -- ... other fields
)
```

## Migration Notes

### Backward Compatibility

- The endpoint always returns enhanced model metadata. Legacy string[] responses were removed.
- Unauthenticated users receive the same enhanced format filtered by public access.

### Rollback Plan

To disable the feature:

1. Comment out the prioritization block in `/src/app/api/models/route.ts` if needed.
2. The API will continue to return enhanced model data.

## Security Considerations

- **No sensitive data exposure** - Only model IDs are processed
- **SQL injection safe** - Uses parameterized queries via Supabase
- **Rate limiting** - Inherits existing API rate limits
- **Authentication required** - Only authenticated users get prioritization

## Future Enhancements

### Potential Improvements

1. **Client-side caching** - Cache prioritized models list
2. **A/B testing** - Compare UX with/without prioritization
3. **Usage analytics** - Track which models users select first
4. **Smart defaults** - Suggest popular models as defaults for new users
5. **Multiple defaults** - Allow users to set tier-specific default models

### Performance Optimizations

1. **Pre-computed prioritization** - Calculate during profile update
2. **Redis caching** - Cache prioritized lists per user
3. **Background processing** - Update cached results asynchronously
4. **CDN integration** - Cache common prioritization patterns
