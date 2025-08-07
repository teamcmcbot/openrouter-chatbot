# User Data API Endpoint

## Overview

The `/api/user/data` endpoint provides a unified interface for retrieving and updating comprehensive user data including analytics, profile information, and preferences. This endpoint replaces multiple separate calls with a single, efficient API that integrates with the enhanced `get_user_complete_profile()` database function.

## Authentication

All requests to this endpoint require authentication via standardized `withProtectedAuth` middleware.

## Authentication & Authorization

- **Authentication Required**: Uses `withProtectedAuth` middleware - requires valid user authentication
- **Rate Limiting**: Tier-based rate limits applied via `withRateLimit` middleware:
  - **Anonymous**: 20 requests/hour _(N/A - authentication required)_
  - **Free**: 100 requests/hour
  - **Pro**: 500 requests/hour
  - **Enterprise**: 2000 requests/hour
- **Data Access**: Users can only access their own data
- **Feature Flags**: Automatic tier-based access control applied

## Endpoints

### GET /api/user/data

Retrieves comprehensive user data including today's analytics, all-time statistics, profile information, and user preferences.

#### Request

```http
GET /api/user/data
```

_Note: Authentication is handled automatically via cookies by the `withProtectedAuth` middleware._

#### Response

**Success (200 OK):**

```json
{
  "today": {
    "messages_sent": 5,
    "messages_received": 5,
    "total_tokens": 1250,
    "input_tokens": 500,
    "output_tokens": 750,
    "models_used": { "gpt-4o-mini": 3, "gpt-4": 2 },
    "sessions_created": 2,
    "active_minutes": 45
  },
  "allTime": {
    "total_messages": 150,
    "total_tokens": 45000,
    "sessions_created": 25,
    "last_reset": "2024-01-01T00:00:00Z"
  },
  "profile": {
    "email": "user@example.com",
    "full_name": "John Doe",
    "avatar_url": "https://example.com/avatar.jpg",
    "subscription_tier": "free",
    "credits": 100
  },
  "preferences": {
    "ui": { "theme": "dark", "language": "en" },
    "session": { "auto_save": true, "max_history": 100 },
    "model": {
      "default_model": "gpt-4o-mini",
      "temperature": 0.7,
      "system_prompt": "You are a helpful assistant"
    }
  },
  "availableModels": [
    {
      "model_id": "gpt-4o-mini",
      "model_name": "GPT-4o Mini",
      "model_description": "Fast and efficient model",
      "model_tags": ["chat", "completion"],
      "daily_limit": 100,
      "monthly_limit": 1000
    }
  ],
  "timestamps": {
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2025-08-06T10:30:00Z",
    "last_active": "2025-08-06T10:30:00Z"
  }
}
```

### PUT /api/user/data

Updates user preferences (UI, session, and model settings). Only preference fields can be updated via this endpoint.

#### Request

```http
PUT /api/user/data
Content-Type: application/json

{
  "ui": { "theme": "light", "language": "en" },
  "session": { "auto_save": false },
  "model": {
    "default_model": "gpt-4",
    "temperature": 0.8
  }
}
```

**Setting Default Model to None:**

```http
PUT /api/user/data
Content-Type: application/json

{
  "model": {
    "default_model": null
  }
}
```

or

```http
PUT /api/user/data
Content-Type: application/json

{
  "model": {
    "default_model": ""
  }
}
```

_Note: Authentication is handled automatically via cookies by the `withProtectedAuth` middleware._

#### Response

**Success (200 OK):** Returns the same structure as GET with updated preferences.

## Data Sources

### Analytics Data

- **Today's Usage**: Sourced from `user_usage_daily` table for current date
- **All-time Statistics**: Sourced from `profiles.usage_stats` JSONB field
- **Models Used**: Aggregated from daily usage tracking

### Profile Data

- **Basic Info**: Sourced from `profiles` table (`email`, `full_name`, `avatar_url`)
- **Subscription**: Managed in `profiles.subscription_tier`
- **Credits**: Tracked in `profiles.credits`

### Preferences

- **UI Preferences**: Stored in `profiles.ui_preferences` JSONB field
- **Session Preferences**: Stored in `profiles.session_preferences` JSONB field
- **Model Defaults**: Stored in individual `profiles` columns
  - `default_model`: Can be string (model ID) or null (automatic selection)
  - Null/empty values are allowed and handled by automatic model selection
  - Invalid model IDs are rejected with validation error

### Available Models

- **Model Access**: Determined by `get_user_allowed_models()` function
- **Tier-based Access**: Models filtered by user's subscription tier
- **Rate Limits**: Daily and monthly limits based on model and tier

## Error Responses

### 401 Unauthorized

```json
{
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

### 403 Forbidden

```json
{
  "error": "Forbidden",
  "message": "Access denied"
}
```

### 429 Too Many Requests

```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please try again later.",
  "retryAfter": 3600
}
```

### 404 User Not Found

```json
{
  "error": "User not found",
  "message": "User profile does not exist"
}
```

### 400 Bad Request (PUT only)

```json
{
  "error": "Invalid request",
  "message": "Invalid preference data"
}
```

**Invalid Model ID:**

```json
{
  "error": "Invalid model",
  "message": "Model 'invalid-model-id' is not available or accessible"
}
```

**Valid Model Values:**

- `null` or empty string: Enables automatic model selection
- Valid model ID string: Sets specific default model
- Invalid model ID: Returns 400 error

### 500 Internal Server Error

```json
{
  "error": "Internal server error",
  "message": "Database connection failed"
}
```

## Implementation Details

### Database Function Integration

The endpoint uses the enhanced `get_user_complete_profile()` function which:

- Aggregates data from multiple tables (`profiles`, `user_usage_daily`, `model_access`)
- Provides clean "today" analytics separate from historical data
- Maintains backwards compatibility with existing function usage
- Optimizes queries for real-time performance

### Caching Strategy

- User data is fetched fresh on each request to ensure accuracy
- Frontend implements client-side caching via React hooks
- Analytics data refreshes automatically when user performs actions

### Security Considerations

- All requests require valid authentication via `withProtectedAuth` middleware
- User can only access their own data (enforced by AuthContext validation)
- Preference updates are validated before database persistence
- Rate limiting prevents abuse with tier-based limits
- Error responses don't expose sensitive system information
- Automatic audit logging for all authentication events

## Rate Limiting

All responses include rate limit headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 2025-08-07T09:30:00.000Z
Retry-After: 3600 (when rate limit exceeded)
```

## Usage Examples

### Fetching User Data (JavaScript)

```javascript
const response = await fetch("/api/user/data");

if (response.ok) {
  const userData = await response.json();
  console.log(`Today: ${userData.today.messages_sent} messages`);
  console.log(`All-time: ${userData.allTime.total_messages} messages`);
} else {
  console.error("Failed to fetch user data");
}
```

_Note: Authentication is handled automatically via cookies._

### Updating Preferences (JavaScript)

```javascript
const preferences = {
  ui: { theme: "light" },
  model: { temperature: 0.8 },
};

const response = await fetch("/api/user/data", {
  method: "PUT",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(preferences),
});

if (response.ok) {
  const updatedData = await response.json();
  console.log("Preferences updated successfully");
} else {
  console.error("Failed to update preferences");
}
```

### Setting Default Model to None (JavaScript)

```javascript
// Set default model to automatic selection
const preferences = {
  model: { default_model: null },
};

const response = await fetch("/api/user/data", {
  method: "PUT",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(preferences),
});

if (response.ok) {
  console.log("Default model set to automatic selection");
} else {
  console.error("Failed to update default model");
}
```

_Note: Authentication is handled automatically via cookies._

## Related Documentation

- [UserSettings Component](../components/ui/UserSettings.md) - Frontend component that uses this API
- [User Data Types](../../lib/types/user-data.ts) - TypeScript interfaces for API responses
- [User Data Service](../../lib/services/user-data.ts) - Service layer for API calls
- [Database Schema](../database/profiles.md) - Database table structures
- [Authentication](../jwt/jwt-authentication.md) - JWT token handling

## Changelog

### v1.0.0 (2025-08-07)

- Initial implementation of unified user data endpoint
- Support for analytics, profile, and preferences in single API
- Integration with enhanced database function
- Comprehensive error handling and validation
