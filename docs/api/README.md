# API Documentation Overview

## Authentication & Security Standards

All API endpoints in the OpenRouter Chatbot project follow standardized authentication and security patterns implemented through middleware. This ensures consistent security, rate limiting, and user experience across all endpoints.

## Middleware System

### Available Middleware Types

| Middleware                  | Authentication        | Rate Limiting | Use Case                                                       |
| --------------------------- | --------------------- | ------------- | -------------------------------------------------------------- |
| `withProtectedAuth`         | Required              | ✅ Tier-based | Endpoints that require user login                              |
| `withEnhancedAuth`          | Optional              | ✅ Tier-based | Endpoints that work for both anonymous and authenticated users |
| `withConversationOwnership` | Required + Ownership  | ✅ Tier-based | Endpoints that access user conversation data                   |
| `withTierAuth`              | Required + Tier Check | ✅ Tier-based | Endpoints that require specific subscription tiers             |
| Public (no middleware)      | None                  | None          | Health checks and public endpoints                             |

### Rate Limiting by Tier

| Tier           | Requests/Hour | Max Tokens/Request | Notes                               |
| -------------- | ------------- | ------------------ | ----------------------------------- |
| **Anonymous**  | 20            | 5,000              | Limited access to basic features    |
| **Free**       | 100           | 10,000             | Standard registered user limits     |
| **Pro**        | 500           | 20,000             | Enhanced features and higher limits |
| **Enterprise** | 2,000         | 50,000             | Highest limits + admin access       |

### Rate Limit Headers

All protected endpoints include rate limit information in response headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 2025-08-07T09:30:00.000Z
Retry-After: 3600 (when rate limit exceeded)
```

### Standard Error Responses

| Status Code | Error Type            | Description                             |
| ----------- | --------------------- | --------------------------------------- |
| `401`       | Unauthorized          | Authentication required or invalid      |
| `403`       | Forbidden             | Valid auth but insufficient permissions |
| `429`       | Too Many Requests     | Rate limit exceeded                     |
| `400`       | Bad Request           | Invalid request format or parameters    |
| `404`       | Not Found             | Resource not found or no access         |
| `500`       | Internal Server Error | Unexpected server error                 |

## Endpoint Categories

### ✅ Protected Endpoints (Authentication Required)

These endpoints require user authentication and implement full rate limiting:

- [`/api/chat/messages`](./chat-messages.md) - Chat message operations
- [`/api/chat/sessions`](./chat-sessions.md) - Chat session management
- [`/api/chat/session`](./chat-session.md) - Individual session updates
- [`/api/chat/clear-all`](./chat-clear-all.md) - Bulk conversation deletion
- [`/api/chat/sync`](./chat-sync.md) - Conversation synchronization
- [`/api/user/data`](./user-data-endpoint.md) - User data and preferences
- [`/api/usage/costs`](./usage-costs.md) - Token usage and cost records
- [`/api/usage/costs/daily`](./usage-costs-daily.md) - Daily aggregated usage costs
- [`/api/usage/costs/models/daily`](./usage-costs-models-daily.md) - Per-day top model stacks for charts

### 🔄 Enhanced Endpoints (Optional Authentication)

These endpoints work for both anonymous and authenticated users with graceful degradation:

- [`/api/chat`](./chat.md) - Chat completions (basic for anonymous, enhanced for authenticated)
- [`/api/models`](./models.md) - Available models (filtered by tier, with **default model prioritization** for authenticated users)
- [`/api/generation/[id]`](./generation-id.md) - Generation status checking
- [`/api/admin/sync-models`](./admin-sync-models.md) - Admin model sync (admin only)

### 🔐 Admin & Internal Endpoints

- [`/api/admin/model-access`](./admin-model-access.md) — protected via `withAdminAuth`
- [`/api/admin/users`](./admin-users.md) — protected via `withAdminAuth`
- [`/api/admin/sync-models`](./admin-sync-models.md) — protected via `withAdminAuth`
- `/api/internal/sync-models` — internal-only (Bearer or HMAC)
  - See: [internal-sync-models.md](./internal-sync-models.md)

### 🌐 Public Endpoints (No Authentication)

These endpoints are intentionally public and have no rate limiting:

- [`/api/health/cache`](./health-cache.md) - Health monitoring

## Authentication Methods

### Primary: Cookie-Based Authentication

- **Method**: Automatic via Supabase httpOnly cookies
- **Use Case**: Web browsers and same-origin requests
- **Implementation**: Handled automatically by middleware
- **Security**: HttpOnly cookies prevent XSS attacks

### Fallback: Bearer Token Authentication

- **Method**: `Authorization: Bearer <token>` header
- **Use Case**: API clients, mobile apps, external integrations
- **Implementation**: Automatic fallback when no cookies present
- **Security**: Requires HTTPS for secure token transmission

## Feature Flags & Tier Control

### Model Access Control

| Tier       | Available Models  | Notes               |
| ---------- | ----------------- | ------------------- |
| Anonymous  | Basic models only | Limited selection   |
| Free       | Standard models   | Most common models  |
| Pro        | Advanced models   | GPT-4, Claude, etc. |
| Enterprise | All models        | Full model catalog  |

### Feature Availability

| Feature                          | Anonymous | Free | Pro | Enterprise |
| -------------------------------- | --------- | ---- | --- | ---------- |
| Custom System Prompt             | ❌        | ✅   | ✅  | ✅         |
| Advanced Models                  | ❌        | ❌   | ✅  | ✅         |
| Conversation Sync                | ❌        | ✅   | ✅  | ✅         |
| **Default Model Prioritization** | ❌        | ✅   | ✅  | ✅         |
| Analytics Dashboard              | ❌        | ❌   | ✅  | ✅         |
| Admin Functions                  | ❌        | ❌   | ❌  | ✅         |

## Security Features

### Built-in Security

- **SQL Injection Protection**: All queries use parameterized statements
- **XSS Prevention**: Input sanitization and output encoding
- **CSRF Protection**: SameSite cookies and origin validation
- **Rate Limit Protection**: Abuse prevention via tiered limits
- **Data Isolation**: RLS policies ensure user data separation

### Audit & Monitoring

- **Authentication Logging**: All auth events logged
- **Rate Limit Monitoring**: Comprehensive rate limit tracking
- **Error Tracking**: Detailed error logs without sensitive data
- **Performance Metrics**: Response time and throughput monitoring

## Usage Guidelines

### For Frontend Development

```javascript
// Authentication handled automatically via cookies
const response = await fetch("/api/endpoint");

// Check rate limit status
const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");

// Handle rate limiting
if (response.status === 429) {
  const retryAfter = response.headers.get("Retry-After");
  // Wait before retrying
}
```

### For API Clients

```javascript
// Use Bearer token for external clients
const response = await fetch("/api/endpoint", {
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
});
```

### Error Handling Best Practices

```javascript
try {
  const response = await fetch("/api/endpoint");

  if (!response.ok) {
    if (response.status === 429) {
      // Handle rate limiting
      const retryAfter = response.headers.get("Retry-After");
      throw new Error(`Rate limited. Retry after ${retryAfter} seconds`);
    } else if (response.status === 401) {
      // Handle authentication
      redirectToLogin();
    } else if (response.status === 403) {
      // Handle permission issues
      showUpgradePrompt();
    }
    throw new Error(`API Error: ${response.status}`);
  }

  return await response.json();
} catch (error) {
  console.error("API call failed:", error);
  // Handle error appropriately
}
```

## Middleware Implementation Details

### AuthContext Interface

All protected endpoints receive an AuthContext object:

```typescript
interface AuthContext {
  isAuthenticated: boolean; // Whether user is authenticated
  user: User | null; // Supabase user object
  profile: UserProfile | null; // User profile from database
  accessLevel: "anonymous" | "authenticated";
  features: FeatureFlags; // Tier-based permissions and limits
}
```

### Handler Pattern

All endpoints follow this pattern:

```typescript
import { withProtectedAuth } from "../../../../lib/middleware/auth";
import { AuthContext } from "../../../../lib/types/auth";

async function myHandler(request: NextRequest, authContext: AuthContext) {
  // User guaranteed to be authenticated with profile
  const { user, profile, features } = authContext;

  // Handler implementation...
}

export const GET = withProtectedAuth(myHandler);
```

## Migration from Manual Authentication

All endpoints have been migrated from manual authentication patterns to standardized middleware:

### Before (Manual Auth - Deprecated)

```typescript
❌ const { data: { user } } = await supabase.auth.getUser();
❌ if (!user) return NextResponse.json({ error: "Auth required" }, { status: 401 });
```

### After (Standardized Middleware - Current)

```typescript
✅ export const GET = withProtectedAuth(myHandler);
```

This standardization provides:

- **Consistent Authentication** across all endpoints
- **Automatic Rate Limiting** for abuse prevention
- **Tier-based Feature Flags** for subscription control
- **Standardized Error Handling** with proper error codes
- **Audit Logging** for security monitoring
- **Type Safety** with TypeScript interfaces

---

## Related Documentation

- [Endpoint Protection Specification](../../specs/endpoint-protection.md) - Complete technical specification
- [Internal Sync Models Endpoint](./internal-sync-models.md) - Local setup and security
- [JWT Authentication Architecture](../jwt/phase-1-authentication-architecture.md) - Authentication system design
- [Feature Flagging Implementation](../jwt/phase-2-feature-flagging-implementation.md) - Feature control system
- [Security Review](../security-review.md) - Comprehensive security analysis

---

_Last Updated: August 7, 2025_
_Status: All endpoints migrated to standardized authentication and rate limiting_
