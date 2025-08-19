# Internal Attachments Retention Endpoint

Internal scheduled job for tier-based retention of image attachments.

## Route

- Method: POST
- Path: `/api/internal/attachments/retention`
- Auth: Internal-only via one of:
  - Authorization: `Bearer <INTERNAL_CLEANUP_TOKEN>`
  - `X-Signature: <hex(hmacSHA256(body, INTERNAL_CLEANUP_SECRET))>`
- Returns headers: `X-Response-Time`

## Request Body

```
{
  "daysByTier": {        // optional; server defaults: { free: 30, pro: 60, enterprise: 90 }
    "free": 30,
    "pro": 60,
    "enterprise": 90
  },
  "limit": 1000,         // optional; default 1000; capped at 5000
  "dryRun": false,       // optional; when true, no data is modified
  "source": "vercel-cron" // optional; for audit context if middleware propagates
}
```

## Response

```
{
  "success": true,
  "data": {
    // summary of deletions, counts, etc. as returned by service
  },
  "triggeredAt": "2025-08-19T04:00:00.000Z"
}
```

## Security

- Configure environment variables in Vercel (Production/Staging):
  - `INTERNAL_CLEANUP_TOKEN` and/or `INTERNAL_CLEANUP_SECRET`
- Retention reuses the same internal cleanup middleware secrets to avoid env sprawl.
- If you want separate secrets for retention, we can extend the middleware to accept alternative envs.

## Local usage

- With npm helper:
  - `npm run retention:internal`
  - `npm run retention:internal:hmac`
- Overrides via env for local runs:
  - `FREE_DAYS`, `PRO_DAYS`, `ENTERPRISE_DAYS`, `LIMIT`, `DRY_RUN=1`, `USE_HMAC=1`
