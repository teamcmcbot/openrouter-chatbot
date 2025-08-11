-- Phase 4: Analytics views for sync and model usage (idempotent)
BEGIN;

-- Admin-only sync stats
CREATE OR REPLACE VIEW public.v_sync_stats AS
SELECT
  (SELECT id FROM public.model_sync_log WHERE sync_status='completed' ORDER BY sync_completed_at DESC NULLS LAST LIMIT 1) AS last_success_id,
  (SELECT sync_completed_at FROM public.model_sync_log WHERE sync_status='completed' ORDER BY sync_completed_at DESC NULLS LAST LIMIT 1) AS last_success_at,
  (
    SELECT CASE WHEN COUNT(*)=0 THEN 0::numeric ELSE ROUND(SUM(CASE WHEN sync_status='completed' THEN 1 ELSE 0 END)::numeric * 100 / COUNT(*), 2) END
    FROM public.model_sync_log
    WHERE sync_started_at >= NOW() - INTERVAL '30 days'
  ) AS success_rate_30d,
  (
    SELECT ROUND(AVG(duration_ms)::numeric, 2)
    FROM public.model_sync_log
    WHERE sync_status='completed'
      AND sync_started_at >= NOW() - INTERVAL '30 days'
  ) AS avg_duration_ms_30d,
  (
    SELECT COUNT(*) FROM public.model_sync_log WHERE sync_started_at >= NOW() - INTERVAL '24 hours'
  ) AS runs_24h,
  (
    SELECT COUNT(*) FROM public.model_sync_log WHERE sync_status='failed' AND sync_started_at >= NOW() - INTERVAL '24 hours'
  ) AS failures_24h;

-- Public model counts (safe aggregate)
CREATE OR REPLACE VIEW public.v_model_counts_public AS
SELECT
  COUNT(*) FILTER (WHERE status='new') AS new_count,
  COUNT(*) FILTER (WHERE status='active') AS active_count,
  COUNT(*) FILTER (WHERE status='inactive') AS inactive_count,
  COUNT(*) FILTER (WHERE status='disabled') AS disabled_count,
  COUNT(*) AS total_count
FROM public.model_access;

-- Admin-only recent activity (7/30d)
CREATE OR REPLACE VIEW public.v_model_recent_activity_admin AS
WITH changes AS (
  SELECT
    DATE_TRUNC('day', updated_at) AS day,
    COUNT(*) FILTER (WHERE status='new') AS flagged_new,
    COUNT(*) FILTER (WHERE status='active') AS flagged_active,
    COUNT(*) FILTER (WHERE status='inactive') AS flagged_inactive,
    COUNT(*) FILTER (WHERE status='disabled') AS flagged_disabled
  FROM public.model_access
  WHERE updated_at >= NOW() - INTERVAL '30 days'
  GROUP BY 1
)
SELECT * FROM changes ORDER BY day DESC;

COMMIT;
