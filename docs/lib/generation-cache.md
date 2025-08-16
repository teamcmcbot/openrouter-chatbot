# Generation Cache

Purpose: Persist generation details for the Model Details sidebar so reopening it (same generationId) renders instantly without refetching.

- Storage key: `openrouter-generation-cache`
- TTL: 24 hours
- Capacity: 30 entries (LRU eviction)
- Scope: Global (applies to anonymous and signed-in users)
- Clear-on-sign-out: Yes, triggered by AuthContext.

API (lib/utils/generationCache.ts):

- getGenerationFromCache(id: string): object | null
- setGenerationInCache(id: string, data: object): void
- clearGenerationCache(): void

Notes:

- Cache is read first by `ModelDetailsSidebar` when the Pricing tab is active; on hit, UI renders without a network request.
- On miss, data is fetched via `/api/generation/[id]` and then written back to the cache.
- LRU order is maintained; reads update MRU. Expired entries are pruned lazily.
- Data is not sensitive per analysis; stored as-is in localStorage.
