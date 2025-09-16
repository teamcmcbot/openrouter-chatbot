# Model Sync Timing & Metrics

This document explains how model sync durations are measured and exposed after the precision upgrade.

## Overview

The sync pipeline pulls the full model list from OpenRouter and upserts metadata into `public.model_access`. Each invocation is logged in `public.model_sync_log`. Two duration metrics are now captured:

| Column           | Meaning                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `duration_ms`    | Total elapsed time from the earliest captured start (may include network fetch + JSON decoding + DB work). |
| `db_duration_ms` | Time spent executing inside the database function only (pure in-DB processing).                            |

Both are stored as `BIGINT` to avoid overflow and preserve millisecond precision across long operations.

## Measurement Details

1. The application captures an external timestamp immediately before initiating the network request to OpenRouter.
2. That timestamp is passed as `p_external_start` to `public.sync_openrouter_models`.
3. Inside the function, `db_start_time := NOW()` is recorded at entry.
4. `effective_start` = earliest of `p_external_start` (if provided and earlier) vs `db_start_time`.
5. After all processing:
   - `db_duration_ms = ceil( (now() - db_start_time) * 1000 )`
   - `duration_ms    = ceil( (now() - effective_start) * 1000 )`
6. Both values are written to `public.model_sync_log` and returned in the JSON payload.

Edge case: extremely fast in-DB executions (<1 ms) can still appear as `0` after ceiling if the interval rounds below 1. This is acceptable and typically only occurs on warm, trivial updates. (Optionally we could `GREATEST(value,1)` if a non-zero display is required.)

## Aggregated View & Access

`public.v_sync_stats` consolidates recent statistics:

- `last_success_id`, `last_success_at`
- `success_rate_30d` (percentage of completed runs over runs started in last 30 days)
- `avg_duration_ms_30d` (average total duration for successful runs in last 30 days)
- `avg_db_duration_ms_30d` (average in-DB duration for successful runs in last 30 days)
- `runs_24h` and `failures_24h`

Direct selection from the view is restricted; admins should call the SECURITY DEFINER wrapper function:

```sql
SELECT * FROM public.get_sync_stats();
```

The wrapper enforces `public.is_admin(auth.uid())`.

## Security & RLS

- The sync function runs under the caller's context; RLS policies on `model_sync_log` permit only admins to insert/update.
- The stats view is selectable only by `service_role`; end-user/admin dashboards use the wrapper function.

## Migration Summary

Changes integrated into base schema (`03-models.sql`):

- Added `db_duration_ms BIGINT`.
- Changed `duration_ms` to `BIGINT`.
- Upgraded `sync_openrouter_models` to accept `p_external_start` and compute dual durations with `CEIL`.
- Added `v_sync_stats` view and `get_sync_stats` function (SECURITY DEFINER) to centralize filtered metrics.

Existing patch file (`database/patches/model_sync_duration_precision/01_improve_model_sync_duration.sql`) remains for historical incremental migration; new fresh environments now receive the upgraded schema directly.

## Operational Notes

- A manual backfill was previously executed to replace legacy zero-duration rows; no automated backfill is bundled here to avoid unintended data distortion.
- Future UI enhancements may expose both averages with tooltips clarifying scope (total vs DB-only).

## Potential Future Enhancements

- Enforce a minimum reported `db_duration_ms` of 1 ms to avoid UI confusion.
- Add percentile metrics (p50, p95) if variance grows materially.
- Implement sampling-based extended tracing for slow syncs (> N ms) to a diagnostics table.

## Troubleshooting

| Symptom                          | Possible Cause                                  | Resolution                                                                |
| -------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------- |
| All durations near zero          | Hot cache, minimal diffs                        | Confirm network start passed; create a cold run or add debug logging.     |
| `get_sync_stats` privilege error | Missing admin claim (`auth.uid()` not an admin) | Use appropriate JWT or simulate `request.jwt.claim.sub` via `set_config`. |
| View shows NULL averages         | No successful runs in last 30 days              | Trigger a sync; check `model_sync_log` entries.                           |

## Quick Verification Queries

```sql
-- Latest raw log
SELECT * FROM public.model_sync_log ORDER BY sync_completed_at DESC LIMIT 1;

-- Aggregated stats
SELECT * FROM public.get_sync_stats();

-- Compare average DB vs total
SELECT avg(duration_ms) AS avg_total, avg(db_duration_ms) AS avg_db
FROM public.model_sync_log
WHERE sync_status='completed'
  AND sync_started_at >= now() - interval '30 days';
```

---

Document version: 1.0
