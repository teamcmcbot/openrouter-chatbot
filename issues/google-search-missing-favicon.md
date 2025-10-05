# Google Search results missing brand favicon

## Summary
- The brand favicon does not appear beside search results for the site.
- Google Search and most crawlers require a raster favicon (ICO or PNG) and ignore SVG; ensure a 48×48+ PNG and/or `/favicon.ico` is available at the root or linked via `rel="icon"`.

## Evidence
- `src/app/layout.tsx` registers only SVG favicon assets (`/favicon.svg`, `/favicon-16x16.svg`, `/favicon-32x32.svg`).
- The `public/` directory does not contain a `/favicon.ico` or PNG fallback, so Google cannot fetch a supported raster favicon from the root domain.

## Impact
- Search result entries fall back to a generic globe icon instead of the brand artwork, reducing brand recognition in search listings.

## Proposed Fix
- Generate a raster favicon (ICO or PNG) and place it in `public/favicon.ico`. Optionally, supply PNG sizes (16x16, 32x32, 48x48) in the `public/` directory.
- Reference the raster icons in the Next.js metadata so crawlers that ignore SVG favicons can pick them up. For example, in `src/app/layout.tsx`:

  ```ts
  export const metadata = {
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: 'any', type: 'image/x-icon' },
        { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
        { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
        { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' }
      ],
      apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }]
    }
  };
