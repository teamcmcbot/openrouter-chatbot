# Models Page Performance Optimization

**Date:** 2025-09-30
**Author:** GitHub Copilot (analysis-only)
**Page:** `/models`
**Lighthouse (mobile) snapshot:** Performance 36, LCP 18.5 s, TBT 2.09 s, Accessibility 88, Best Practices 100, SEO 100.

## Summary

- Initial render ships the full catalog of 300+ models to the client, resulting in a very large serialized payload and slow hydration.
- The client-side table renders every model row up front without virtualization, creating thousands of DOM nodes and heavy main-thread work.
- Per-row computations (price formatting, capability checks, grouping) are repeated during hydration and on each filter update, compounding CPU cost.
- State synchronization effects on mount trigger redundant renders, especially under React 18 Strict Mode.
- Metadata generation and popular-link counts re-filter the entire catalog server-side, increasing cold-start latency.

## Key Observations

1. **Full catalog hydration**  
   `ModelsPage` fetches `catalog.models` server-side and passes the entire array through a Suspense boundary to `ModelCatalogPageClient`. The payload includes long descriptions, pricing strings, modality arrays, and timestamps. On mobile hardware this yields multiple hundreds of kilobytes of JSON, delaying meaningful paint and dominating LCP.

2. **Monolithic DOM tree**  
   `ModelCatalogTable` renders hundreds of `<tr>` rows with badges, tooltips, and nested spans for every capability. Without windowing, React must build and hydrate the entire tree before the table appears. The table becomes the LCP element, but it cannot paint until hydration finishes, pushing LCP to 18.5 s.

3. **Expensive synchronous loops**  
   Filtering and grouping logic (`filteredModels`, `groupedModels`, `featurePredicates`) iterate across the full dataset multiple times per render. Helper functions (`formatTokenPrice`, `formatScaledPrice`, `isModelMultimodal`, etc.) parse numbers and allocate strings for every row on each pass. This keeps the main thread busy for ~2 s, explaining the 2090 ms TBT.

4. **Redundant state sync**  
   A `useEffect` block unconditionally resets feature/provider/search state from props, even when nothing changed. In Strict Mode this runs twice, causing back-to-back re-renders and additional hydrate work.

5. **Duplicate server filtering**  
   `generateMetadata` and `FilterSummary` both filter the catalog to compute counts. Cache hits mitigate this, but cold requests do extra work before HTML streaming begins.

## Recommended Plan

### Phase 1 – Measurement & Data Slimming

- Instrument catalog payload size and hydration cost (Chrome Performance profiles, `performance.mark`).
- Create a server-side DTO that drops unused fields, trims descriptions, and precomputes formatted price strings before sending to the client.
- Success criteria: reduce serialized payload size by ≥50% and improve mobile LCP to <10 s.

### Phase 2 – Rendering Strategy

- Introduce virtualization or pagination for `ModelCatalogTable` (e.g., `@tanstack/react-virtual`), rendering only visible rows.
- Break the table into smaller client components or lazy chunks; avoid hydrating all tiers simultaneously.
- Success criteria: keep initial DOM node count under 1,000 and cut TBT <600 ms.

### Phase 3 – Deferred Hydration & UX Polish

- Consider server-rendering a lightweight summary (top N rows or tier totals) and dynamically import the interactive table client-side with `next/dynamic` and idle-time hydration.
- Guard `useEffect` syncs with equality checks to prevent redundant renders.
- Memoize expensive per-model computations so they run once per dataset change.
- Success criteria: mobile Lighthouse LCP <3 s, TBT <300 ms, no regression in filter UX.

### Phase 4 – Server Efficiency & Maintenance

- Share filter computations between metadata and page render to avoid duplicate catalog scans.
- Precompute popular-filter counts during catalog build or cache them alongside the payload.
- Document new architecture and add regression tests / profiling scripts so performance remains within targets.

## Next Steps

- Align on which Phase 1 & 2 items should ship first, then sequence implementation tickets.
- After each phase, rerun Lighthouse mobile, record bundle sizes (`next build --analyze`), and update this backlog entry with measured improvements.
