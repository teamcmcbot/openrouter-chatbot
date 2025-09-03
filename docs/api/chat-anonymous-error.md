# /api/chat/anonymous/error

Ingest anonymous error events for unauthenticated sessions. Enforces privacy while preserving useful diagnostics. The server derives anon_hash from the client-provided anonymous_session_id and may minimally enrich metadata from request headers.

- Method: POST
- Auth: Enhanced (optional). Anonymous and authenticated both allowed.
- Rate limiting: Tier C
- Middleware: `withEnhancedAuth` + `withTieredRateLimit({ tier: 'tierC' })`

## Request

Content-Type: application/json

```json
{
  "anonymous_session_id": "<client-ephemeral-uuid>",
  "timestamp": "2025-09-03T10:00:02.000Z",
  "model": "openai/gpt-4o-mini",
  "http_status": 429,
  "error_code": "rate_limit_exceeded",
  "error_message": "Too Many Requests",
  "provider": "openrouter",
  "provider_request_id": "req_abc123",
  "completion_id": "cmpl_456",
  "metadata": {
    "upstreamErrorCode": 429,
    "upstreamErrorMessage": "Too Many Requests",
    "api_request_id": "<server-correlation-id>"
  }
}
```

Notes

- Required: anonymous_session_id, timestamp (ISO), model
- Optional: http_status, error_code, error_message, provider, provider_request_id, completion_id, metadata
- Field caps: model ≤100, error_code ≤120, error_message ≤300, provider ≤60, provider_request_id ≤120, completion_id ≤120
- Metadata: object; server may add `api_request_id` if provider info is missing

## Response

200 OK

```json
{ "ok": true, "result": null }
```

Errors

- 400: invalid JSON or missing required fields
- 405: method not allowed
- 429: rate limit exceeded (Tier C)
- 500: server error or ingest_failed

## Privacy & Enrichment

- Server computes `anon_hash` via HMAC and never stores the raw session ID.
- If client cannot provide provider/provider_request_id, the server may include a correlation id from headers into metadata as `api_request_id`.
- Clients should prefer to send upstream provider metadata when available for better diagnostics.

## Example (fetch)

```ts
await fetch("/api/chat/anonymous/error", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    anonymous_session_id,
    timestamp: new Date().toISOString(),
    model: "openai/gpt-4o-mini",
    http_status: 429,
    error_code: "rate_limit_exceeded",
    error_message: "Too Many Requests",
    metadata: { api_request_id: "..." },
  }),
});
```

## Implementation

- Handler: `src/app/api/chat/anonymous/error/route.ts`
- RPC: `ingest_anonymous_error( p_payload => { anon_hash, model, timestamp, ... } )`
- Rate limit tier: Tier C
