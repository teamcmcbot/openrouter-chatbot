# Image Attachments Retention & Orphan Cleanup Job

## Purpose

- Enforce tiered retention for image attachments: Free 30d, Pro 60d, Enterprise 90d.
- Clean up orphaned uploads: attachments not linked to a message within 24h.
- Reduce storage costs and keep DB/storage consistent.

## Scope

- Targets chat_attachments rows with kind = 'image' and deleted_at IS NULL.
- Storage bucket: `attachments-images` (private).
- Linkage fields: session_id, message_id, draft_id, storage_bucket, storage_path.

## Policies

- Retention by tier
  - Free: hard delete at 30 days after link time (message_timestamp of owning message) or upload time when unlinked.
  - Pro: 60 days; Enterprise: 90 days.
- Orphan cleanup
  - Any attachment with message_id IS NULL and created_at < now() - interval '24 hours'.
  - If draft_id is present but no message link after 24h, delete.
- Idempotency
  - Mark rows with deleted_at timestamp and attempt storage delete; if storage object is already missing, proceed without error.
  - Re-running should skip already-deleted rows.

## Implemented Endpoints

- Internal (for scheduled jobs):
  - `POST /api/internal/attachments/retention` – tier-based retention cleanup
  - `POST /api/internal/attachments/cleanup` – orphan cleanup (>24h unlinked)
  - Auth: Bearer `INTERNAL_CLEANUP_TOKEN` or HMAC `INTERNAL_CLEANUP_SECRET`
- Admin (manual trigger):
  - `GET|POST /api/admin/attachments/retention` – run batch with optional overrides
  - `GET|POST /api/admin/attachments/cleanup` – orphan cleanup batch

Both internal routes share the same internal auth middleware and secrets for simplicity.

## Scheduling on Vercel (Recommended)

Vercel Cron cannot attach custom headers directly. Use wrapper GET endpoints that run on the server and forward to internal POST routes with the right auth.

### Wrapper pattern (example)

Create these small handlers (paths are examples):

- `GET /api/cron/attachments/retention` → server-side fetch `POST /api/internal/attachments/retention`
- `GET /api/cron/attachments/cleanup` → server-side fetch `POST /api/internal/attachments/cleanup`

Each wrapper should:

- Read `INTERNAL_CLEANUP_TOKEN` or `INTERNAL_CLEANUP_SECRET` from env
- Build a JSON body with defaults/overrides (e.g., `limit`, `dryRun`, `daysByTier`)
- Add either `Authorization: Bearer ...` or `X-Signature` (HMAC-SHA256 of the exact body)
- Call the internal route and return the response JSON

### Vercel setup steps

1. Project → Settings → Environment Variables (Production + Preview):
   - `INTERNAL_CLEANUP_TOKEN` and/or `INTERNAL_CLEANUP_SECRET` (strong random values)
2. Project → Settings → Cron Jobs:
   - Add job: `GET /api/cron/attachments/retention` → schedule `0 4 * * *`
   - Add job: `GET /api/cron/attachments/cleanup` → schedule `30 4 * * *`
3. Deploy. Use the Vercel logs to confirm runs and durations.

### Local testing

- Start the dev server and use the npm helpers:
  - `npm run retention:internal` (or `:hmac`)
  - `npm run cleanup:internal` (or `:hmac`)
- Optional overrides via env: `FREE_DAYS`, `PRO_DAYS`, `ENTERPRISE_DAYS`, `LIMIT`, `DRY_RUN=1`.

## Observability & Safety

- Logs include `X-Response-Time`; service returns counts and sample IDs.
- DB rows are soft-deleted via `deleted_at`; storage objects are removed when present; missing objects are tolerated.
- For high volumes, prefer small `limit` with daily cadence to avoid timeouts.

## Data Model & Queries

- Determine user tier: via `user_profiles.subscription_tier` or similar, default 'free'.
- Retention cutoff per tier:
  - free: interval '30 days'
  - pro: interval '60 days'
  - enterprise: interval '90 days'
- Expired linked attachments:

```
-- attachments linked to a message: age from message_timestamp
SELECT a.*
FROM chat_attachments a
JOIN chat_messages m ON m.id = a.message_id
JOIN user_profiles p ON p.user_id = a.user_id
WHERE a.kind = 'image'
  AND a.deleted_at IS NULL
  AND m.message_timestamp < (now() - CASE p.subscription_tier
    WHEN 'enterprise' THEN interval '90 days'
    WHEN 'pro' THEN interval '60 days'
    ELSE interval '30 days' END);
```

- Expired unlinked/orphans:

```
SELECT a.*
FROM chat_attachments a
JOIN user_profiles p ON p.user_id = a.user_id
WHERE a.kind = 'image'
  AND a.deleted_at IS NULL
  AND a.message_id IS NULL
  AND a.created_at < (now() - interval '24 hours');
```

## Safety & RLS

- Use a service role to bypass RLS for maintenance.
- Hard delete storage objects, soft-delete DB (deleted_at). Optionally hard-delete DB after 7 days grace.
- Keep audit log: insert into `system_job_runs(job, started_at, finished_at, deleted_count, errors_json)`.

## Observability

- Log metrics per run: candidates, successes, storage_missing, failures, duration.
- Emit structured logs with job name and batch_id.
- Alert threshold: >2% failures over last 24h or backlog > 10k items.

## Scheduling

- Daily at 03:15 UTC (low traffic window). Duration target < 30 minutes.
- Batch size: 500; loop until no more or max 10k per run.

## Error Handling

- On storage delete error, retry up to 3 times with exponential backoff (0.5s, 2s, 5s).
- If DB update fails mid-batch, rollback only that item; continue others.

## Pseudocode

```
for each page of candidates:
  for each attachment a in page:
    try delete storage(a.storage_bucket, a.storage_path)
    if success or NotFound:
      mark a.deleted_at = now()
      inc success or missing
    else if transient:
      retry up to 3 times
    else:
      record error
write run summary to system_job_runs
```

## Manual Run

- Expose a protected admin endpoint `/api/admin/attachments/cleanup` behind tier="enterprise" and admin role to trigger a single batch.

## Next Steps

- Choose implementation (Edge worker recommended).
- Add SQL view `view_expired_attachments_candidates` to centralize selection logic (easier to test).
- Create tests for candidate selection and worker pagination logic.
- Document runbook in `/docs/ops/runbooks/attachments-retention.md` (how to re-run, override, or quarantine a user).
