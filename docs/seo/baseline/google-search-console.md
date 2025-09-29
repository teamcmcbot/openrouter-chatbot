# Google Search Console Setup & Baseline

## 1. Choose Property Type

1. Visit [https://search.google.com/search-console/welcome](https://search.google.com/search-console/welcome).
2. Prefer the **Domain property** if you can add DNS records (captures all protocols/subdomains).
   - Use the root apex, e.g. `example.com`.
   - Requires a TXT record in DNS; Supabase uses Vercel DNS by default—manage records there.
3. If DNS access is blocked, use a **URL prefix property** for the exact deployment origin, e.g. `https://app.example.com/`.
   - Verification options: HTML file upload, HTML tag, Google Analytics, or Google Tag Manager.

> 💡 `NEXT_PUBLIC_APP_URL` should match the canonical production origin. Use that value when registering the property.

## 2. Verify Ownership

- **Domain property**: add the TXT record provided by Google to the DNS provider; wait for propagation and click **Verify**.
- **URL prefix**: upload the HTML verification file to `public/` (served at the root) or add the HTML meta tag to `src/app/layout.tsx` temporarily. Remove temporary tags after verification to avoid leaking verification IDs.

Record your verification method and date in the table below.

| Property | Type                  | Verification Method     | Date  | Notes |
| -------- | --------------------- | ----------------------- | ----- | ----- |
| _tbd_    | _Domain / URL Prefix_ | _TXT / HTML / GA / GTM_ | _tbd_ | _tbd_ |

## 3. Submit Sitemap

1. Inside GSC, open the property → **Sitemaps**.
2. Enter the sitemap path: `/sitemap.xml`.
3. Confirm successful fetch (status should be **Success**). If it fails, note the reason.

| Submission Date | Status | Discovered URLs | Notes |
| --------------- | ------ | --------------- | ----- |
| _tbd_           | _tbd_  | _tbd_           | _tbd_ |

## 4. Baseline Checks to Capture

- **Index Coverage** → note number of valid / excluded pages.
- **Page Experience / Core Web Vitals** → note if Google has data yet (likely “Not enough data” for new properties).
- **Mobile Usability** → confirm no errors.
- **Security / Manual Actions** → confirm "No issues detected".

Store screenshots or exported CSVs in `docs/seo/baseline/reports/` as supporting evidence:

- `gsc-coverage-<yyyymmdd>.png`
- `gsc-sitemap-status-<yyyymmdd>.png`

## 5. Access & Permissions Checklist

- Ensure the engineering and growth teams have **Owner** access for future automation.
- Add `search-console@vercel` if you plan to use Vercel’s integration.
- Document where credentials are stored (e.g., password manager entry) in the internal ops wiki.

## 6. Follow-Up Tasks

- Once the sitemap is accepted, monitor the “Submitted vs. Indexed” chart monthly.
- Schedule reminders to re-run coverage checks each Phase or after significant content releases.
