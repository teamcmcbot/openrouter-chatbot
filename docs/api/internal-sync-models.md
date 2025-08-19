# Internal Sync Models Endpoint

This document explains the internal scheduled job endpoint that triggers model synchronization without a user session.

## Route

- Method: POST
- Path: `/api/internal/sync-models`
- Auth: Internal-only via one of:
  - Authorization: `Bearer <INTERNAL_SYNC_TOKEN>`
  - `X-Signature: <hex(hmacSHA256(body, INTERNAL_SYNC_SECRET))>`
- Returns headers: `X-Response-Time`, `X-Sync-Log-ID`, `X-Models-Processed`

## Security

- Local development: use the Bearer token for simplicity.
- Production: Bearer is fine; HMAC adds tamper resistance. If using HMAC, sign the exact request body bytes.
- Configure secrets in env:

```
INTERNAL_SYNC_TOKEN=dev_token
INTERNAL_SYNC_SECRET=dev_secret
```

## Local setup

1. Create `.env.local` with the secrets above and your Supabase variables.
2. Start the dev server.
3. Trigger a run:
   - Using npm: `npm run sync:internal`
   - Or curl (Bearer):
     - `curl -s -X POST http://localhost:3000/api/internal/sync-models -H "Authorization: Bearer $INTERNAL_SYNC_TOKEN" -H "Content-Type: application/json" -d '{"source":"local-test"}' | jq`

- HMAC mode (npm): `npm run sync:internal:hmac`
- HMAC with curl (example):
  1. body='{"source":"local-test-hmac"}'
  2. sig=$(printf "%s" "$body" | openssl dgst -sha256 -hmac "$INTERNAL_SYNC_SECRET" -binary | xxd -p -c 256)
  3. curl -s -X POST http://localhost:3000/api/internal/sync-models \
     -H "X-Signature: $sig" -H "Content-Type: application/json" \
      -d "$body" | jq

## Verifying results

- Check response headers: `X-Sync-Log-ID`, `X-Models-Processed`.
- Database checks:
  - `SELECT * FROM public.model_sync_log ORDER BY sync_started_at DESC LIMIT 5;`
  - `SELECT status, COUNT(*) FROM public.model_access GROUP BY 1;`

## Token/secret generation

- Safe random strings (macOS):
  - Token (32 bytes):
    - `openssl rand -base64 32 | tr -d '\n'`
  - Secret key (64 hex chars):
    - `openssl rand -hex 32`
- Node.js (one-liners):
  - Token:
    - `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
  - Secret:
    - `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## Notes

- The internal endpoint bypasses per-user cooldown but honors DB concurrency: if a sync is running, it returns 409.
- The run is attributed as `internal` (no user id) in `model_sync_log.added_by_user_id`.
- For production cron (Vercel/Supabase), set the same env vars and include the header in the scheduler request.
- Audit: On success/failure, this route writes to `public.admin_audit_log` with actions `sync.scheduled` or `sync.scheduled_failed` and `actor_user_id = NULL`.

See also: `docs/api/internal-attachments-cleanup.md` for the attachments cleanup internal job.
