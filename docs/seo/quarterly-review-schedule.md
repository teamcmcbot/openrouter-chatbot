# SEO Quarterly Review Schedule

## Overview

This document defines the recurring SEO maintenance and monitoring schedule to ensure the OpenRouter Chatbot maintains optimal search visibility and performance.

## Review Cadence

### Monthly (1st of every month)

**Performance Monitoring Review**

- [ ] Check Lighthouse CI trends in GitHub Actions
- [ ] Review Core Web Vitals in production (LCP, CLS, TBT)
- [ ] Verify performance budgets are being enforced
- [ ] Check for any failing Lighthouse assertions

**Quick Wins**

- [ ] Scan for new 404 errors in logs
- [ ] Verify robots.txt and sitemap.xml are accessible
- [ ] Check model catalog updates are reflected in sitemap

---

### Quarterly (Every 3 months)

**Google Search Console Deep Dive**

- [ ] Review top 100 queries and click-through rates
- [ ] Identify pages with declining impressions/clicks
- [ ] Check for new crawl errors or index coverage issues
- [ ] Review mobile usability reports
- [ ] Verify structured data (if implemented) has no errors

**Content & Metadata Audit**

- [ ] Review title tags and meta descriptions for top 20 pages
- [ ] Check for duplicate or missing meta descriptions
- [ ] Verify canonical URLs are correctly implemented
- [ ] Test social media preview cards (Open Graph, Twitter)

**Technical SEO Audit**

- [ ] Run full sitemap validation (`xmllint --noout /sitemap.xml`)
- [ ] Verify all models are being indexed (check sitemap count vs DB count)
- [ ] Test popular filter URLs are crawlable and indexed
- [ ] Check for broken internal links (use crawler tool)
- [ ] Verify HTTPS is enforced across all pages

**Competitive Analysis**

- [ ] Research competitor model listing pages
- [ ] Identify new SEO opportunities or threats
- [ ] Review industry best practices for AI model directories

---

### Annual (Once per year)

**Comprehensive SEO Strategy Review**

- [ ] Evaluate overall organic traffic growth vs goals
- [ ] Assess keyword rankings for target terms
- [ ] Review and update keyword targeting strategy
- [ ] Audit entire site architecture for SEO improvements
- [ ] Consider implementing new structured data (e.g., FAQPage, Dataset)
- [ ] Evaluate international SEO opportunities (hreflang)
- [ ] Plan next year's SEO roadmap

---

## Search Console Access

**URL**: https://search.google.com/search-console

**Team Access**:

- Ensure at least 2 team members have owner access
- Document access recovery process

**Integration**:

- Consider integrating Search Console API for automated reporting
- Set up email alerts for critical issues (manual actions, security issues)

---

## Performance Monitoring Dashboard

### Lighthouse CI

**Location**: GitHub Actions → Lighthouse CI workflow

- View historical reports in workflow artifacts (30-day retention)
- Track trends: Performance scores, LCP, CLS, TBT over time
- Alert on: Any score dropping below budget thresholds

**Thresholds** (from `.lighthouserc.json`):

- Performance Score: ≥ 85
- Accessibility Score: ≥ 85
- SEO Score: ≥ 90
- LCP: < 2000ms
- CLS: < 0.1
- TBT: < 300ms

### Core Web Vitals (Production)

**Tools**:

- Google Search Console → Core Web Vitals report
- PageSpeed Insights: https://pagespeed.web.dev/
- Chrome User Experience Report (CrUX)

**Target Metrics** (75th percentile):

- LCP: < 2.5 seconds
- FID/INP: < 200ms
- CLS: < 0.1

---

## Backlog Grooming Process

**Frequency**: Quarterly (aligned with quarterly review)

**Process**:

1. Review `/backlog/seo-optimization.md` for pending items
2. Prioritize based on:
   - Search Console insights (high impressions, low CTR)
   - Lighthouse CI trends (degrading scores)
   - User feedback or support tickets
   - Competitive analysis findings
3. Move high-priority items to `/issues/` with detailed specs
4. Archive completed items to `/docs/seo/archive/`
5. Update phase completion status in backlog

**Prioritization Criteria**:

- **P0**: Critical issues affecting indexing or crawlability
- **P1**: High-impact opportunities (top pages, high-volume queries)
- **P2**: Medium-impact improvements (UX, technical debt)
- **P3**: Low-impact enhancements (future considerations)

---

## Checklist Templates

### Monthly Performance Review Template

```markdown
# Monthly SEO Performance Review - [Month YYYY]

## Lighthouse CI Trends

- Average Performance Score: [XX]
- Average LCP: [XXms]
- Average CLS: [X.XX]
- Failing Assertions: [None / List issues]

## Quick Checks

- [ ] Sitemap accessible at /sitemap.xml
- [ ] Robots.txt accessible at /robots.txt
- [ ] No new 404 errors in logs
- [ ] Model count in sitemap matches DB: [XX models]

## Action Items

- [Any issues discovered]
```

### Quarterly Deep Dive Template

```markdown
# Quarterly SEO Review - [Q# YYYY]

## Search Console Metrics (vs previous quarter)

- Total Clicks: [XXX] ([+/-XX%])
- Total Impressions: [XXX] ([+/-XX%])
- Average CTR: [X.X%] ([+/-X.X%])
- Average Position: [XX] ([+/-X])

## Top 10 Queries (by impressions)

1. [Query] - Impressions: XXX, Clicks: XX, CTR: X.X%, Position: XX
2. ...

## Issues Discovered

- Index Coverage: [XX errors, XX warnings]
- Mobile Usability: [XX issues]
- Core Web Vitals: [X% good URLs]

## Content Audit Findings

- Duplicate meta descriptions: [X pages]
- Missing meta descriptions: [X pages]
- Broken internal links: [X links]

## Action Items

1. [Priority] [Task description] - Assigned to: [Name]
2. ...

## Next Quarter Priorities

- [Priority 1]
- [Priority 2]
```

---

## Automation Opportunities

**Current Automations**:

- ✅ Lighthouse CI runs on every PR and main branch push
- ✅ Sitemap dynamically updates with new models (1-hour ISR)
- ✅ Performance budgets enforced in CI/CD pipeline

**Future Automations to Consider**:

- [ ] Automated 404 error monitoring and alerting
- [ ] Weekly sitemap validation in CI
- [ ] Search Console API integration for automated reporting
- [ ] Broken link checker in CI pipeline
- [ ] Meta description length validation in CI

---

## Escalation Path

**Performance Degradation**:

1. Lighthouse score drops below budget → Investigate in GitHub Actions logs
2. Core Web Vitals poor in Search Console → Review Vercel Analytics, check recent deploys
3. Persistent issues → Create GitHub issue with `/specs/` documentation

**Indexing Issues**:

1. Coverage errors in Search Console → Check robots.txt, sitemap, URL structure
2. Manual actions → Immediate remediation required, notify team
3. Deindexing → Critical escalation, review recent code changes

**Contact**:

- Primary: [Team Lead]
- Secondary: [DevOps Lead]
- SEO Consultant (if engaged): [Contact]

---

## Version History

- **v1.0** (2025-01-XX): Initial quarterly review schedule established
  - Monthly performance monitoring
  - Quarterly deep dives
  - Annual strategy review
  - Lighthouse CI integration
