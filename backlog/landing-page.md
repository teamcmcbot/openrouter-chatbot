# Landing Page Revamp – Plan

This plan proposes a modern, informative, and conversion-focused landing page for OpenRouter Chatbot. It aligns with implemented features, tier gating, and security standards, and will showcase Subscription tiers using `docs/subscription-tier-access.md` as authoritative content.

## Decisions (locked)

- Pricing: Show actual prices on page — Pro: $5, Enterprise: $15
- Hero/Demo media: Use app screenshots and anonymized chat snippets (no live embed)
- Brand voice: Developer-centric (technical, concise)
- Demo: Screenshots only (no embedded chat sandbox)
- Analytics: Track CTA clicks for all users (anonymous and authenticated) with privacy-safe fields; include `auth` flag

## Phases

### Phase 1 – Discovery & IA

- [ ] Audit current landing page structure and content
- [ ] Identify key value propositions (privacy, speed, multi-model support, agents, Pro/Enterprise features)
- [ ] Define primary CTAs per audience: "Start chatting" (anonymous), "Sign in", "Upgrade to Pro ($5)", "Go Enterprise ($15)", "Contact Sales"
- [ ] Information architecture outline: Hero → Social proof → Features → Tiers → How it works → Security → FAQ → Footer
- [ ] KPI definition: sign-ups, upgrades, time-on-page, docs clicks (analytics enabled for anonymous and authenticated)
- [ ] User verification: Confirm IA and CTAs

### Phase 2 – Content & Copy

- [ ] Hero copy (developer-centric; headline, subhead, primary CTA)
- [ ] Features overview (3–6 cards) with concise benefits:
  - Web Search (Pro+)
  - Reasoning Mode (Enterprise only)
  - Image Attachments (Pro+)
  - Multi-model support and agents
  - Context management, chat history, and drafts
  - Secure auth, rate limits, and data handling
- [ ] Tiers section: pull accurate capabilities from `docs/subscription-tier-access.md` (no duplication)
- [ ] Pricing badges and copy: Pro $5, Enterprise $15 (note: full details in canonical doc)
- [ ] Security & Compliance: summarize auth middleware, rate limiting, audit logging with links to docs
- [ ] FAQ: pricing, model availability, limits, data retention
- [ ] Media: curate approved screenshots/anonymized chat snippets, include alt text
- [ ] User verification: Approve copy direction (tone, claims)

### Phase 3 – Design & Components

- [ ] Hero layout with product mock/screenshot (no live sandbox)
- [ ] Feature grid component reusing existing UI patterns in `components/ui/`
- [ ] Tier matrix teaser linking to the full `Subscription tier access` doc
- [ ] Inline badges/buttons reflecting gating (Pro, Enterprise) for each feature card
- [ ] CTA bar sticky on scroll for mobile
- [ ] Accessibility pass (contrast, focus states, keyboard nav)
- [ ] User verification: Review Figma/preview screenshots

### Phase 4 – Implementation

- [ ] Create `src/app/(marketing)/page.tsx` or update current landing route to new layout
- [ ] Build FeatureCards and TierTeaser components (lightweight, no business logic)
- [ ] Add DocsLink components referencing `docs/subscription-tier-access.md`
- [ ] Pull tier copy dynamically from a minimal constants source to avoid hard-coding; cross-link to doc for details
- [ ] Ensure no manual auth logic on marketing pages; keep public.
- [ ] Add telemetry for CTA clicks for all users; include `auth` flag (true/false) and avoid PII; respect app privacy settings
- [ ] Unit tests for rendering and links (see testing standards)
- [ ] User verification: Approve staging build

### Phase 5 – QA & Compliance

- [ ] Verify copy matches server-side enforcement for: Web Search, Reasoning, Image uploads
- [ ] Check links: Chat, Sign in, Upgrade, Docs, Contact
- [ ] Pricing displays correctly: Pro $5, Enterprise $15
- [ ] Performance: Lighthouse ≥ 90 mobile/desktop, images optimized
- [ ] SEO: title, meta description, OpenGraph/Twitter, sitemap inclusion
- [ ] i18n readiness (copy centralized)
- [ ] Analytics: Confirm CTA events fire for anonymous and authenticated users; `auth` flag present; no PII captured
- [ ] User verification: QA checklist approved

### Phase 6 – Launch & Docs

- [ ] Add a short "What’s new" entry in `docs/` with screenshots
- [ ] Ensure `docs/subscription-tier-access.md` remains canonical for limits
- [ ] Post-launch monitoring: CTR to signup/upgrade, bounce rate
- [ ] User verification: Sign-off to merge

## Content Contracts

- Inputs
  - Feature list and tier rules from `docs/subscription-tier-access.md`
  - Existing UI components under `components/ui/` and marketing assets in `images/`
- Outputs
  - Marketing landing page with clear CTAs and accurate gating labels
  - Links to canonical docs; no duplicated policy tables on the page
- Error modes
  - Doc moved/renamed: show a fallback copy and log a console warning
  - Image missing: hide media area gracefully
- Success criteria
  - All links valid, copy accurate, build/tests pass, a11y basic checks pass

## Tier Teaser – Single Source of Truth

Instead of duplicating tier matrices, the landing page will:

- Present a concise Pro and Enterprise teaser
- Link to `docs/subscription-tier-access.md` for full details
- Reuse exact phrasing for feature availability:
  - Web Search: Pro and Enterprise
  - Reasoning: Enterprise only
  - Image Attachments: Pro and Enterprise

## User Test Steps

1. Open the landing page in staging
2. Verify hero copy and CTA buttons render
3. Confirm Feature cards show correct Pro/Enterprise badges
4. Verify pricing appears: Pro $5, Enterprise $15
5. Click the Tier teaser → lands on `docs/subscription-tier-access.md`
6. Validate links: Sign in, Start chatting, Upgrade, Contact Sales
7. Inspect DOM for a11y: headings order, alt text on screenshots, button labels
8. With an anonymous session, trigger CTA clicks → confirm analytics events recorded with `auth: false` and no PII
9. With an authenticated session, trigger CTA clicks → confirm analytics events recorded with `auth: true`

## Open Questions

1. Brand assets: any restrictions on logo usage, color constraints, or required legal footers?
2. Do we need regional price localization or tax/VAT notes alongside flat pricing?
3. Any compliance badges (SOC2, ISO) we can display now or should we omit?
