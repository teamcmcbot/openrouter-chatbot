# Vercel Downgrade Plan (Pro to Hobby)

## Objective
Downgrade the project from Vercel Pro to Hobby while keeping the application functional and avoiding deployment failures.

## Scope
- Keep the app deployed on Vercel.
- Preserve CI/CD from repository pushes.
- Adjust cron schedules to Hobby constraints.
- Validate runtime behavior after downgrade.

## Constraints and Assumptions
- Vercel Hobby allows cron jobs, but each cron job must run at most once per day.
- Existing environment variables and external services (Supabase, Upstash, OpenRouter, Stripe if used) remain configured.
- No feature expansion in this effort; this is an operational downgrade and stabilization task.

## Current Cron Configuration
Source: vercel.json

- /api/cron/attachments/retention: 0 4 * * * (daily)
- /api/cron/attachments/cleanup: 30 4 * * * (daily)
- /api/cron/models/sync: 0 * * * * (hourly, must change)

## Target Cron Configuration (Hobby-compatible)
- /api/cron/attachments/retention: 0 4 * * *
- /api/cron/attachments/cleanup: 30 4 * * *
- /api/cron/models/sync: 0 5 * * *

All three jobs run once per day in UTC.

## Phase 1: Pre-Downgrade Preparation
- [x] Confirm required environment variables exist in Vercel Production:
  - CRON_SECRET
  - BASE_URL
  - INTERNAL_SYNC_TOKEN or INTERNAL_SYNC_SECRET
  - INTERNAL_CLEANUP_TOKEN or INTERNAL_CLEANUP_SECRET
- [x] Confirm current cron endpoints are healthy via manual authenticated calls.
- [x] Confirm no external dependency expects hourly model sync.
- [x] User verification: approve readiness to apply cron schedule changes.

### User Test Steps (Phase 1)
1. In Vercel project settings, verify the required environment variables are present.
2. Trigger each cron endpoint manually with CRON_SECRET and verify non-401 responses.
3. Confirm with stakeholders that daily model sync is acceptable.

## Phase 2: Apply Configuration Changes
- [x] Update vercel.json to make all cron jobs daily.
- [x] Specifically change /api/cron/models/sync from 0 * * * * to 0 5 * * *.
- [x] Re-deploy and ensure deployment succeeds without cron schedule errors.
- [x] User verification: approve updated deployment state.

### User Test Steps (Phase 2)
1. Review the updated cron block in vercel.json.
2. Deploy the latest commit.
3. Confirm Vercel deployment finishes successfully.

## Phase 3: Downgrade and Post-Downgrade Validation
- [x] Downgrade Vercel plan from Pro to Hobby.
- [x] Verify cron jobs appear as daily schedules in Vercel dashboard.
- [x] Validate core user flows:
  - Chat request and streaming response
  - Authentication sign-in/sign-out
  - Basic data read/write paths
- [x] Verify maintenance jobs execute on next daily window and log successful runs.
- [x] User verification: approve production stability on Hobby.

### User Test Steps (Phase 3)
1. Downgrade the Vercel project/team plan.
2. Check Cron Jobs page for all three jobs and daily schedules.
3. Run smoke tests for chat and auth in production.
4. Review runtime logs after next cron window for successful invocations.

## Risks and Mitigations
- Risk: model list freshness decreases from hourly to daily.
  - Mitigation: allow manual sync trigger when urgent updates are needed.
- Risk: Hobby cron timing precision is lower than Pro.
  - Mitigation: avoid strict minute-sensitive workflows.
- Risk: missed env var causes cron wrapper authorization failures.
  - Mitigation: perform Phase 1 env audit before downgrade.

## Rollback Plan
- If production behavior regresses after downgrade:
  1. Re-upgrade to Pro.
  2. Restore previous cron frequency only if needed.
  3. Investigate logs and adjust scheduling strategy.

## Done Criteria
- All three cron jobs are configured to once per day.
- Deployment succeeds on Hobby constraints.
- Core app functionality works in production.
- Daily cron executions complete successfully.
- Stakeholder sign-off received.

## Final Documentation Update
- [x] Update deployment docs to reflect Hobby cron limitations and this downgrade procedure.
