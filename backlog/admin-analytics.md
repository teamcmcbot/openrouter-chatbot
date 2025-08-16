# Admin analytics: what to show

## Summary

Define and implement an admin dashboard for usage, cost, model performance, and reliability metrics.

## Current implementation snapshot

- Admin page imports `AnalyticsPanel` and usage costs page exists with charts.
- API endpoints for costs: `/api/usage/costs` and `/api/usage/costs/daily` with authentication middleware.
- Tracking includes `elapsed_ms`, token counts, and model ids in chat routes and sync.

## Candidate metrics

- Usage: messages/day, active users/day, sessions created, tokens (in/out), per-tier breakdown.
- Cost: prompt/completion/image/web_search/internal_reasoning totals; top models by spend.
- Performance: median/95p `elapsed_ms` per model and per tier.
- Reliability: error rates by error code; rate limit hits.
- Feature adoption: % requests with reasoning/web search/attachments/streaming.

## Phases

- [ ] Phase 1 — Metrics schema & queries
  - [ ] Confirm DB tables/columns for tokens, costs, latency; add migrations if needed.
  - [ ] Add API endpoints to aggregate by day/week and top-N models.
  - [ ] User verification: JSON samples reflect expected aggregations.
- [ ] Phase 2 — Admin UI panels
  - [ ] Expand `AnalyticsPanel` with charts for the above metrics.
  - [ ] Add filters (date range, tier, model).
  - [ ] User verification: panels render with mock and real data.
- [ ] Phase 3 — Alerts & SLOs (optional)
  - [ ] Basic thresholds (error rate > X%).
  - [ ] User verification: alert surfaces in UI.
- [ ] Phase 4 — Docs
  - [ ] `/docs/admin/analytics.md`.

## Clarifying questions

1. Which KPIs are most important initially?
2. Access control: which roles can view admin analytics?
3. Required retention period for analytics data?

## Risks

- Expensive queries over large tables; add proper indexes and pre-aggregation.

## Success criteria

- Admins can view core usage, cost, performance, and reliability insights with correct gating.
