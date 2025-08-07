# Endpoint: `/api/health/cache`

**Method:** `GET`

## Authentication & Authorization

- **Public Endpoint**: No authentication required - intentionally public for health monitoring
- **No Rate Limiting**: Designed for frequent monitoring without restrictions
- **Read-Only**: Safe endpoint that only returns health status information

## Description

Returns the health status of server-side caches, primarily for monitoring model configuration caching. Indicates whether the cache is healthy or degraded. This endpoint is intentionally kept public for operations monitoring and health checks.

## Usage in the Codebase

- Not currently used by the UI. Intended for operations or testing scripts.
