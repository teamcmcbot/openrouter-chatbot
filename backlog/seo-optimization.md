# SEO Optimization Plan

## Phase 1 – Baseline & Tooling

- [x] Audit existing landing page and models directory content, headings, and metadata; capture current titles, descriptions, and canonical URLs.
- [x] Instrument Lighthouse CI (local run acceptable) and document baseline Core Web Vitals for desktop and mobile.
- [x] Set up Google Search Console property and submit the current sitemap (or note absence) for future tracking.
- [x] Outline initial keyword targets for landing page and models directory based on product positioning (no analytics yet).

**Summary**

- Establishes measurement and governance foundations before shipping changes.
- Produces baseline metrics and keyword briefs the team can compare against later.

**Baseline Lighthouse Findings**

- **Desktop (Chrome 140, simulated desktop)** — Performance 91, Accessibility 88, Best Practices 100, SEO 90. Core vitals: FCP 0.2 s, LCP 0.9 s, TBT 240 ms, CLS 0, INP 3.3 s.
- **Mobile (Chrome 140, simulated mobile)** — Performance 72, Accessibility 88, Best Practices 100, SEO 90. Core vitals: FCP 0.9 s, LCP 2.4 s, TBT 1.5 s, CLS 0, INP 18.8 s.
- **Top follow-ups** — Reduce main-thread work/unused JavaScript to cut TBT/TTI (especially mobile), fix color contrast & heading order & accessible-name gaps, and replace the missing meta description plus restrictive viewport settings flagged by SEO audits.

**User Test Steps**

1. Review the collected audits and confirm all baseline artifacts are stored in the repo (e.g., `/docs/seo/`).
2. Ensure Lighthouse results are reproducible via documented command or saved report.
3. Confirm Search Console access is functioning and sitemap submission status is recorded.

- [x] **User Verification:** Confirm baseline artifacts, Lighthouse instructions, and Search Console status are complete and accessible.

## Phase 2 – Landing Page Enhancements

- [x] Implement descriptive `<title>`, meta description, Open Graph, and Twitter card metadata via Next.js `metadata` API for the landing page route.
- [x] Add structured data (`Organization` + `Product`) using JSON-LD, capturing key attributes like name, description, and primary features.
- [x] Improve on-page copy with targeted headings, FAQ section, and internal links to docs and models directory, respecting brand voice.
- [x] Optimize hero media and critical images with Next.js Image component, descriptive alt text, and responsive sizing to reduce LCP.

**Summary**

- Delivers polished metadata and content improvements for the highest-priority entry point.
- Aligns landing page copy with identified keywords while reinforcing internal navigation.

**User Test Steps**

1. Load the landing page and view source to verify meta tags and JSON-LD markup render server-side.
2. Run Lighthouse for the landing page in mobile mode to confirm LCP/FID remain within target (document any regressions).
3. Navigate through updated content and confirm new internal links resolve correctly.

- [ ] **User Verification:** Validate landing page metadata, structured data, performance, and content updates look correct in production preview.

## Phase 3 – Models Directory Optimization

- [x] Introduce per-model metadata (title, description, canonical) driven by model attributes; ensure clean fallback for missing data.
- [x] Implement `FAQPage` or `ItemList` structured data to describe model listings and key differentiators.
- [ ] Create contextual filters or comparison tables with crawlable HTML text (avoid client-only rendering) to highlight search-friendly terms.
- [ ] Ensure pagination or load-more patterns expose crawlable URLs (e.g., query params or static paths) and update sitemap accordingly.

**Summary**

- Elevates the models directory to rank for long-tail model queries and improves discoverability of individual model pages.
- Guarantees search engines can crawl all listings with meaningful metadata.

**User Test Steps**

1. Inspect generated metadata for multiple models via View Source to confirm SSR output.
2. Validate structured data using Google Rich Results Test against staging URLs.
3. Traverse pagination/filter URLs to ensure they respond with 200 status and proper canonical tags.

- [ ] **User Verification:** Confirm models directory renders crawlable metadata, structured data validates, and navigation remains SEO-friendly.

## Phase 4 – Technical Hygiene & Monitoring

- [ ] Generate and automate `sitemap.xml` updates for landing page, models directory pages, and key docs.
- [ ] Update or create `robots.txt` to allow priority routes while blocking admin/private paths.
- [ ] Add automated Lighthouse CI (or equivalent) to the pipeline with budget thresholds for LCP/CLS interaction delays.
- [ ] Schedule quarterly SEO review rituals capturing Search Console insights and backlog grooming.

**Summary**

- Locks in technical scaffolding to keep the site crawlable and performance-sensitive long term.
- Creates repeatable monitoring to catch regressions before launch.

**User Test Steps**

1. Verify the sitemap includes landing, models, and docs URLs and is reachable at `/sitemap.xml`.
2. Confirm `robots.txt` is accessible and rules match intended visibility.
3. Trigger the automated Lighthouse workflow to ensure it runs and reports scores.

- [ ] **User Verification:** Confirm sitemap/robots updates deploy correctly and monitoring automation reports as expected.

## Final Tasks

- [ ] Integrate completed learnings and implementation notes into `/docs/seo/readme.md` (or create the directory if absent).
- [ ] Review open verification checkboxes and ensure each phase has user sign-off before closing the backlog item.
