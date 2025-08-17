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

## Implementation Options

1. Database function + pg_cron

- Create function `cleanup_expired_attachments()` that:
  - Determines retention window based on owner tier by joining user_id -> user_profiles (or billing/tier table).
  - Selects candidate rows for deletion (expired by tier or orphan >24h).
  - Updates DB: set deleted_at = now() RETURNING rows for storage deletion.
  - Calls HTTP RPC or emits NOTIFY payload for a worker to delete storage objects.
- Schedule via `pg_cron` daily off-peak (e.g., 03:15 UTC).

2. Edge worker / server cron (preferred for storage deletion)

- Server task (Next.js route or Vercel/CRON/Supabase Edge Function) that:
  - Paginates through candidates (limit 500 per run) based on DB query.
  - For each, performs best-effort storage remove using Supabase Storage API.
  - On success, sets deleted_at if not already set; on missing object, still mark deleted.
  - Retries transient errors up to N times with exponential backoff.

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
