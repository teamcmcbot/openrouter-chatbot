-- 002_model_sync_activity_view.sql
-- Purpose: Provide daily aggregates for model sync activity based on model_sync_log
-- Outputs (last 30 days): day, models_added, models_marked_inactive, models_reactivated, runs
-- Security: Inherits RLS from underlying table; admin-only via model_sync_log policies

BEGIN;

CREATE OR REPLACE VIEW public.v_model_sync_activity_daily AS
SELECT
  DATE_TRUNC('day', COALESCE(sync_completed_at, sync_started_at)) AS day,
  SUM(models_added) AS models_added,
  SUM(models_marked_inactive) AS models_marked_inactive,
  SUM(models_reactivated) AS models_reactivated,
  COUNT(*) AS runs
FROM public.model_sync_log
WHERE sync_status = 'completed'
  AND COALESCE(sync_completed_at, sync_started_at) >= NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY day DESC;

COMMIT;
