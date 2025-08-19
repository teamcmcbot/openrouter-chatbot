# Database Maintenance Scripts

This folder contains manual SQL utilities intended for operators to run in the Supabase SQL editor (or via service-role scripts). These scripts help keep Storage and database rows in sync and clean up stale data safely.

## Scripts

- `cleanup-orphan-attachments.sql`
  - Generates a list of unlinked attachments older than a cutoff for deletion.
  - Storage bytes are NOT deleted from SQL; use the Node script below.

Related script and docs:

- `scripts/cleanup-orphan-attachments.mjs` — service role script to remove Storage objects and soft-delete DB rows.
- `docs/ops/cleanup-orphan-attachments.md` — full usage guide with dry-run and safety notes.

## Usage (Supabase SQL Editor)

1. Open Supabase SQL Editor with sufficient privileges (service role / SQL editor).
2. Paste the contents of `cleanup-orphan-attachments.sql`.
3. Run the DRY-RUN query (first block) to review counts, total bytes, and age range.
4. If the results look correct, run the Node script to delete from Storage, then (optionally) run the SQL soft-delete update.
5. Optional: Use the commented "hard delete" section at the bottom to permanently remove DB rows (only after verifying Storage objects are deleted and you no longer need the rows for auditing).

## Safety Notes

- Bucket name defaults to `attachments-images`. Update it if your project uses a different name.
- Default filter targets attachments older than 24 hours to avoid removing in-flight drafts. Adjust the `INTERVAL` as needed.
- Consider batching with `LIMIT` for very large datasets.
- Always perform the DRY-RUN first and review counts before executing deletions.

## Scheduling (optional)

For automated cleanups, consider creating a Postgres cron job (pg_cron) or a Supabase scheduled function that wraps the same logic. Ensure it runs with appropriate privileges and includes conservative filters and limits.
