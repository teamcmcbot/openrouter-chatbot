# Message Input — UI Enhancement Proposal

This document proposes a refreshed design for the chat composer (MessageInput) that fuses the textarea and action buttons into a single, cohesive control dock at the bottom, similar to the second screenshot shared by the user.

## Decisions from this session

- Web Search: per-message toggle inside the dock; visually lights up when ON. For now it’s a UI-only stub (no behavior change).
- Send/Stop: no Stop state for now (streaming not implemented).
- Character count: show under the dock in the status row.
- Attachment tiles: 80px on desktop, 64px on mobile.
- Gating flow: if Add is disabled, clicking opens a modal immediately, anchored near the left feature buttons; modal includes an Upgrade button that is currently a no-op.

## Goals

- Unify the text area and controls into a compact, modern dock.
- Keep two primary actions on the left: Web Search and Add files (images).
- Keep Send on the right, visually tied to the input.
- Provide clear affordances and gentle gating for tiers that don’t allow image uploads (upgrade / sign-in prompts).
- Preserve current keyboard and IME behaviors (Enter to send on desktop, tap Send on mobile; Shift+Enter for newline; composition aware).
- Maintain accessibility, responsiveness, and theme parity (light/dark).

## High-level layout

- Container: sticky at the bottom of the chat panel, full width.
- Inner composer: rounded “pill” with subtle border; textarea grows vertically up to a cap.
- Left cluster (inside input dock):
  - Web Search toggle (UI-only for now; ON state is visually highlighted)
  - Add files button (image-only for now)
- Center: expanding textarea
- Right: Send button
- Below the dock: attachment strip (thumbnails) appears when images are present; scrollable horizontally on mobile.

### ASCII wireframe (desktop)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [🔎 Web ON] [📎 Add] |  Type your message… (auto-resize)              | [➤] │
└──────────────────────────────────────────────────────────────────────────┘
             [img1] [img2: uploading…] [img3: failed • Retry]  (x to remove)
          (status row: character count • hint)
```

### ASCII wireframe (mobile)

```
┌───────────────────────────────────────────────────────────────┐
│ [🔎] [📎]  Type your message…                         [➤]      │
└───────────────────────────────────────────────────────────────┘
  [img1][img2][img3]  (horizontal scroll, 64px tiles)
  status: 42 characters • Return for new line
```

### State diagram (simplified)

```
[default]
  | type -> [hasText]
  | attach -> [hasAttachments]
  | gated attach -> [gated]
  | disable -> [disabled]

[hasText] --clear--> [default]
[hasAttachments] --remove all--> [default]
[gated] --sign in/upgrade--> [default]
[disabled] --enable--> [default]
```

## Buttons & placement

- Left side inside the dock:
  - Web Search (per-message toggle; lights up when ON; currently a no-op stub)
  - Add files (outline icon button)
- Right side inside the dock:
  - Send (filled, high-contrast). Disabled when message is empty or globally disabled. No Stop state for now.
- Hover states: subtle background tint for outline buttons, color-emphasis on Send.
- Focus state: clear ring for keyboard accessibility.

## Attachment tiles placement

- Appear directly below the dock to avoid vertical jump when typing.
- Grid on desktop (wrap) and horizontal scroll row on mobile.
- Tile sizes: 80px on desktop, 64px on mobile.
- Each tile shows: image preview, status chip (Uploading…/Failed), Retry button if failed, and a visible close button.
- Keep existing size cap (3 images). When at cap, Add button shows disabled state with tooltip.

## Gating behavior (tiers / auth)

- Clicking a disabled Add button opens a modal immediately, anchored near the left feature buttons (top/left of the dock). On small screens, fall back to a centered sheet/modal.
- Modal variants:
  - Not signed in → prompt to sign in.
  - Tier restriction → prompt to upgrade.
  - Unsupported model → prompt to choose a different model.
- Upgrade/Sign-in buttons can be wired later; for now Upgrade is a no-op, and Sign-in routes only if existing flow is available.
- Keyboard and paste: still allowed to paste images only when feature is enabled; otherwise show the same gating modal or a toast on paste.

### Detailed flows

1. Signed-out user

   - Hover/press Add → tooltip: “Please sign in to use this feature”.
   - Click Add (desktop) or tap (mobile) → modal anchored near left buttons.
     - Title: "Sign in to attach images"
     - Body: "Image uploads are available to registered users."
     - Primary: "Sign in" (routes to auth if available)
     - Secondary: "Continue without images" (dismiss)
   - Paste image → toast with same message + "Sign in" CTA.

2. Signed-in, unsupported model

   - Tooltip: “Selected model doesn’t support image input”.
   - CTA: "Choose a different model" → opens model picker.
   - Paste/drag → toast with same copy.

3. Signed-in, lower tier

   - Tooltip: "Upgrade to attach images".
   - Click → modal (anchored near left buttons)
     - Title: "Upgrade to attach images"
     - Body: "Your current plan doesn’t include image uploads."
     - Primary: "Upgrade" (no-op for now)
     - Secondary: "Maybe later"

4. At attachment cap (3)

   - Tooltip: "Maximum 3 images per message". Button disabled.

5. Rate limited (server 429)
   - Toast: "Upload limit reached. Please try again later." Link: "Learn more" (optional docs).

## Interaction details

- Textarea grows up to a max height; then scrolls. Auto-resize on input, reset on send.
- Character count and hint appear under the dock in the status row.
- Enter submits on desktop unless Shift is held; on mobile, Enter inserts newline and the Send button is used.
- IME composition respected; Enter during composition does not submit.
- Add supports drag-and-drop (desktop) and paste; both honor gating and limits.

## Accessibility

- Buttons have aria-labels and discernible text for tooltips.
- High-contrast focus rings and proper disabled semantics.
- Tiles include alt text derived from file name (sanitized) and status is announced to screen readers.
- Tooltips/modals trap focus where appropriate, ESC to close.

## Theming

- Follow existing Tailwind tokens and dark mode classes (neutral border, subtle background, emerald accents for focus/send).

## States inventory

- Default (no text, no attachments): Send disabled; Add enabled if allowed.
- With text: Send enabled; Add state unchanged.
- With attachments: tiles row visible; failed/uploading badges.
- Disabled composer (global): everything disabled; show busy spinner in send button if applicable.
- Gated (auth/tier/model): Add disabled with explanatory tooltip; paste/drag shows toast or modal.

## Implementation outline (no code yet)

1. Compose Dock (UI shell)
   - Create a unified container component (no logic changes) that houses left actions, textarea, and send.
   - Preserve current handlers and state; move markup only.
   - Add utility CSS classes for sticky bottom and safe-area insets on mobile.
2. Left Buttons
   - Web Search: UI-only per-message toggle with ON styling (stores ephemeral UI state only; no functional change yet). Tooltip: "Web Search" (and when ON, "Web Search: ON").
   - Add files: reuse existing validations and upload pipeline; wire disabled state and immediate modal when gated.
3. Right Button (Send)
   - Keep existing `handleSend` and keyboard behaviors; ensure accessible label. No Stop state.
4. Attachments Row
   - Extract `AttachmentTile` presentational component.
   - Desktop: wrap with gap; Mobile: horizontal scroll (snap-x, overflow-x-auto). Use 80px/64px sizing.
5. Gating UX
   - Add a small `GatedFeaturePrompt` modal component anchored near the left buttons (fallback to centered on small screens).
   - Centralize `canAttach` + reason helper for consistent messaging across click, paste, drag.
6. Responsiveness & A11y
   - Hit targets ≥40px, visible focus outlines, aria labels.
   - Dark mode review.
7. Tests & QA
   - Update unit tests: button rendering, toggle ON state styling, disabled states, tooltip copies, attachment cap.
   - Add interaction tests for paste/drag gating and retry.

### Phases

- Phase 1: Layout refactor (dock + buttons placement) — no functional changes.
- Phase 2: Attachment row extraction + mobile horizontal scroll.
- Phase 3: Gating UX modal + centralized reason helper + Web Search toggle UI state.
- Phase 4: Polish (animations, focus management, a11y review) and tests.

### Risks / mitigations

- Keyboard behavior regressions → keep handlers untouched and add tests for Enter/Shift+Enter/IME.
- Layout jitter with auto-resize → cap height, measure once per input, and test across browsers.
- Tooltip overlap with mobile keyboards → prefer modal on mobile; limit tooltip use to hover-capable.
- Upload object URL leaks → continue revoking on removal (already implemented).

## Acceptance criteria

- Unified dock with left buttons and right send is rendered on desktop and mobile.
- Character count is visible under the dock in a status row.
- Attachment row appears beneath the dock; tiles are 80px (desktop) / 64px (mobile) with upload/fail states; remove and retry work as before.
- Web Search toggle visually indicates ON/OFF but has no functional effect yet.
- Add button shows modal immediately when gated (anchored near left buttons) with an Upgrade button that does nothing for now; paste/drag shows consistent gating.
- Enter/Shift+Enter and IME composition behaviors unchanged.
- Accessibility: tabbable controls, aria-labels, visible focus, screen-reader status for uploads.
- Theme parity with dark mode supported.

## Open questions

None at this time.

## Next steps (for sign-off)

- Proceed with Phase 1 (layout-only refactor) based on the above decisions.
- After Phase 1, review visuals, then proceed with Phases 2–4.
