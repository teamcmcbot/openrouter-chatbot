# Internal Attachments Retention Endpoint

Internal scheduled job for tier-based retention of image attachments.

## Route

- Method: POST
- Path: `/api/internal/attachments/retention`
- Auth: Internal-only via one of:
  - Authorization: `Bearer <INTERNAL_CLEANUP_TOKEN>`
  - `X-Signature: <hex(hmacSHA256(body, INTERNAL_CLEANUP_SECRET))>`
- Returns headers: `X-Response-Time`

### Cron wrapper (GET)

- Method: GET
- Path: `/api/cron/attachments/retention`
- Auth: `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron sends this automatically when CRON_SECRET is set)
- Behavior: Forwards to the POST internal endpoint with defaults from env

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
  - `CRON_SECRET` (for GET wrapper)
- Retention reuses the same internal cleanup middleware secrets to avoid env sprawl.
- If you want separate secrets for retention, we can extend the middleware to accept alternative envs.

### vercel.json scheduling

This repo includes `vercel.json` with a schedule for `/api/cron/attachments/retention`.
Vercel will call the GET path on schedule and include the `Authorization: Bearer ${CRON_SECRET}` header.

## Local usage

- With npm helper:
  - `npm run retention:internal`
  - `npm run retention:internal:hmac`
- Overrides via env for local runs:
  - `FREE_DAYS`, `PRO_DAYS`, `ENTERPRISE_DAYS`, `LIMIT`, `DRY_RUN=1`, `USE_HMAC=1`

### Local test of the GET wrapper

```
curl -s \
  -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/attachments/retention | jq
```
