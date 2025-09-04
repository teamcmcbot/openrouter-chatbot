# OpenRouter error debugging guide

This app now logs enriched metadata for any non-2xx OpenRouter responses (both non-streaming and streaming HTTP errors). Use this guide to quickly triage incidents (4xx/5xx, rate limits, model not found).

## Where logs go

- Development: printed to console via `logger.error('OpenRouter HTTP error', { ... })`.
- Production: serialized JSON to stdout (ingest with your log pipeline).

## Fields captured

- requestId: `x-request-id` (or `x-openrouter-request-id`) — share this with OpenRouter support.
- status / statusText: HTTP status.
- rate: `{ limit, remaining, reset, retry_after }` from `X-RateLimit-*`/`Retry-After` headers.
- headers: lower-cased header snapshot (no auth).
- errorCode / errorMessage: values from OpenRouter JSON `error.code` / `error.message` when present.
- provider: `error.metadata.provider_name` if supplied.
- providerRaw: `error.metadata.raw` (provider-native payload); may be partial.
- bodyPreview: first 2,000 chars of response body for quick inspection.
- extra: model + attempt (non-stream) or model (stream).

## Common statuses and meaning

- 404 Not Found: wrong model slug or model currently unavailable to your key/tier. Verify the exact model id.
- 401/403: invalid/insufficient auth or disallowed access.
- 429: rate limited; check `rate` + `Retry-After`.
- 5xx: upstream provider error; retry w/ backoff or switch model.

## Next steps when you see 404 for a model

1. Confirm model id matches OpenRouter catalog (e.g. `deepseek/deepseek-chat-v3.1:free` vs available slugs).
2. Check if the model is enabled for your account/key.
3. Try an alternative free model while investigating.

## Inspect remaining credits / limits

You can query `GET https://openrouter.ai/api/v1/key` (auth required) to see credit and rate-limit information for the API key.

## Streaming edge cases

If the HTTP status is 200 but the stream carries error events, check for `choices[0].error` fields in SSE chunks (future enhancement will log these automatically).

## Headers for on-call correlation

- `X-Request-ID`: Returned on error responses and visible in logs. Search this in Sentry to correlate.
- `X-Model`: Returned by chat endpoints on both success and error. This value also appears as the `model` tag on Sentry events for `/api/chat` and `/api/chat/stream` failures.
