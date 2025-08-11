# Admin Model Sync API

## Overview

The Admin Model Sync API allows admin users to manually trigger and monitor model synchronization from the OpenRouter API. This endpoint is part of Phase 2 of the Database Model Access Implementation Plan.

## Authentication & Authorization

### Requirements

- **Authentication Required**: Uses `withAdminAuth` middleware (requires valid user and profile)
- **Authorization**: Requires `account_type = 'admin'` (enforced by middleware)
- **Rate Limiting**: 5-minute cooldown between sync attempts per user (specific to this endpoint)
- **Automatic Validation**: Auth middleware handles all authentication and authorization checks

### Setting Up Admin Access

1. **Sign in normally** via Supabase with your account
2. **Set your account to admin**:

```sql
-- Connect to your Supabase database and run:
UPDATE profiles
SET account_type = 'admin'
WHERE email = 'your-email@example.com';
```

3. **Verify your access** by checking your profile:

```sql
SELECT id, email, account_type
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
```

Note: Authentication is handled automatically via cookies by the `withAdminAuth` middleware.

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
```

Note: Authentication is handled automatically via cookies by the `withAdminAuth` middleware.

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

## How it works (implementation details)

This section maps the API behavior to the actual implementation in the repository so you can understand the exact flow and safeguards.

- Files involved:
  - API route: `src/app/api/admin/sync-models/route.ts`
  - Sync service: `lib/services/modelSyncService.ts`
  - Auth middleware: `lib/middleware/auth.ts` (specifically `withAdminAuth`)
  - OpenRouter client/utils: `lib/utils/openrouter.ts`

### Authentication and authorization

- Both GET and POST handlers are exported through `withAdminAuth(handler)`.
- The middleware enforces:
  - User must be authenticated and have a profile.
  - `profile.account_type` must be `admin` → else 403.
- Handlers focus on business logic (cooldown, concurrency checks, sync orchestration) and do not enforce subscription tier.

### POST flow (manual sync)

1. Start timer for response metrics.
2. Admin authorization is enforced by middleware.
3. Per-user cooldown: in-memory Map keyed by userId enforces a 5-minute wait (`SYNC_COOLDOWN_MS = 300000`). If hit, returns 429 with `Retry-After` and `X-RateLimit-Reset`.
4. Concurrency guard: `modelSyncService.isSyncRunning()` checks `model_sync_log` for any row with `sync_status = 'running'`. If found, returns 409.
5. Record current attempt time in the cooldown Map.
6. Load context: `getLastSyncStatus()` to include prior sync info in the response.
7. Trigger sync: `modelSyncService.syncModels()` which:

- Fetches models from OpenRouter with retries/timeouts (`fetchOpenRouterModels()` in `lib/utils/openrouter.ts`).
- Validates model payload shape (`validateSyncData()` ensures fields like `id`, `name`, `pricing.prompt/completion` as strings, `architecture` object, `context_length` number). First 10 issues are logged, then fail.
- Writes to DB via Supabase RPC: `rpc('sync_openrouter_models', { models_data: models })`. The database function is expected to:
  - Upsert into `model_access` (add/update/mark inactive).
  - Write a log row into `model_sync_log` with status, counts, and timings.

8. On success: respond 200 with

- Body: `syncLogId`, counts, durationMs, `previousSync` snapshot.
- Headers: `X-Response-Time`, `X-Sync-Log-ID`, `X-Models-Processed`.

9. On failure: respond 500 with

- Body: `code: "SYNC_FAILED"`, `errors`, and timing details.
- Headers: `X-Response-Time`, `X-Sync-Log-ID` (if available).

10. Any uncaught error goes through `handleError()` and still adds `X-Response-Time`.

Notes:

- The cooldown Map is process-local and resets on server restart or across serverless instances; the globally-effective protection is the DB-backed “running” status check.

### GET flow (status + stats)

1. Admin authorization is enforced by middleware.
2. In parallel, load:

- `getLastSyncStatus()` → last run timestamp, status, total models, last duration, error message.
- `getSyncStatistics(7)` → last-7-day totals, success/failure counts, average duration, last successful sync timestamp.
- `isSyncRunning()` → whether any `model_sync_log` row is currently `running`.

3. Respond 200 with the combined structure shown above. Headers include `X-Response-Time` and `Cache-Control: no-cache, no-store, must-revalidate`.

### OpenRouter fetch and robustness

- Requests include API key and a 30s timeout. There are up to 4 total attempts (initial + 3 retries) with exponential backoff and jitter for transient errors and 429s, respecting `Retry-After`/`X-RateLimit-Reset` when present.
- For chat completions (used elsewhere), the util implements a distinct retry path for “no content generated” scenarios; for the model list here, the models API retry policy applies.

### Data persistence and audit trail

- `model_access` holds the synchronized catalog with fields like `status`, `is_free/pro/enterprise`, and `last_synced_at`.
- `model_sync_log` keeps a row per sync attempt (running/completed/failed), start/end timestamps, counts, duration, and error message.

### CORS

- `OPTIONS` handler responds with `Allow: GET, POST, OPTIONS` and `Access-Control-Allow-Methods: GET, POST, OPTIONS` and allows `Content-Type, Authorization` headers.

### Response headers summary

- Success (POST): `X-Response-Time`, `X-Sync-Log-ID`, `X-Models-Processed`.
- Failure (POST): `X-Response-Time`, `X-Sync-Log-ID` (if available).
- Status (GET): `X-Response-Time`, `Cache-Control: no-cache, no-store, must-revalidate`.
- Cooldown hit (POST 429): `Retry-After`, `X-RateLimit-Reset`.

## Error Codes

| Code                | Status | Description           |
| ------------------- | ------ | --------------------- |
| `UNAUTHORIZED`      | 401    | Not signed in         |
| `FORBIDDEN`         | 403    | Admin access required |
| `TOO_MANY_REQUESTS` | 429    | Rate limit exceeded   |
| `CONFLICT`          | 409    | Sync already running  |
| `SYNC_FAILED`       | 500    | Sync process failed   |

## Rate Limiting

- **Admin Endpoint Cooldown**: 5 minutes between sync attempts per user (specific to admin sync endpoint)
- **Concurrent Protection**: Only one sync can run at a time across all users
- **Headers (from this endpoint)**:
  - `Retry-After`: Seconds until next attempt allowed (sent on 429 cooldown)
  - `X-RateLimit-Reset`: Unix timestamp (seconds) when cooldown ends (sent on 429 cooldown)
  - Additional global rate limits may apply platform-wide; this route itself does not set `X-RateLimit-Limit` / `X-RateLimit-Remaining`.

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

1. **Admin-Only Access**: Only users with `account_type = 'admin'` can access these endpoints (enforced by middleware)
2. **Standardized Authentication**: Uses `withAdminAuth` middleware for consistent security
3. **Rate Limiting**: Prevents abuse with cooldown period; plus concurrency guard
4. **Audit Trail**: All sync operations are logged with user attribution
5. **Concurrent Protection**: Prevents multiple simultaneous syncs
6. **Error Handling**: Secure error messages without sensitive data exposure
7. **Automatic Cookie Handling**: Authentication handled seamlessly via browser cookies

## Integration with Existing System

This API integrates with the existing profile model:

- **Admin Role**: Uses `profiles.account_type = 'admin'` for authorization
- **Backward Compatible**: No changes to subscription tier logic for non-admin endpoints
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

1. **403 Forbidden**: Ensure your profile `account_type` is `admin`
2. **401 Unauthorized**: Verify your JWT token is valid and not expired
3. **429 Rate Limited**: Wait for the cooldown period to expire
4. **409 Conflict**: Another sync is already running, wait for completion

### Debug Commands

```sql
-- Check your admin status
SELECT email, account_type FROM profiles WHERE email = 'your-email@example.com';

-- Check recent sync logs
SELECT * FROM model_sync_log ORDER BY sync_started_at DESC LIMIT 5;

-- Check if sync is currently running
SELECT * FROM model_sync_log WHERE sync_status = 'running';

-- Check model count
SELECT status, COUNT(*) FROM model_access GROUP BY status;
```

## Change Log

- 2025-08-11: Authorization updated to require `account_type = 'admin'` via `withAdminAuth`. Removed enterprise subscription tier requirement from both GET and POST.

## Quick Verification Steps

1. Promote a user to admin:

```sql
UPDATE profiles SET account_type = 'admin' WHERE email = 'user-b@example.com';
```

2. Sign in as that user and visit the Admin dashboard.
3. GET /api/admin/sync-models → expect 200 with status payload.
4. POST /api/admin/sync-models → expect 200 success, 409 if in-progress, or 429 if within cooldown.
