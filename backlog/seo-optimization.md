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
- [x] Create contextual filters or comparison tables with crawlable HTML text (avoid client-only rendering) to highlight search-friendly terms.
- [x] Ensure pagination or load-more patterns expose crawlable URLs (e.g., query params or static paths) and update sitemap accordingly.

**Summary**

- Elevates the models directory to rank for long-tail model queries and improves discoverability of individual model pages.
- Guarantees search engines can crawl all listings with meaningful metadata.

**Implementation Notes**

- No traditional pagination needed - models page shows all results with collapsable sections (already SEO-friendly)
- Implemented dynamic sitemap generation with 60 total URLs: 3 static routes + 48 model detail pages + 9 popular filter combinations
- Added smart canonical URL logic: popular single filters keep their URLs, complex filters canonicalize to base `/models`
- Proper URL encoding for model IDs with slashes (e.g., `anthropic%2Fclaude-sonnet-4.5`)
- XML validation confirmed - ampersands properly escaped in sitemap
- See detailed implementation notes in `/docs/seo/crawlable-urls-sitemap-implementation.md`

**User Test Steps**

1. Inspect generated metadata for multiple models via View Source to confirm SSR output.
2. Validate structured data using Google Rich Results Test against staging URLs.
3. Traverse pagination/filter URLs to ensure they respond with 200 status and proper canonical tags.
4. **NEW:** Visit `/sitemap.xml` and verify all 60 URLs are present (3 static + 48 models + 9 filters).
5. **NEW:** Check canonical tags on filtered views: single filters should keep their URL, complex filters should point to `/models`.
6. **NEW:** Verify model detail pages with slashes in URL load correctly (e.g., `/models/google%2Fgemini-2.5-flash-lite`).

- [ ] **User Verification:** Confirm models directory renders crawlable metadata, structured data validates, navigation remains SEO-friendly, and sitemap includes all models and popular filters with proper canonical URLs.

## Phase 4 – Technical Hygiene & Monitoring

- [x] Generate and automate `sitemap.xml` updates for landing page, models directory pages, and key docs.
- [x] Update or create `robots.txt` to allow priority routes while blocking admin/private paths.
- [x] Add automated Lighthouse CI (or equivalent) to the pipeline with budget thresholds for LCP/CLS interaction delays.
- [x] Schedule quarterly SEO review rituals capturing Search Console insights and backlog grooming.

**Summary**

- Locks in technical scaffolding to keep the site crawlable and performance-sensitive long term.
- Creates repeatable monitoring to catch regressions before launch.

**Implementation Notes**

- Dynamic `robots.txt` created at `/src/app/robots.txt/route.ts`:
  - Blocks: `/admin/*`, `/api/admin/*`, `/api/internal/*`, `/api/cron/*`
  - Allows: `/models`, `/chat`, `/`, all public routes
  - References sitemap at `${baseUrl}/sitemap.xml`
- Lighthouse CI configured with `.lighthouserc.json`:
  - Tests 3 URLs (/, /models, /chat) with 3 runs each
  - Performance budgets: LCP < 2000ms, CLS < 0.1, TBT < 300ms
  - Score assertions: Performance ≥85%, Accessibility ≥85%, SEO ≥90%
- GitHub Actions workflow at `.github/workflows/lighthouse.yml`:
  - Runs on PRs and pushes to main branch
  - Builds Next.js app, starts server, runs Lighthouse CI
  - Posts results as PR comments with scores
  - Uploads reports as artifacts (30-day retention)
- Quarterly review schedule documented in `/docs/seo/quarterly-review-schedule.md`:
  - Monthly: Performance monitoring, quick wins
  - Quarterly: Search Console deep dive, content audit, technical SEO
  - Annual: Comprehensive strategy review
  - Includes templates, automation tracking, escalation paths

**User Test Steps**

1. Visit `/robots.txt` in browser to confirm it loads and includes sitemap reference.
2. Review `.lighthouserc.json` config to verify budgets match requirements.
3. Check `.github/workflows/lighthouse.yml` syntax is valid (GitHub Actions).
4. Confirm Lighthouse workflow triggers on PR/push (test by creating a PR or wait for next push).
5. Review quarterly schedule at `/docs/seo/quarterly-review-schedule.md` for completeness.

- [ ] **User Verification:** Confirm robots.txt is accessible, Lighthouse config is correct, GitHub Actions workflow is valid, and quarterly review schedule is comprehensive.

## Final Tasks

- [ ] Integrate completed learnings and implementation notes into `/docs/seo/readme.md` (or create the directory if absent).
- [ ] Review open verification checkboxes and ensure each phase has user sign-off before closing the backlog item.
