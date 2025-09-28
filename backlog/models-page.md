# Public Models Catalog Page Plan

## Phase 1 – Data Retrieval & Caching

- [x] Confirm `model_access` query shape and extend data adapter to surface description, pricing, context length, modalities, and tier flags.
- [x] Implement server-side fetch utility (Supabase REST/RLS-aware) for active models (`status = 'active'`) with optional Redis cache layer (key: `model-access:active`, TTL 5–10 minutes + manual bust hook).
- [x] Define provider taxonomy (OpenAI, Google, Anthropic, xAI, Z.AI, Moonshot AI, Mistral, Other) and map models based on ID prefix; persist mapping alongside fetched data.
- [x] Establish deterministic sorting: bucket by tier access (free→pro→enterprise) then alphabetize per bucket; expose helper for reuse in UI and tests.
- [x] Draft TypeScript contracts covering data source, cached payload, and UI consumption (e.g., `ModelCatalogEntry`).

Summary once complete: data utilities produce a sorted, provider-tagged model list with caching hooks.
Manual test instructions: run the fetch helper locally, inspect cached payload via Redis CLI (if enabled), and confirm ordering/tier flags using a known active model set.

- [x] **User verification: Phase 1 data fetching and caching validated.**

## Phase 2 – UI & Interaction Layer

- [x] Refactor `components/ui/ModelComparison.tsx` into a reusable catalog table component supporting tier/provider/search filters, expandable detail rows, and responsive layout tweaks (preserve badges, extend to show pricing/modalities inline).
- [x] Create `/src/app/models/page.tsx` as a public route (no auth guard) that uses the new data helper, handles streaming/SSG as appropriate, and renders tier sections with headings and counts.
- [x] Implement search + multi-select filters (tier chips, provider pills); ensure URL query parameters (`tier`, `provider`, `q`) sync bidirectionally for deep linking.
- [x] Add highlight/scroll behavior when `tier` param is present (smooth scroll to section, accentuate heading, optionally display hint toast).
- [x] Ensure empty/error states, skeleton loading, and accessibility (ARIA, keyboard focus) are covered.

Summary once complete: `/models` page renders interactive catalog with filtering, deep-link highlighting, and accessible UX.
Manual test instructions: visit `/models` in desktop/mobile widths, exercise search + filters + tier param deep links, verify smooth scrolling and that unauthenticated sessions can view the page.

- [x] **User verification: Phase 2 UI and UX validated.**

## Phase 3 – Integration & Quality Gates

- [x] Update landing page pricing section CTA to link toward `/models?tier={tier}` and confirm analytics tracking (if any) still fires.
- [x] Add route to sitemap/SEO metadata and confirm for static export (OpenGraph/structured data optional brainstorming).
- [x] Write unit tests for sorting helper, provider classification, and filter logic; add component tests covering search + tier highlighting.
- [x] Document Redis caching strategy & invalidation in code comments and monitor logs for request volume (feature flag optional).

Summary once complete: landing page links into `/models`, automated coverage protects behavior, and metadata/logging are aligned.
Manual test instructions: click new landing page links for each tier, ensure deep link UX, run `npm test -- models` (or matching pattern) to confirm new tests pass, inspect logs for caching hits/misses.

- [ ] **User verification: Phase 3 integration and QA validated.**

## Phase 4 – Documentation & Rollout

- [x] Update `/docs/feature-matrix.md` (or create new doc) to describe models catalog UX, filters, caching, and deep-link behavior.
- [x] Provide rollout notes (feature flag toggle, cache warm-up instructions) in `/docs/updates/` if needed.
- [ ] Coordinate announcement copy with marketing/landing page stakeholders (optional but recommended).

Summary once complete: documentation and rollout guidance reflect the new models catalog feature. Feature matrix now includes catalog capabilities, and rollout notes live in `docs/updates/models-catalog-rollout.md`.
Manual test instructions: review updated docs for accuracy, confirm links/screenshots reference the final UI.

- [ ] **User verification: Phase 4 documentation and rollout guidance approved.**
