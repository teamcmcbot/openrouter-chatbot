# ChatSidebar – Mobile Delete (and optional Rename) UX

Status: Planning (no implementation yet)  
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
- Add a confirmation/undo path to prevent accidental deletes.
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
  - Perform delete immediately and show an Undo Snackbar (5s). No extra confirmation step.
- Discoverability:
  - One-time hint toast on first mobile visit: “Tip: Long‑press a chat to delete.”
- Accessibility:
  - role="dialog", aria-modal="true", focus trap, Escape/Backdrop to close.
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
- Prevent accidental deletes via undo snackbar (5s) after immediate delete; user can restore within the window.
- Works on iOS Safari and Chrome on Android; RTL support is deferred to a later phase.
- Desktop behavior unchanged.

## Phased Plan

### Phase 1 — Long‑press Action Sheet (Mobile)

- [x] Decide confirm vs undo pattern for deletion → Immediate delete + Undo (5s).
- [ ] UX copy for buttons and undo toast.
- [ ] Implement long‑press detection on chat rows (touch/pointer-safe; threshold 500 ms; cancel on scroll/move).
- [ ] Open bottom sheet with Delete + Edit Title + Cancel (Edit Title included on mobile per decision).
- [ ] Wire Delete to existing delete conversation action (no new API if already present).
- [ ] Add one-time discoverability hint (stored with localStorage flag).
- [ ] A11y: focus management, screen reader labels ("Delete conversation '{title}'"), aria-modal.
- [ ] Analytics: track long‑press opens and delete confirmations.
- [ ] Unit tests for the action sheet open/close logic and delete invocation (mock store/actions).
- [ ] Manual cross-browser sanity on iOS Safari, Chrome Android.

Summary for user verification

- Long‑press opens a sheet; Delete flows through confirm/undo; desktop unchanged.

Manual test steps

1. On mobile, long‑press a conversation row.
2. Confirm the sheet appears; focus lands on the sheet.
3. Tap Delete → confirm/undo behaves as decided.
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

- [ ] Decide whether to include Rename in the action sheet for mobile.
- [ ] If yes: inline input in sheet or a secondary dialog with validation.
- [ ] Unit/UI tests; i18n strings.

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
