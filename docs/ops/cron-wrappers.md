# Cron Wrappers (GET) for Scheduled Jobs

Purpose: Allow Vercel Cron (GET-only) to securely trigger internal POST maintenance endpoints.

## Why wrappers?

- Vercel Cron invokes GET URLs and cannot attach arbitrary headers or a POST body.
- Our internal jobs are secured (Bearer/HMAC) and accept JSON bodies with options.
- Wrappers run on the server, validate `Authorization: Bearer ${CRON_SECRET}`, and forward an authenticated POST to the internal endpoints with safe defaults.

## Endpoints

- GET `/api/cron/attachments/cleanup` → POST `/api/internal/attachments/cleanup`
- GET `/api/cron/attachments/retention` → POST `/api/internal/attachments/retention`
- GET `/api/cron/models/sync` → POST `/api/internal/sync-models`

All wrappers return the JSON response of the underlying internal call and set `Cache-Control: no-store`.

## Environment Variables

Required:

- `CRON_SECRET` – Verified by wrappers (Authorization: Bearer ...)
- For attachments jobs: `INTERNAL_CLEANUP_TOKEN` or `INTERNAL_CLEANUP_SECRET`
- For sync models: `INTERNAL_SYNC_TOKEN` or `INTERNAL_SYNC_SECRET`

Optional defaults for wrappers:

- Cleanup: `CRON_CLEANUP_HOURS` (default 24), `CRON_CLEANUP_LIMIT` (default 500), `CRON_CLEANUP_DRYRUN` ("true"/"false")
- Retention: `CRON_RETENTION_FREE_DAYS` (30), `CRON_RETENTION_PRO_DAYS` (60), `CRON_RETENTION_ENTERPRISE_DAYS` (90), `CRON_RETENTION_LIMIT` (1000), `CRON_RETENTION_DRYRUN` ("false")

## Scheduling

`vercel.json` includes:

```
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/attachments/retention", "schedule": "0 4 * * *" },
    { "path": "/api/cron/attachments/cleanup", "schedule": "30 4 * * *" },
    { "path": "/api/cron/models/sync", "schedule": "0 5 * * *" }
  ]
}
```

After deployment, Vercel will invoke those GET paths per schedule.

## Local Testing

1. Add to `.env.local`:

```
CRON_SECRET=dev_cron_secret
INTERNAL_CLEANUP_TOKEN=dev_cleanup_token
INTERNAL_SYNC_TOKEN=dev_token
```

2. Start dev server.
3. Run:

```
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/attachments/cleanup | jq
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/attachments/retention | jq
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/models/sync | jq
```

## Hardening Tips

- Return 401 (or 404) if Authorization is missing/mismatch.
- Avoid logging secrets; set `Cache-Control: no-store`.
- Use small `limit` defaults and schedule off-peak.
- Add basic concurrency guard inside the internal jobs (sync already checks).

## Troubleshooting

- 401 from wrappers: ensure `CRON_SECRET` is set in env and header matches.
- 500 from wrappers: ensure INTERNAL\_\* tokens/secrets are set; check logs of the underlying internal route.
- Timeouts: reduce batch `limit` or move to a different schedule.
