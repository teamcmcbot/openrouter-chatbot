# Lighthouse Baseline Instructions

Phase 1 requires repeatable baseline metrics for both desktop and mobile experiences. We have **not** committed a report yet—run Lighthouse locally and record the metrics below.

## 1. Preferred Workflow (Chrome DevTools)

1. Launch the site using the environment you want to audit (staging or local). For local development run `npm run dev`, then open the site at `http://localhost:3000`.
2. Open Chrome DevTools → **Lighthouse** tab.
3. Choose the device type:
   - **Mobile** (emulated Moto G Power)
   - **Desktop**
4. Enable the Lighthouse categories: **Performance**, **Accessibility**, **Best Practices**, **SEO**.
5. Run each device mode separately and export the report (`.html`).
6. Save the exported files under `docs/seo/baseline/reports/` (create the folder if it doesn’t exist) using the naming pattern `lighthouse-<route>-<device>-<yyyymmdd>.html`.

## 2. CLI Workflow (scriptable)

For automated checks or reproducibility outside the browser, install Lighthouse CLI globally or via `npx`.

```bash
npx lighthouse "${NEXT_PUBLIC_APP_URL:-http://localhost:3000}/" \
  --preset=lr-mobile \
  --output=json \
  --output-path=./docs/seo/baseline/reports/lighthouse-root-mobile.json

npx lighthouse "${NEXT_PUBLIC_APP_URL:-http://localhost:3000}/models" \
  --preset=desktop \
  --output=json \
  --output-path=./docs/seo/baseline/reports/lighthouse-models-desktop.json
```

- Replace `--preset` with `desktop` or `lr-mobile` as needed.
- Add `--view` if you want a browser window to open after the run.
- Commit the JSON/HTML artifacts once the baseline is captured.

## 3. Record Baseline Metrics

Capture both desktop and mobile metrics for the landing page (`/`) and models directory (`/models`). Fill in the table below after your run.

| Route     | Device  | Performance | Accessibility | Best Practices | SEO   | LCP   | CLS   | INP   |
| --------- | ------- | ----------- | ------------- | -------------- | ----- | ----- | ----- | ----- |
| `/`       | Mobile  | _tbd_       | _tbd_         | _tbd_          | _tbd_ | _tbd_ | _tbd_ | _tbd_ |
| `/`       | Desktop | _tbd_       | _tbd_         | _tbd_          | _tbd_ | _tbd_ | _tbd_ | _tbd_ |
| `/models` | Mobile  | _tbd_       | _tbd_         | _tbd_          | _tbd_ | _tbd_ | _tbd_ | _tbd_ |
| `/models` | Desktop | _tbd_       | _tbd_         | _tbd_          | _tbd_ | _tbd_ | _tbd_ | _tbd_ |

### Notes & Environmental Context

- Document the **Lighthouse version**, Chrome version, and date of the run.
- If testing against staging, include the exact URL and build SHA.
- Note any blocking issues (e.g., requires login, rate limiting) so Phase 2+ teams can reproduce.
