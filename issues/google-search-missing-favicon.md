# Google Search results missing brand favicon

## Summary
- The brand favicon does not appear beside search results for the site.
- Google Search looks for a raster `/favicon.ico` (or another supported raster icon) at the site root, but the app only publishes SVG favicon variants.

## Evidence
- `src/app/layout.tsx` registers only SVG favicon assets (`/favicon.svg`, `/favicon-16x16.svg`, `/favicon-32x32.svg`).
- The `public/` directory does not contain a `/favicon.ico` or PNG fallback, so Google cannot fetch a supported raster favicon from the root domain.

## Impact
- Search result entries fall back to a generic globe icon instead of the brand artwork, reducing brand recognition in search listings.

## Proposed Fix
- Generate a raster favicon (ICO or PNG) and place it in `public/favicon.ico` (and optionally supply PNG sizes).
- Reference the raster icon in the Next.js metadata so crawlers that ignore SVG favicons can pick it up.

