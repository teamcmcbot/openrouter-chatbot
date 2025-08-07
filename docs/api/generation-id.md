# Endpoint: `/api/generation/{id}`

**Method:** `GET`

## Authentication & Authorization

- **Optional Authentication**: Uses `withEnhancedAuth` middleware - works for both authenticated and anonymous users
- **Rate Limiting**: Tier-based rate limits applied via `withRateLimit` middleware:
  - **Anonymous**: 20 requests/hour
  - **Free**: 100 requests/hour
  - **Pro**: 500 requests/hour
  - **Enterprise**: 2000 requests/hour
- **Access Level**: Enhanced access for authenticated users, basic access for anonymous users
- **Feature Flags**: Automatic tier-based access control applied

## Description

Fetches generation details from the OpenRouter API for the given `id`. It proxies the request to OpenRouter with the configured API key and returns the parsed response. This endpoint supports both authenticated and anonymous users, with enhanced features for authenticated users.

## Rate Limit Headers

All responses include rate limiting information:

```
X-RateLimit-Limit: 20 (anonymous) / 100+ (authenticated)
X-RateLimit-Remaining: 18
X-RateLimit-Reset: 2025-08-07T09:30:00.000Z
Retry-After: 3600 (when rate limit exceeded)
```

## Error Responses

- `429 Too Many Requests` if rate limit is exceeded (with `Retry-After` header)
- `400 Bad Request` for invalid generation ID format
- `404 Not Found` if generation ID doesn't exist
- `500 Internal Server Error` if OpenRouter API is unavailable

## Usage in the Codebase

- Used in `components/ui/ModelDetailsSidebar.tsx` when displaying model pricing or metrics for a completion.
