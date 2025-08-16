# Toaster (react-hot-toast) – Header-Centered Positioning

## Overview

This app uses `react-hot-toast` for notifications. The global Toaster is configured to render toasts inside and vertically centered within the chat page header (`#chat-header`). This avoids hard-coded offsets and keeps toasts aligned even when the header’s height changes dynamically.

- Component: `components/ui/Toaster.tsx`
- Library: `react-hot-toast`
- Position: `top-center` (horizontal centering by library)
- Vertical placement: computed dynamically based on `#chat-header` and the current toast’s height

## How it works

1. Header measurement

- Finds `#chat-header` and reads its `getBoundingClientRect()` each time layout may change.
- Tracks changes via:
  - `ResizeObserver` on the header element
  - `scroll` and `resize` window events (passive where relevant)

2. Toast measurement

- Queries the Toaster container (`.app-toaster`) and inspects the first visible child toast.
- Measures the toast height with `ResizeObserver` and reattaches when the first toast changes (`MutationObserver`).

3. Top calculation (no transforms)

- If toast height is known: `top = headerRect.top + (headerRect.height - toastHeight) / 2` (clamped to keep non-negative offset within the header)
- Fallback when toast height is unknown: `top = headerRect.top + headerRect.height / 2`
- If `#chat-header` is missing (non-chat pages), falls back to a small default offset (`4.8rem`).

4. Layering and theme

- Adds `z-index: 60` to keep the toast above the header UI.
- Detects dark mode via `documentElement.classList.contains('dark')` and `prefers-color-scheme: dark`.

## Key decisions and caveats

- No container transforms: Avoids regressions where toasts could be shifted off-screen. We rely on `react-hot-toast` for horizontal centering and only set `top` in `containerStyle`.
- First visible toast wins: If multiple toasts are shown simultaneously, the top value is computed from the first one. Consider queueing toasts or limiting concurrency for perfect visual centering during bursts.
- Non-chat pages: Without `#chat-header`, a default top offset is used so toasts still appear in a reasonable place.
- Mobile safe areas: Works with viewport coordinates. If you notice clipping with device safe areas, add a small additive offset when `env(safe-area-inset-top)` is present.

## Usage

- The Toaster is mounted globally (App Router layout). Trigger toasts anywhere in the app:

```ts
import { toast } from "react-hot-toast";

toast.success("Saved!");
toast.error("Something went wrong");
```

- On the chat page, toasts will appear centered in the header. On other pages, they’ll use the default fallback top.

## Troubleshooting

- Toast appears off-screen or behind header

  - Ensure no custom CSS adds transforms to `.app-toaster` or its ancestors
  - Confirm `z-index: 60` isn’t overridden by page-specific styles
  - Verify `#chat-header` exists on the page where you expect header-centering

- Toast not perfectly centered
  - Multiple concurrent toasts can change height dynamics; queue or limit simultaneous toasts
  - Long messages may wrap on resize; centering updates automatically, but transient shifts can occur

## Test steps

1. On `/chat`, trigger a success toast and confirm it’s vertically centered within `#chat-header`.
2. Change header height (e.g., open a dropdown), then trigger another toast; it should remain centered.
3. Resize the window, toggle theme, and re-trigger; centering and contrast should remain correct.

## Change log

- 2025-08-17: Implemented dynamic header-centered vertical placement and hardening around observers/z-index.
