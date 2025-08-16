# Generation ID Data Lost after closing ModelDetailsSidebar

## Overview

- Assistant message contains the generation ID / completion ID link.
- On click, it opens up ModelDetailsSidebar and goes to the pricing tab.
- it calls /api/generation/<generationId> to retrieve the generation data and display on ModelDetailsSidebar, pricing tab.

Sample response:

```json
{
  "data": {
    "data": {
      "created_at": "2025-08-16T13:55:18.378595+00:00",
      "model": "mistralai/mistral-medium-3.1",
      "app_id": null,
      "external_user": null,
      "streamed": true,
      "cancelled": false,
      "latency": 343,
      "moderation_latency": null,
      "generation_time": 418,
      "tokens_prompt": 285,
      "tokens_completion": 25,
      "native_tokens_prompt": 285,
      "native_tokens_completion": 25,
      "native_tokens_reasoning": 0,
      "native_tokens_cached": 0,
      "num_media_prompt": null,
      "num_media_completion": null,
      "num_search_results": null,
      "origin": "",
      "is_byok": false,
      "finish_reason": "stop",
      "native_finish_reason": "stop",
      "usage": 0.000164,
      "api_type": "completions",
      "id": "gen-1755352517-vcNNzGslBXHr45jGsA2B",
      "upstream_id": "0c1ff376aac04ac5a9cb385ea4efe9d5",
      "total_cost": 0.000164,
      "cache_discount": null,
      "upstream_inference_cost": 0,
      "provider_name": "Mistral"
    }
  },
  "timestamp": "2025-08-16T13:55:29.525Z"
}
```

- if you click x to close the modal, and then click on the same generation_id link, the tab will reopen but it doesn't call /api/generation/<generationId> again and the UI doesnt show the data anymore.
- you must now click on another different generationId link to "refresh" the data, then clicked back on the same link to fetch the data.

## Expected Behavior

- To implement a solution where generation data is saved in localStorage, the application should first check if the data for a specific generationId exists in localStorage before making an API call.
- If the data exists, it should be retrieved from localStorage and displayed in the ModelDetailsSidebar.
- If the data does not exist, the application should proceed to call /api/generation/<generationId> to fetch the data and then save it to localStorage for future use.
- if a user sign out, the localStorage should be cleared as well.

---

## First-level Analysis

Observed behavior matches a state coordination issue between the sidebar component and store when reopening the sidebar for the same generationId.

What happens today (from code review):

- Sidebar component: `components/ui/ModelDetailsSidebar.tsx`
  - Fetch is gated by a `lastFetchedGenerationIdRef`. It prevents re-fetch when the same generationId is seen again.
  - The effect only fetches when all are true: `isOpen`, activeTab is `pricing`, correct `variant` for viewport, and `generationId !== lastFetchedGenerationIdRef.current`.
  - The effect clears `generationData` only when the id changes (so reopening with the same id doesn’t force-clear or refetch).
- Store close/open flow: `stores/useUIStore.ts`
  - Closing via `closeDetailsSidebar()` sets `selectedDetailModel` to `null` and `selectedGenerationId` to `undefined`.
  - Reopening via `showModelDetails(model, 'pricing', generationId)` restores props, but the sidebar effect considers this the “same” generationId as before, so it will not call `/api/generation/<id>` again.
- Mounting: there are two sidebars rendered simultaneously (desktop and mobile variants) in `components/chat/ChatInterface.tsx`; only the variant matching the viewport will fetch due to `shouldAllowFetch`. On mobile, closing the modal can unmount or blank the content path (model becomes null), so local component state like `generationData` may no longer be visible; on reopen, since no new fetch happens (same id), the UI shows no data.

Root cause in short:

- Reopen with the same generationId does not trigger a new fetch due to the `lastFetchedGenerationIdRef` guard, and the previous `generationData` may be unavailable/hidden after close. No cache means we have nothing to show and we also don’t re-fetch.

Scope of impact:

- Affects the pricing tab in `ModelDetailsSidebar` when reopening for the same generationId (especially on mobile variant). Desktop is less affected but still bound by the same guard.

## Acceptance Criteria

- [ ] When clicking a generationId link, pricing tab shows data either from cache or fresh fetch.
- [ ] Closing and reopening the sidebar on the same generationId immediately shows data (no extra network call if cached).
- [ ] If no cached data exists, the component fetches and then caches the result.
- [ ] Cached entry is keyed by generationId and contains the API response payload needed by the UI.
- [ ] Cache is cleared on user sign-out.
- [ ] QA can verify that repeated opens for the same generationId do not spam the API.

## Proposed Solution

Introduce a small generation-details cache backed by `localStorage` with a namespaced key and simple LRU/TTL strategy.

- Use a single key, e.g. `generation-cache-v1`, storing a map `{ [generationId]: { data: GenerationData, cachedAt: number } }`.
- On open/pricing-tab activation, read cache first:
  - If hit and entry is fresh: set `generationData` from cache and skip fetch.
  - If miss or expired: fetch `/api/generation/<id>`, then write to cache and update state.
- Clear the cache on SIGNED_OUT event and on explicit `signOut()` calls.
- Keep existing fetch guard, but enhance the effect so that a cache hit restores UI even when `lastFetchedGenerationIdRef` blocks a new fetch.

Notes:

- Consider a small TTL (e.g., 24h) to avoid very stale data. Optional eject path: a manual refresh control could be added later.
- Keep cache size bounded (e.g., last 100 entries) to avoid unbounded growth.

## Implementation Plan (Phased)

### Phase 1 – Cache + UI Wiring

- [ ] Create `lib/utils/generationCache.ts` with helpers:
  - `getGenerationFromCache(id): GenerationData | null`
  - `setGenerationInCache(id, data): void`
  - `clearGenerationCache(): void`
  - Optional: `prune(limit = 100, ttlMs = 24*60*60*1000)`
- [ ] Update `ModelDetailsSidebar` effect:
  - Before fetch, attempt cache read; if found and valid, call `setGenerationData(cached)` and skip network.
  - On successful fetch, save to cache.
  - Do not clear `generationData` when reopening with the same id; instead rely on cache or existing state to render immediately.
- [ ] Minimal console debug logs guarded by development checks to aid QA.

User Test Steps (Phase 1):

1. Click a generationId link to open the sidebar (pricing tab). Verify data loads and is visible.
2. Close the sidebar, click the same generationId again. Verify data appears instantly and no new network call is made for that id.
3. Click a different generationId. Verify it fetches once and caches, and then behaves like step 2.

### Phase 2 – Auth Sign-out Cache Clearing

- [ ] In `contexts/AuthContext.tsx`, on `SIGNED_OUT` within `onAuthStateChange` and inside `signOut()`, call `clearGenerationCache()`.
- [ ] Confirm no other localStorage keys are inadvertently removed.

User Test Steps (Phase 2):

1. Open a generationId and ensure it’s cached by repeating open/close successfully.
2. Sign out via the user menu.
3. Sign back in and open the same generationId. Verify a fresh fetch occurs (prior cache cleared).

### Phase 3 – Optional Resilience Improvements

- [ ] If desired, relax `lastFetchedGenerationIdRef` so that when `generationData` is empty and the sidebar is opening on pricing tab with the same id, a fetch is allowed. The cache still prevents unnecessary calls.
- [ ] Add an optional “Refresh” button in the pricing tab for manual refetch.

## Risks & Edge Cases

- Dual sidebar instances (desktop and mobile) are mounted; ensure only the active variant uses the cache/fetch path (existing `variant` check already enforces this).
- Very recent generations may not be available yet via API (current error path handles 404). Cached entries should be updated if a later attempt succeeds.
- Storage quota: keep cache map bounded and prune oldest entries.

## Clarifying Questions

1. Is a 24-hour TTL acceptable for generation detail cache, or should it be session-scoped only (cleared on tab close)?

- 24 hours is acceptable.

2. Do we want a small LRU limit (e.g., 100 entries) to bound storage, and if so, what limit?

- 30 will be enough.

3. Should we surface a manual “Refresh” button for the pricing tab to bypass cache on demand?

- Not required.

4. Any privacy constraints requiring encryption or avoiding localStorage for sensitive fields (e.g., `upstream_id`)?

- No, the data is not sensitive and can be stored in localStorage as is.

5. Should cache be per-user or global? If per-user, we’ll namespace the key with a hash of the authenticated user id.

- Global, annoymous user can retrieve generatiion data as well, so there is no good way to identify them
