# Admin Model Sync API

## Overview

The Admin Model Sync API provides enterprise-level users with the ability to manually trigger and monitor model synchronization from the OpenRouter API. This endpoint is part of Phase 2 of the Database Model Access Implementation Plan.

## Authentication & Authorization

### Requirements

- **Authentication**: Must be signed in via Supabase
- **Authorization**: Requires `enterprise` subscription tier
- **Rate Limiting**: 5-minute cooldown between sync attempts per user

### Setting Up Admin Access

1. **Sign in normally** via Supabase with your account
2. **Upgrade your subscription tier** to enterprise:
   ```sql
   -- Connect to your Supabase database and run:
   UPDATE profiles
   SET subscription_tier = 'enterprise'
   WHERE email = 'your-email@example.com';
   ```
3. **Verify your access** by checking your profile:
   ```sql
   SELECT id, email, subscription_tier
   FROM profiles
   WHERE email = 'your-email@example.com';
   ```

## Endpoints

### POST /api/admin/sync-models

Manually trigger model synchronization from OpenRouter API.

#### Request

```http
POST /api/admin/sync-models
Content-Type: application/json
Authorization: Bearer <your-supabase-jwt-token>
```

#### Response (Success)

```json
{
  "success": true,
  "message": "Model synchronization completed successfully",
  "data": {
    "syncLogId": "550e8400-e29b-41d4-a716-446655440000",
    "totalProcessed": 150,
    "modelsAdded": 5,
    "modelsUpdated": 140,
    "modelsMarkedInactive": 5,
    "durationMs": 3500,
    "triggeredBy": "user-id",
    "triggeredAt": "2025-01-28T06:38:00.000Z"
  },
  "previousSync": {
    "lastSyncAt": "2025-01-27T06:38:00.000Z",
    "lastSyncStatus": "completed",
    "lastSyncDuration": 3200
  }
}
```

#### Response (Rate Limited)

```json
{
  "error": "Rate limit exceeded",
  "code": "TOO_MANY_REQUESTS",
  "message": "Please wait 180 seconds before triggering another sync",
  "retryAfter": 180
}
```

#### Response (Sync Already Running)

```json
{
  "error": "Sync already in progress",
  "code": "CONFLICT",
  "message": "A model synchronization is already in progress. Please wait for it to complete."
}
```

### GET /api/admin/sync-models

Get sync status and statistics.

#### Request

```http
GET /api/admin/sync-models
Authorization: Bearer <your-supabase-jwt-token>
```

#### Response

```json
{
  "success": true,
  "data": {
    "currentStatus": {
      "isRunning": false,
      "lastSyncAt": "2025-01-28T06:38:00.000Z",
      "lastSyncStatus": "completed",
      "lastSyncDuration": 3500,
      "totalModels": 150,
      "errorMessage": null
    },
    "statistics": {
      "period": "7 days",
      "totalSyncs": 10,
      "successfulSyncs": 9,
      "failedSyncs": 1,
      "successRate": 90,
      "averageDuration": 3200,
      "lastSuccessfulSync": "2025-01-28T06:38:00.000Z"
    },
    "cooldown": {
      "enabled": true,
      "durationMs": 300000,
      "durationMinutes": 5
    }
  }
}
```

## Testing the API

### Method 1: Using curl

1. **Get your JWT token** from browser dev tools:

   - Sign in to your app
   - Open browser dev tools → Application/Storage → Local Storage
   - Find the Supabase session token

2. **Test GET endpoint**:

   ```bash
   curl -X GET "http://localhost:3000/api/admin/sync-models" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json"
   ```

3. **Test POST endpoint**:
   ```bash
   curl -X POST "http://localhost:3000/api/admin/sync-models" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json"
   ```

### Method 2: Using Postman

1. **Set up authentication**:

   - Method: Bearer Token
   - Token: Your Supabase JWT token

2. **Create GET request**:

   - URL: `http://localhost:3000/api/admin/sync-models`
   - Method: GET
   - Headers: `Authorization: Bearer YOUR_TOKEN`

3. **Create POST request**:
   - URL: `http://localhost:3000/api/admin/sync-models`
   - Method: POST
   - Headers: `Authorization: Bearer YOUR_TOKEN`

### Method 3: Using the Test Script (Recommended)

1. **Make sure you're signed in** to your app via Supabase
2. **Copy the test script** from `scripts/test-admin-sync.js` and paste it into browser console
3. **Run the automated tests**:

   ```javascript
   // The script uses cookie-based authentication automatically
   adminSyncTester.runAllTests();
   ```

4. **Check prerequisites first** (optional):
   ```javascript
   adminSyncTester.checkPrerequisites();
   ```

**Note**: The API now uses cookie-based authentication (same as `/api/chat`), so no manual JWT token handling is required.

### Method 4: Manual Browser Dev Tools

1. **Open browser dev tools** → Console
2. **Find your JWT token**:

   ```javascript
   // Check all localStorage keys for Supabase auth
   for (let i = 0; i < localStorage.length; i++) {
     const key = localStorage.key(i);
     if (key && key.includes("auth")) {
       console.log(key, localStorage.getItem(key));
     }
   }
   ```

3. **Test GET request**:

   ```javascript
   fetch("/api/admin/sync-models", {
     method: "GET",
     headers: {
       Authorization: `Bearer YOUR_TOKEN_HERE`,
       "Content-Type": "application/json",
     },
   })
     .then((response) => response.json())
     .then((data) => console.log("GET Response:", data))
     .catch((error) => console.error("Error:", error));
   ```

4. **Test POST request**:
   ```javascript
   fetch("/api/admin/sync-models", {
     method: "POST",
     headers: {
       Authorization: `Bearer YOUR_TOKEN_HERE`,
       "Content-Type": "application/json",
     },
   })
     .then((response) => response.json())
     .then((data) => console.log("POST Response:", data))
     .catch((error) => console.error("Error:", error));
   ```

## Error Codes

| Code                | Status | Description          |
| ------------------- | ------ | -------------------- |
| `UNAUTHORIZED`      | 401    | Not signed in        |
| `FORBIDDEN`         | 403    | Not enterprise tier  |
| `TOO_MANY_REQUESTS` | 429    | Rate limit exceeded  |
| `CONFLICT`          | 409    | Sync already running |
| `SYNC_FAILED`       | 500    | Sync process failed  |

## Rate Limiting

- **Cooldown Period**: 5 minutes between sync attempts per user
- **Concurrent Protection**: Only one sync can run at a time across all users
- **Headers**: Rate limit info included in response headers:
  - `Retry-After`: Seconds until next attempt allowed
  - `X-RateLimit-Reset`: Unix timestamp when rate limit resets

## Monitoring

### Sync Log Database

All sync operations are logged in the `model_sync_log` table:

```sql
SELECT
  id,
  sync_status,
  sync_started_at,
  sync_completed_at,
  total_openrouter_models,
  models_added,
  models_updated,
  models_marked_inactive,
  duration_ms,
  error_message
FROM model_sync_log
ORDER BY sync_started_at DESC
LIMIT 10;
```

### Model Access Table

Synchronized models are stored in the `model_access` table:

```sql
SELECT
  model_id,
  model_name,
  status,
  is_free,
  is_pro,
  is_enterprise,
  last_synced_at
FROM model_access
WHERE status = 'active'
ORDER BY last_synced_at DESC
LIMIT 20;
```

## Security Considerations

1. **Enterprise-Only Access**: Only enterprise tier users can trigger syncs
2. **Rate Limiting**: Prevents abuse with cooldown periods
3. **Audit Trail**: All sync operations are logged with user attribution
4. **Concurrent Protection**: Prevents multiple simultaneous syncs
5. **Error Handling**: Secure error messages without sensitive data exposure

## Integration with Existing System

This API integrates seamlessly with the existing subscription tier system:

- **No Breaking Changes**: Uses existing `enterprise` tier instead of creating new `admin` tier
- **Backward Compatible**: All existing tier checks continue to work
- **Database Integration**: Uses Phase 1 database functions and tables
- **Authentication**: Uses existing Supabase authentication system

## Next Steps

After testing the manual sync API:

1. **Task 3**: Implement scheduled job system for automatic daily syncs
2. **Task 4**: Update the `/api/models` endpoint to use database instead of environment variables
3. **Task 5**: Create admin management interface for model configuration
4. **Task 6**: Add database function enhancements for better performance
5. **Task 7**: Comprehensive testing and validation

## Troubleshooting

### Common Issues

1. **403 Forbidden**: Check that your subscription tier is set to `enterprise`
2. **401 Unauthorized**: Verify your JWT token is valid and not expired
3. **429 Rate Limited**: Wait for the cooldown period to expire
4. **409 Conflict**: Another sync is already running, wait for completion

### Debug Commands

```sql
-- Check your subscription tier
SELECT email, subscription_tier FROM profiles WHERE email = 'your-email@example.com';

-- Check recent sync logs
SELECT * FROM model_sync_log ORDER BY sync_started_at DESC LIMIT 5;

-- Check if sync is currently running
SELECT * FROM model_sync_log WHERE sync_status = 'running';

-- Check model count
SELECT status, COUNT(*) FROM model_access GROUP BY status;
```
