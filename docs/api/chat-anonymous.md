# /api/chat/anonymous

Ingest anonymous usage events for unauthenticated sessions. Events are privacy-preserving and keyed via a server-derived anon_hash; the raw anonymous_session_id never leaves the client beyond this request and is not stored.

- Method: POST
- Auth: Enhanced (optional). Anonymous and authenticated both allowed.
- Rate limiting: Tier C (generous CRUD tier)
- Middleware: `withEnhancedAuth` + `withTieredRateLimit({ tier: 'tierC' })`

## Request

Content-Type: application/json

```json
{
  "anonymous_session_id": "<client-ephemeral-uuid>",
  "events": [
    {
      "timestamp": "2025-09-03T10:00:00.000Z",
      "type": "message_sent",
      "model": "openai/gpt-4o-mini",
      "input_tokens": 123,
      "elapsed_ms": 250
    },
    {
      "timestamp": "2025-09-03T10:00:01.500Z",
      "type": "completion_received",
      "model": "openai/gpt-4o-mini",
      "output_tokens": 456,
      "elapsed_ms": 800
    }
  ]
}
```

Notes

- events length: 1..50; otherwise 413
- type: "message_sent" | "completion_received" (invalid values coerced to "message_sent")
- model: trimmed to 100 chars
- token counts and elapsed_ms: non-negative integers; invalid values are dropped

## Response

200 OK

```json
{
  "ok": true,
  "result": {
    "total_tokens": 579
  }
}
```

- The shape of `result` is subject to change; current implementation may return aggregates (e.g., generated total_tokens) from the ingest RPC. It can also be null when not applicable.

Errors

- 400: invalid JSON or missing required fields
- 405: method not allowed
- 413: too_many_events (events > 50)
- 429: rate limit exceeded (Tier C)
- 500: server error or ingest_failed

## Privacy

- The server computes `anon_hash = HMAC_SHA256(ANON_USAGE_HMAC_SECRET, anonymous_session_id)`.
- Only anon_hash is persisted; the raw ID is never stored and can rotate client-side.
- No PII included. Tokens and model names are aggregated for analytics only.

## Example (fetch)

```ts
await fetch("/api/chat/anonymous", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ anonymous_session_id, events }),
});
```

## Implementation

- Handler: `src/app/api/chat/anonymous/route.ts`
- RPC: `ingest_anonymous_usage( p_payload => { anon_hash, events[] } )`
- Rate limit tier: Tier C
