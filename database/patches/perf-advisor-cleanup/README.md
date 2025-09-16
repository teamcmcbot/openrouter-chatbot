# Performance Advisor cleanup (INFO level)

This patch set addresses INFO-level findings from `database/advisors/PerformanceAdvisor_Info.md`.

Contents:

- 001_fix_unindexed_fk.sql — adds a covering index for `public.moderation_actions.created_by` to satisfy the unindexed FK finding.
- 002_drop_unused_indexes.sql — drops a few clearly redundant/unused indexes. Run only after validating zero usage in production (pg_stat_user_indexes over 7–30 days).

Safety notes:

- All statements are idempotent via `IF NOT EXISTS` / `IF EXISTS`.
- Execute 001 first. Execute 002 after verifying usage.
