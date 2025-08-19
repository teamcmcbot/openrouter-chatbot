# Internal Attachments Cleanup Endpoint

Internal scheduled job for cleaning up orphan image attachments without a user session.

## Route

- Method: POST
- Path: `/api/internal/attachments/cleanup`
- Auth: Internal-only via one of:
  - Authorization: `Bearer <INTERNAL_CLEANUP_TOKEN>`
  - `X-Signature: <hex(hmacSHA256(body, INTERNAL_CLEANUP_SECRET))>`
- Returns headers: `X-Response-Time`, `X-Items-Processed`

## Request Body

```
{
  "hours": 24,     // optional; default 24
  "limit": 500,    // optional; default 500; capped at 1000
  "dryRun": false, // optional; when true, does not modify data
  "source": "vercel-cron" // optional; for audit context
}
```

## Security

- Local: use Bearer token for simplicity.
- Production: Bearer is fine; HMAC adds tamper resistance. When using HMAC, sign the exact request body bytes.
- Configure secrets in env:

```
INTERNAL_CLEANUP_TOKEN=dev_cleanup_token
INTERNAL_CLEANUP_SECRET=dev_cleanup_secret
```

## Local setup

1. Create `.env.local` with the secrets above and Supabase variables.
2. Start the dev server.
3. Trigger a run:
   - npm: `npm run cleanup:internal`
   - curl (Bearer):
     - `curl -s -X POST http://localhost:3000/api/internal/attachments/cleanup -H "Authorization: Bearer $INTERNAL_CLEANUP_TOKEN" -H "Content-Type: application/json" -d '{"hours":24,"limit":200,"source":"local-test"}' | jq`

- HMAC mode (npm): `npm run cleanup:internal:hmac`
- HMAC with curl (example):
  1. body='{"hours":24,"limit":200,"source":"local-test-hmac"}'
  2. sig=$(printf "%s" "$body" | openssl dgst -sha256 -hmac "$INTERNAL_CLEANUP_SECRET" -binary | xxd -p -c 256)
  3. curl -s -X POST http://localhost:3000/api/internal/attachments/cleanup \
     -H "X-Signature: $sig" -H "Content-Type: application/json" \
     -d "$body" | jq

## Verifying results

- Check response headers: `X-Items-Processed` and body `deletedStorage`/`softDeletedRows`.
- Database checks (examples):
  - `SELECT status, COUNT(*) FROM public.chat_attachments GROUP BY 1;`
  - `SELECT * FROM public.chat_attachments WHERE status = 'deleted' ORDER BY deleted_at DESC LIMIT 10;`

## Notes

- The internal endpoint is intended for scheduler use; it does not rely on cookies.
- Concurrency: If you plan to run frequently, consider adding a small lock to avoid overlaps; current version does not lock by default.
- Use small `limit` values with higher frequency to fit serverless timeouts.
