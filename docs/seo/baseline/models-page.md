# Models Directory Baseline (`/models`)

## Source Files

- `src/app/models/page.tsx` – server component rendering catalog
- `components/ui/ModelCatalogPageClient.tsx` – client-side filters + list (not audited in depth yet)
- `lib/server/modelCatalog.ts` – data loader for catalog content

## Metadata Snapshot

- **`title`** → `Model Catalog | OpenRouter Chatbot`
- **`description`** → `Browse every active model in GreenBubble by subscription tier...`
- **`canonical`** → `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/models`
- **Open Graph** → title `Model Catalog`, same description, `url` and `siteName` set, no images defined
- **Twitter Card** → `summary_large_image`, title `Model Catalog`, same description (no image)
- **Structured Data** → _None_

## Above-the-Fold Content

- **`<h1>`** → `Model Catalog`
- Intro paragraph positions page as tier comparison resource.
- Supporting text linking back to landing page pricing section via `/#pricing`.

## Body & Interaction

- Catalog grid/table rendered via `ModelCatalogPageClient` inside `Suspense`.
- Filters supported through query params: `tier`, `features`, `providers`, `q`.
- `Last synced` timestamp displayed when data includes `updatedAt`.

## Notable Observations

- Metadata already leverages Next.js `Metadata` API with canonical + OG/Twitter stubs, but lacks imagery.
- Structured data (e.g., `ItemList`) absent; opportunity for Phase 3.
- Callout link to `/` pricing provides internal linking but relies on in-page anchor, not dedicated `/pricing` path.
