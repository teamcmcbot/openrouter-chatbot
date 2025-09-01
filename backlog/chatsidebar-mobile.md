# ChatSidebar – Mobile Delete (and optional Rename) UX

Status: Completed (2025-09-01)  
Owner: TBD  
Related: components/chat/ChatSidebar.tsx (hover-only controls today)

## Problem Overview

- Desktop uses hover to reveal Edit and Delete on each conversation row.
- On mobile/touch, there’s no hover, so these controls are inaccessible.
- Constraint: Avoid persistent buttons that overlap or truncate the conversation title.
- Priority: Delete is required on mobile; Rename is optional/nice-to-have.
- Keep desktop behavior unchanged.

## Goals

- Provide an intuitive, non-blocking way to delete a conversation on mobile/touch.
- Keep the title area clean (no always-visible buttons).
- Provide immediate delete with a success toast (no undo) to keep flow simple on mobile.
- Maintain accessibility and RTL support.
- Defer “Rename” on mobile unless discoverability and UI footprint are acceptable.

## Recommended Solution (Phase 1)

Option A: Long‑press to open an Action Sheet (bottom sheet)

- Gesture: Press-and-hold the chat row (~500 ms) to open a modal sheet.
- Sheet contents:
  - Delete Conversation (destructive, red)
  - Edit Title (secondary)
  - Cancel
- Safety:
  - Perform delete immediately. No Undo; show a success toast on completion.
- Discoverability:
  - One-time hint toast on first mobile visit: “Tip: Long‑press a chat to delete or edit.”
  - Gated to mobile devices (no hover) and only when the ChatSidebar is open.
- Accessibility:
  - role="dialog", aria-modal="true", first action focused, Escape/Backdrop to close.
  - Provide accessible labels (e.g., “Delete conversation ‘{title}’”).
- Internationalization:
  - Strings routed through existing i18n utility if present; otherwise place under a shared strings module for future i18n.

Why this first?

- Minimal visual clutter; keeps title visible.
- Simple to implement and robust across iOS/Android browsers.
- Works with small screens and variable row heights.

## Alternative Options (Phase 2/3 – optional)

Option B: Swipe‑left to reveal trailing Delete

- Familiar mobile pattern (Mail/Messages).
- Engineering considerations: horizontal vs vertical gesture disambiguation, momentum/thresholds, one-row-open rule, RTL inversion (swipe-right).
- Keep long‑press as fallback.

Option C: Overflow menu (“…”) on tap or focus

- Show small menu with Delete (and optionally Rename).
- Slightly more visible but adds a tap target; consider for iPad/large screens only.

## Acceptance Criteria

- Mobile/touch users can delete a conversation without hover.
- Title area remains unobstructed until the user performs an intentional action.
- Delete is immediate; a success toast confirms deletion. No Undo.
- Works on iOS Safari and Chrome on Android; RTL support is deferred to a later phase.
- Desktop behavior unchanged.

## Phased Plan

### Phase 1 — Long‑press Action Sheet (Mobile)

- [x] Decide confirm vs undo pattern for deletion → Immediate delete (no Undo).
- [x] UX copy for buttons and success toasts (delete + title updated).
- [x] Implement long‑press detection on chat rows (touch/pointer-safe; threshold 500 ms; cancel on scroll/move > 8 px).
- [x] Open bottom sheet with Delete + Edit Title + Cancel (Edit Title included on mobile).
- [x] Wire Delete to existing delete conversation action (no new API if already present).
- [x] Add one-time discoverability hint (stored with localStorage flag; mobile-only; only when sidebar is open).
- [x] A11y: focus management, screen reader labels, aria-modal, Escape/Backdrop to close.
- [ ] Analytics: track long‑press opens and delete confirmations.
- [x] Unit tests for the action sheet open/close logic and delete invocation (mock store/actions).
- [ ] Manual cross-browser sanity on iOS Safari, Chrome Android.

Summary for user verification

- Long‑press opens a sheet; Delete is immediate and shows a success toast; desktop unchanged.

Manual test steps

1. On mobile, long‑press a conversation row.
2. Confirm the sheet appears; focus lands on the sheet.
3. Tap Delete → conversation is removed immediately and a success toast appears.
4. Ensure normal tap still navigates to the conversation.
5. Ensure desktop hover behavior is unchanged.

- [ ] User verification: Phase 1 passes.

### Phase 2 — Swipe‑to‑Delete (Optional)

- [ ] Implement horizontal swipe gesture with reveal (width ~72–88 px).
- [ ] Thresholds: commit > 50% width or velocity < −0.3; otherwise spring back.
- [ ] Ensure only one row can be “open” at a time; close on outside tap/scroll.
- [ ] RTL support (reverse direction). (Deferred; not required for Phase 1.)
- [ ] Keep long‑press as fallback.
- [ ] Unit/interaction tests for swipe thresholds and open/close rules.

Summary for user verification

- Swipe left reveals Delete; long‑press still works; RTL respected.

Manual test steps

1. Swipe left on a row → Delete button reveals.
2. Tap Delete or complete a full swipe to delete.
3. Scroll the list → open row closes.
4. Verify RTL reverses direction correctly.

- [ ] User verification: Phase 2 passes.

### Phase 3 — Optional Rename on Mobile (Deferred)

- (Merged into Phase 1)
- [x] Include Edit Title in the action sheet on mobile.
- [x] Inline input inside the sheet with Save/Cancel; success toast on save; sheet closes on success.
- [x] Unit/UI tests for inline edit flow.
- [ ] i18n strings.

- [ ] User verification: Phase 3 passes.

### Phase 4 — Docs & Finalization

- [ ] Update /docs/ with mobile ChatSidebar interactions and a11y notes.
- [ ] Add analytics dashboard notes (usage, undo rate).
- [ ] Close backlog item.

## Risks & Mitigations

- Accidental long‑press while scrolling → cancel long‑press on significant pointer move.
- Discoverability → one-time hint toast; keep swipe option as future enhancement.
- Modal conflicts → reuse existing Dialog/Sheet primitives to maintain consistency.
- Performance on large lists → gesture handlers are lightweight; avoid reflows; memoize row components.

## Open Questions (please confirm)

1. Delete flow preference: confirmation in the sheet vs immediate delete with Undo snackbar? -> immediate delete.
2. Long‑press threshold: use 500 ms, or a different value to match your design system? -> 500 ms.
3. Include Rename in the sheet from day one on mobile, or omit initially?
   -> include `Edit Title` in the sheet.
4. Do we need RTL support now, or can it ship in Phase 2?
   -> Not required for now.
5. Which mobile browsers/devices must we treat as primary test targets (iOS Safari, Chrome Android, iPadOS)?
   -> iOS Safari and Chrome Android.
