# MessageInput footer overlap between 640–768px

## Summary

When viewport width is between 640px and 768px, the footer becomes visible (`hidden sm:block`) but the main content area still uses the "mobile" height calculation that subtracts only the header height. This causes the bottom-anchored MessageInput (with inline feature buttons and send button) to collide with the footer. At ≥ 769px, the content switches to a layout that subtracts both header and footer, so the overlap disappears.

## Evidence

- Below 640px: Footer hidden. MessageInput renders correctly.
- At 640px: Footer becomes visible and overlaps the MessageInput text area/buttons.
- At ≥ 769px: MessageInput and footer both render correctly without overlap.

## Root Cause Analysis

- Footer visibility breakpoint: `sm` (≥ 640px) via `className="hidden sm:block"` in `src/app/layout.tsx`.
- App height utilities in `src/app/globals.css`:
  - `--mobile-viewport-height: 100dvh` and `--mobile-content-height: calc(var(--mobile-viewport-height) - var(--header-height))` (only header subtracted).
  - `--desktop-content-height: calc(var(--mobile-viewport-height) - var(--header-height) - var(--footer-height))` (header + footer subtracted).
- The main content area (within `MainContainer`) continues to use the mobile sizing between 640–768px, so it doesn't reserve space for the footer even though the footer is now visible. As a result, the MessageInput sits at the viewport bottom while the footer also claims the bottom, creating a visual overlap.

## Affected files

- `src/app/layout.tsx` (footer visibility class)
- `src/app/globals.css` (height variables/utilities)
- `components/layout/MainContainer.tsx` or container around MessageInput (responsive height classes; inferred)

## Goals

- Ensure that when the footer is visible, the main content area reserves space for it across all breakpoints.
- Maintain correct dynamic viewport height behavior on mobile (100dvh / safe-area) without reintroducing layout shifts or FOUC.

## Proposed Fix Options

### Option A — Align Breakpoints (minimum change)

- Change footer visibility to `md:block` (hide until ≥ 768/769px).
- Rationale: Avoids the 640–768px overlap by not showing the footer until the desktop layout that subtracts footer height kicks in.
- Trade-offs: Footer not visible on small tablets/large phones in landscape.

### Option B — Reserve Footer Space at `sm:` (recommended)

- Keep footer at `hidden sm:block`.
- Ensure the main content container switches to a height that subtracts both header and footer starting at `sm:`.
  - Example: add `sm:h-desktop-content` (or equivalent) to the scroll container that wraps chat/messages/MessageInput.
  - Alternatively, add `sm:pb-[var(--footer-height)]` padding-bottom to the scrollable area as a spacer.
- Rationale: Preserves current breakpoints and makes layout consistent.
- Trade-offs: Requires verifying the exact container that controls vertical sizing.

### Option C — Dynamic Spacer (CSS-only)

- Add a responsive spacer at the bottom of the scroll area: `sm:h-[var(--footer-height)] md:h-[var(--footer-height)]` that is `hidden` below 640px.
- Rationale: Decouples from container height utilities; simpler to apply locally.
- Trade-offs: A bit more ad-hoc; must ensure no double spacing at ≥ md if height also subtracts footer.

## Acceptance Criteria

- At 640–768px, MessageInput does not overlap with the footer.
- At < 640px, no visual regressions; footer remains hidden.
- At ≥ 769px, behavior remains unchanged (no regressions).
- MessageInput feature buttons and send button remain fully visible and clickable at all widths.

## Implementation Plan (Phased)

### Phase 1 — Planning & Verification

- [ ] Confirm which container controls the vertical sizing around the chat area (likely `MainContainer`).
- [ ] Decide among Option A, B, or C (default recommendation: Option B).
- [ ] Identify the exact class changes required on the container (e.g., `h-mobile-content sm:h-desktop-content`).
- [ ] Prepare quick manual test checklist.
- [ ] User sign-off to proceed.

### Phase 2 — Implement Responsive Height/Spacer

- [ ] If Option B: Apply `sm:h-desktop-content` (or equivalent) to the container around the chat and MessageInput.
- [ ] If a spacer approach is used, add `sm:pb-[var(--footer-height)]` or an explicit spacer element that is `hidden` below `sm`.
- [ ] Ensure no double subtraction at ≥ md (avoid combining both `h-desktop-content` and a spacer unless designed to coexist).
- [ ] Build and run a smoke check at 640px, 768px, and 769px.
- [ ] Update screenshots in PR/issue.

### Phase 3 — Regression Hardening

- [ ] Verify safe-area insets on iOS devices (dynamic island/notches) with `--mobile-safe-viewport-height` if used by the container.
- [ ] Check long conversations (scrollable area height) to ensure the input is not pushed off-screen.
- [ ] Confirm no reflow issues when toggling dark mode or switching models.
- [ ] Cross-browser check (Safari, Chrome, Firefox) for dvh support, falling back if needed.

### Phase 4 — Documentation & Cleanup

- [ ] Update `/docs/components` or layout docs with the breakpoint contract: when footer is visible, the content container must reserve `--footer-height`.
- [ ] Add comments near the container class list explaining the `sm:` rule.
- [ ] Close the issue after user verification.

## Manual Test Steps

1. Open app at 550px, 640px, 768px, and 769px widths in dev tools responsive mode.
2. Scroll to bottom and focus the message textarea.
3. Verify the feature buttons and send button are fully visible and clickable.
4. Ensure footer is hidden at < 640px, visible at ≥ 640px, and does not overlap the input at any width.
5. Test on iOS Safari with dynamic island: ensure no unexpected cutoffs at the bottom.

## Clarifying Questions (please confirm)

1. Do we want the footer visible on small tablets/landscape phones (640–768px)? If yes, we’ll implement Option B; if no, Option A is simpler.
2. Which component owns the vertical sizing classes (`MainContainer` vs. a nested wrapper in the chat page)?
3. Is the intended bottom inset on mobile `--mobile-safe-viewport-height` already used by the container that wraps MessageInput? If not, should we adopt it in the same change?
4. Any constraints with SEO or analytics that depend on the footer being visible at `sm`?
5. Do we prefer a spacer-only fix (Option C) to avoid touching container heights?

---

- Proposed default: Proceed with Option B once confirmed, as it preserves current footer visibility semantics and fixes the overlap without hiding the footer on sm screens.
