# Request Correlation and Logging

This app standardizes request correlation and logging to make production debugging and observability reliable on Vercel and during tests.

## X-Request-ID

- Purpose: A unique opaque ID attached to each request to correlate logs, downstream calls, and responses.
- Flow:
  1. Accept an incoming header: `x-request-id` (preferred) or `x-correlation-id` (fallback).
  2. If absent, generate a new ID (e.g., `req_<timestamp>_<random>`).
  3. Include the ID in all logs for that request.
  4. Echo `X-Request-ID` on every response (success or error), so users can share it when reporting issues.
- Safety: It is not authentication. Do not embed PII.

## Implementation pattern (server routes)

- Extract or generate requestId early in the handler.
- Use the centralized `logger` and include `{ requestId }` in log context.
- Pass `requestId` into `handleError(error, requestId)`.
- Set `X-Request-ID` header on success responses; the centralized error handler will set it on errors.

## Headers and tests

- Tests sometimes pass plain JS objects for headers; production uses the Web `Headers` interface.
- Use a safe accessor when reading headers to support both (see `safeHeaderGet`).

## Logger behavior

- Dev: pretty console output.
- Prod: JSON logs; warn/error to stderr.
- Test: simplified strings to satisfy expectations.
- Optional: HTTP drain via `LOG_HTTP_DRAIN_URL` and token.

## Example

```ts
// Early in route handler
const forwardedId =
  safeHeaderGet(request.headers, "x-request-id") ||
  safeHeaderGet(request.headers, "x-correlation-id");
const requestId =
  forwardedId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

logger.info("My route received request", { requestId, ...context });

try {
  // ...
  return NextResponse.json(data, {
    status: 200,
    headers: { "X-Request-ID": requestId },
  });
} catch (err) {
  return handleError(err, requestId); // echoes X-Request-ID
}
```

## Next steps

- Propagate this pattern to all API routes.
- Add tests that assert `X-Request-ID` is present in both success and error responses.
- Consider redaction of sensitive keys in logs and sampling of noisy info-level logs.
