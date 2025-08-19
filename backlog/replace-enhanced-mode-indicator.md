# Replace Enhanced Mode Indicator

## Overview

The current model dropdown api call is `/api/models` (enhanced-only) and we should not fallback to the old mode of retrieving models from .env file.

I want to completely remove the old mode and any backward support in the frontend and backend codes.

Enhanced mode is the only supported format; the models endpoint should not include `enhanced=true` in the request.

## Goal

Remove the old mode of retrieving models from the .env file and ensure that all frontend and backend code is updated to use the new model dropdown API call without the `enhanced=true` parameter.

## UI Changes

In the ChatInteface header `chat-header` there is a visual indicator to show `Enhanced` mode is called. I want to repurpose that to show the account type of the User: Anonymous | Free | Pro | Enterprise

---

## Affected Areas (end-to-end)

- Backend API

  - `src/app/api/models/route.ts`
    - Currently reads `enhanced` query param + env flag, supports two modes (enhanced vs legacy) and a legacy fallback path.
    - Action: Remove query param handling and env flag dependency; always return enhanced metadata model list; delete legacy branch and fallback.
    - Headers: Remove ambiguous `X-Enhanced-Mode`; optionally keep `X-Models-Count` and other useful headers.
  - Auth middleware stays the same (`withEnhancedAuth`). Tier/ownership checks unchanged.

- Environment & Config

  - `lib/utils/env.ts`
    - Action: Remove `isEnhancedModelsEnabled()` and any logging related to the feature flag.
  - `.env*` docs/examples
    - Action: Remove `NEXT_PUBLIC_ENABLE_ENHANCED_MODELS` references.

- Client store & hooks

  - `stores/useModelStore.ts`
    - Previously tried `/api/models?enhanced=true` then fell back to `/api/models`, tracked `isEnhanced`, and extracted `modelConfigs` only when enhanced.
    - Action: Call `/api/models` without query params; assume enhanced response always. Remove `isEnhanced` state and dual-path logic; keep caching and `modelConfigs` support.
  - `stores/index.ts` (if exporting `useModelSelection`, `isEnhancedModels`, types)
    - Action: Remove `isEnhancedModels` type guard if no longer needed; make enhanced model type the default.

- UI

  - `components/chat/ChatInterface.tsx`
    - Currently displays a header badge for “Enhanced” and passes `enhanced` to `ModelDropdown`.
    - Action: Remove the "Enhanced" mode badge; repurpose header indicator to show account type: Anonymous | Free | Pro | Enterprise (from auth + `/api/user/data`).
  - `components/ui/ModelDropdown.tsx`
    - Currently supports dual paths (enhanced vs legacy) and accepts an `enhanced` prop.
    - Action: Assume enhanced-only data; remove `enhanced` prop and legacy formatting/filters; keep metadata badges (context length, pricing, capabilities).
  - `components/chat/MessageInput.tsx`
    - Currently checks `isEnhanced` + `isEnhancedModels(availableModels)` to decide image modality support.
    - Action: Assume enhanced models shape; simplify `modelSupportsImages` logic to read from enhanced model list directly.

- Docs & Tests
  - Update any docs referencing `/api/models?enhanced=true` (e.g., `docs/api/...`).
  - Update tests/mocks that stub `GET /api/models?enhanced=true` to use `GET /api/models` instead.
  - Remove references to legacy `.env`-driven model list in docs.

---

## Change Plan (phased, with checkboxes)

### Phase 1 – Backend endpoint simplification

- [ ] Remove query param handling and legacy fallback in `src/app/api/models/route.ts`; always return enhanced metadata. (implemented; pending your verification)
- [ ] Drop `X-Enhanced-Mode` header and keep/standardize `X-Models-Count` (optional). (implemented; pending your verification)
- [ ] Ensure tier filtering and `default_model` prioritization still work. (implemented; pending your verification)
- [ ] Add minimal error handling that returns an error (no legacy fallback to string array). (implemented; pending your verification)
- [ ] User verification: Confirm the endpoint returns enriched models and no longer accepts/depends on `enhanced=true`.

User Test Steps:

- Call `GET /api/models` and inspect response shape is enhanced (objects, not string IDs).
- Confirm query param `?enhanced=true` is ignored and does not change response.
- Validate headers and that models reflect the current user tier.

### Phase 2 – Env & utilities cleanup

- [ ] Remove `isEnhancedModelsEnabled()` and related feature flag logic from `lib/utils/env.ts`. (implemented; pending your verification)
- [ ] Remove `NEXT_PUBLIC_ENABLE_ENHANCED_MODELS` mentions from docs/examples. (implemented in code/docs; pending your verification)
- [ ] User verification: no build-time/type errors; no dead imports.

User Test Steps:

- Build the app; confirm no references to the removed env helpers remain.

### Phase 3 – Store refactor (single-path)

- [ ] Update `stores/useModelStore.ts` to fetch `/api/models` only and assume enhanced response. (implemented; pending your verification)
- [ ] Remove `isEnhanced` state and legacy parsing; keep `modelConfigs` and caching based on enhanced data. (implemented; pending your verification)
- [ ] Update exports (e.g., remove `isEnhancedModels` guard if present in `stores/index.ts`). (implemented; pending your verification)
- [ ] User verification: models load on first render, cache refresh behaves, selectors work.

User Test Steps:

- Load the app; open model dropdown; verify enriched data (descriptions/badges) is present.
- Reload; confirm cache does not break selection and background refresh still works if implemented.

### Phase 4 – UI updates (dropdown + header)

- [ ] `ModelDropdown.tsx`: remove `enhanced` prop and legacy UI; keep enhanced-only features. (implemented; pending your verification)
- [ ] `ChatInterface.tsx`: remove Enhanced badge; add account-type indicator using `useUserData` (+ `useAuth` for anonymous detection). (implemented; pending your verification)
- [ ] `MessageInput.tsx`: simplify image capability check to rely on enhanced model info. (implemented; pending your verification)
- [ ] User verification: header displays Anonymous | Free | Pro | Enterprise correctly; dropdown looks/works the same or better.

User Test Steps:

- Sign out → header shows "Anonymous".
- Sign in as Free/Pro/Enterprise (or mock) → header shows correct tier.
- Switch models; verify dropdown metadata and filters still behave.

### Phase 5 – Docs & Tests

- [ ] Update API docs to remove `enhanced=true` and document enhanced-only response. (implemented; pending your verification)
- [ ] Update tests/mocks intercepting `/api/models?enhanced=true` → `/api/models`. (partially implemented; remaining tests reviewed)
- [ ] Remove references to legacy env-based model list. (implemented in primary docs; archive/specs flagged below)
- [ ] User verification: `npm run build` and `npm test` pass.

User Test Steps:

- Run build and tests; ensure green.
- Spot-check docs pages for the updated endpoint and examples.

---

## Acceptance Criteria

- The app no longer references the legacy env-based model list or the `enhanced=true` query param anywhere.
- `GET /api/models` always returns enhanced model objects with metadata; no string[] fallback remains.
- Header indicator shows account type (Anonymous | Free | Pro | Enterprise) instead of "Enhanced".
- Build and tests pass; docs updated.

---

## Open Questions (please confirm)

1. Should the models API ignore the `enhanced` query param silently (no-op) or return a 410/400? Recommendation: ignore for backward links to avoid client breakage.
2. For anonymous users, confirm the header label should be exactly "Anonymous" (vs "Guest").
3. Do we want any dev-only fallback (e.g., static fixture) when OpenRouter is unreachable, or remove all fallbacks entirely?
4. Any headers from the old endpoint we must preserve for analytics/clients (e.g., `X-Models-Count`)?
5. Are there any persisted client caches/keys that include `isEnhanced` we should migrate/clear, or safe to drop?

---

## Notes / Risks / Rollback

- Removing the legacy path is breaking if any external client depends on string[] responses; we scope change to internal endpoint usage only.
- If issues arise, we can reintroduce a temporary feature switch behind a server-only env flag (but default to enhanced-only).
- Ensure tests/mocks are updated in lockstep to avoid CI hangs.
