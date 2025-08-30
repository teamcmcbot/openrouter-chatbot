# Endpoint: `/api/health/cache`

**Method:** `GET`

## Authentication & Authorization

- **Public Endpoint**: No authentication required - intentionally public for health monitoring
- **No Rate Limiting**: Designed for frequent monitoring without restrictions
- **Read-Only**: Safe endpoint that only returns health status information

## Description

Returns the health status of model configuration availability using the DB-backed source of truth. The endpoint considers the system healthy when at least one active model configuration is returned for the `anonymous` tier. The in-memory model config cache has been deprecated; this endpoint now probes the database via server utilities.

## Usage in the Codebase

- Not currently used by the UI. Intended for operations or testing scripts.

## Implementation Details

- Reads DB-backed model configurations using `getServerModelConfigsForTier('anonymous')` from `lib/server/models`.
- Health criteria: `healthy` if `configCount > 0`, otherwise `degraded`.
- Response mirrors previous shape but now reports DB-derived details.

## Response

Top-level fields:

- `status`: `"healthy" | "degraded" | "error"`
- `timestamp`: ISO string
- `caches.modelConfigs.status`: `"healthy" | "degraded"`
- `caches.modelConfigs.details`: `{ tier: "anonymous", configCount: number }`

### Example (healthy)

```
{
	"status": "healthy",
	"timestamp": "2025-08-29T12:34:56.789Z",
	"caches": {
		"modelConfigs": {
			"status": "healthy",
			"details": {
				"tier": "anonymous",
				"configCount": 12
			}
		}
	}
}
```

### Example (degraded)

```
{
	"status": "degraded",
	"timestamp": "2025-08-29T12:34:56.789Z",
	"caches": {
		"modelConfigs": {
			"status": "degraded",
			"details": {
				"tier": "anonymous",
				"configCount": 0
			}
		}
	}
}
```

### Error Response

```
{
	"status": "error",
	"timestamp": "2025-08-29T12:34:56.789Z",
	"error": "Failed to check cache health"
}
```

## Notes

- The legacy in-memory cache utilities (`getCacheHealthStatus`, `preloadModelConfigs`) are deprecated and no longer used by this endpoint.
- This endpoint remains public for health monitors; if you need to add rate limiting, prefer tiered limits as described in `docs/architecture/redis-rate-limiting.md`.
