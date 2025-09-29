# Landing Page Baseline (`/`)

## Source Files

- `src/app/layout.tsx` (global metadata + layout shell)
- `src/app/(app)/page.tsx` (landing page content and CTA logic)

## Metadata Snapshot

- **`title`** → `process.env.BRAND_NAME || "OpenRouter Chatbot"`
- **`description`** → `"A modern chatbot powered by OpenRouter's AI models"`
- **`manifest`** → `/manifest.json`
- **Icons** → favicon SVG + 16×16 / 32×32 variants, Apple touch (`/apple-icon.png`), Android Chrome 192/512 SVGs
- **Viewport** → fixed-scale viewport (max scale 1, not user scalable)
- **Canonical URL** → _Not defined (Next.js Metadata API doesn't set a canonical URL for `/` yet)_
- **Open Graph / Twitter** → _Not configured_
- **Structured Data** → _None_

## Hero & Above-the-Fold Content

- **`<h1>`** → `Multi-model AI chat (line break) Powered by OpenRouter`
- Supporting paragraph highlights model switching: "GreenBubble is a ChatGPT alternative where you can swap between Anthropic, OpenAI, Google, and other OpenRouter models…"
- Primary CTA button: **"Start Chatting for Free"** → `/chat`
  - Secondary CTA: **"Learn More"** button scrolls to `#features`
  - Both CTAs emit `trackCtaClick` analytics events

## Feature Grid (`#features`)

- Three feature cards, each `h3` + paragraph:
  1. **"Choose your model"** – links to `/models?tier=free`
  2. **"Stay in control of costs"**
  3. **"Set the vibe"**

## Pricing Section (`#pricing`)

- **`<h2>`** → `Choose the plan that fits your team`
- Paragraph describing common inclusions
- Three pricing cards (Free, Pro, Enterprise)
  - Feature lists pulled from tier constants (`TIER_FEATURES`)
  - Usage limits displayed (requests/hour, tokens/request)
  - CTA buttons route to chat or subscription upgrade (unauthenticated upgrades redirect through sign-in)
  - "Most popular" badge on Pro tier

## Footer CTA Banner

- **`<h2>`** → `Ready to get started?`
- Paragraph encouraging sign-up
- CTA button **"Try it now - it's free!"** → `/chat`

## Notable Observations

- No per-route metadata export, so global defaults apply.
- Lack of canonical / OG / Twitter tags leaves social previews unbranded.
- Viewport disallows user zoom, which may affect accessibility.
- Pricing copy references "teams"; ensure this matches positioning in Phase 2 refresh.
