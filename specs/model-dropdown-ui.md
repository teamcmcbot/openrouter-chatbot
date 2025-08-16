# Model Dropdown – UX/UI Proposal

Author: Copilot UX
Date: 2025-08-16
Status: Draft for review
Scope: Update the model selector placement, affordance, and behavior on desktop and mobile, in light and dark modes.

---

## 1) Current issues (from user feedback)

- Placement: Top-right of conversation header, visually secondary and shares space with message count and "Enhanced" indicator.
- Discoverability: Users don’t immediately notice it controls the AI model.
- Density: Unused horizontal space in header; label hierarchy unclear ("AI Assistant" + "Powered by OpenRouter" competes with model selector).
- Mobile: Limited width makes selector cramped; indicators wrap awkwardly.

## 2) Goals & success criteria

- High discoverability: It should be obvious this controls the model.
- Clear hierarchy: Current model is a primary label; secondary metadata stays secondary.
- Efficient: One-tap/one-click access; minimal cursor travel.
- Mobile friendly: Works on narrow screens using intuitive patterns.
- Accessible: Fully keyboard operable, screen-reader friendly, color-contrast compliant.
- Theming: Looks great in light/dark; consistent with existing tokens.

Success signal ideas:

- +20% model-change engagement in first session.
- <1s time-to-open selector on average.
- <2% misclicks (opening wrong affordance near it).

## 3) Proposed placement & layout

### Option A – Prominent header pill (recommended)

- Replace "AI Assistant / Powered by OpenRouter" block with a single, prominent model selector pill.
- Layout (desktop):
  - Left: Model selector pill (primary)
  - Right: Message count and Enhanced chip (secondary)
- Layout (mobile):
  - Row 1: Centered model selector pill
  - Row 2: Left-aligned message count, right-aligned Enhanced chip

### Option B – Centered model label with caret

- Large model text centered. Caret triggers dropdown.
- Pros: Very visible; good for empty states.
- Cons: Centered controls can be less efficient for repeated access (cursor travel), and clashes with other right-justified actions.

### Option C – Sidebar placement

- Add a compact model control in the left rail above Recent Chats.
- Pros: Persistent and scannable.
- Cons: Splits mental model from conversation header; weaker on mobile.

We will ship A, keep B as a variant if visual balance requires centered alignment on desktop. Avoid C for now.

## 4) Component structure & behavior

### Header

- Container: Sticky conversation header bar with 2 columns on desktop; stacked on mobile.
- Left column: ModelSelectorTrigger (prominent pill)
- Right column: Meta (message count, Enhanced chip)

### Trigger (ModelSelectorTrigger)

- Shape: Large pill/button with model provider icon + model name + caret-down.
- States: default, hover, focus-visible, active, disabled (loading).
- Content: "Model: <Provider name short> <model name short>" or just "<model display>" when space is tight.
- Micro-interaction: subtle scale or underline on hover; focus ring for keyboard.

### Selection Surface

- Desktop: Popover/panel anchored to trigger; max height with internal scroll.
- Mobile: Bottom sheet modal with drag-handle, full-width, sticky search at top.
- Search: Debounced text filter across provider + model names; optional keyboard shortcut (/) when panel open.
- Grouping: By provider; user’s recent or favorites at top.
- Items: icon, model display name, speed/cost badges, and short description on hover (desktop) or inline sublabel (mobile).
- Empty state: “No models match” with a clear reset.

### Quick affordances

- Favorites: Star toggle on each model; favorites appear first.
- Enhanced flag: Surface a small badge on models that support Enhanced features.
- Limits: If tier-gated, show lock badge; clicking explains requirement.

## 5) Visual design (Tailwind-friendly tokens)

Trigger (light):

- bg: bg-white, border border-slate-300, text-slate-900
- hover: border-slate-400, shadow-sm
- focus: outline-none ring-2 ring-primary-500/40
- active: bg-slate-50

Trigger (dark):

- bg: bg-slate-800/60, border border-slate-700, text-slate-100
- hover: border-slate-600, shadow-sm/none, bg-slate-800
- focus: ring-2 ring-primary-400/30
- active: bg-slate-900

Trigger sizing:

- px-3.5 py-2, rounded-full, text-sm md:text-base, gap-2, inline-flex items-center

Badges:

- Message count: muted badge (bg-slate-100 text-slate-600 / dark: bg-slate-800 text-slate-300)
- Enhanced: success/info chip (bg-emerald-100 text-emerald-700 / dark: bg-emerald-900/40 text-emerald-300)

Panel:

- light: bg-white border border-slate-200 shadow-xl rounded-xl
- dark: bg-slate-900/95 border border-slate-700 shadow-2xl

Items:

- layout: grid-cols-[24px_1fr_auto] gap-3 py-2.5 px-3 rounded-lg
- hover: bg-slate-50 / dark: bg-slate-800/70
- selected: bg-primary-50 ring-1 ring-primary-400 / dark: bg-primary-900/20 ring-primary-500/30

Search input:

- light: bg-slate-50 border-slate-200 focus:ring-primary-500/40
- dark: bg-slate-800 border-slate-700 text-slate-100

Bottom sheet (mobile):

- full-width, rounded-t-2xl, safe-area insets; drag indicator bar

## 6) Accessibility

- Trigger: aria-haspopup="listbox", aria-expanded state, aria-controls to panel id.
- List: role="listbox"; options role="option" with aria-selected.
- Keyboard: Enter/Space to open; Up/Down to navigate; Typeahead search; Esc to close; Tab cycles out.
- Focus management: Return focus to trigger after close.
- Motion: Reduce large transitions for prefers-reduced-motion.
- Contrast: Ensure WCAG AA for text/badges; use tokenized colors.

## 7) Empty and loading states

- Loading: Skeleton for 4–6 items; trigger shows spinner and disabled state.
- Empty favorites: Hint to star models; provide "Reset filters" button when search has no results.

## 8) Implementation plan

Phases:

1. Layout changes (header)

   - Replace current header title block with ModelSelectorTrigger on the left.
   - Move Message Count + Enhanced chip to the right; stack on mobile.
   - Add responsive classes and container queries if available.
   - Verification: visual QA on desktop (≥1280px), tablet (~768px), mobile (≤430px).

2. Selector surface

   - Desktop popover + mobile bottom sheet (feature-detect viewport width with a media query hook).
   - Implement search, grouping, and basic item rendering with icons.
   - Verification: keyboard nav, screen reader labels.

3. Enhancements

   - Favorites and recent models.
   - Badges for speed/cost/Enhanced/locked.
   - Virtualized list for >100 models.

4. Polish
   - Micro-interactions, empty/loading states, a11y audit.

## 9) Files & component changes (Next.js + Tailwind)

- components/chat/ChatHeader.tsx (or equivalent) – restructure header grid.
- components/chat/ModelSelectorTrigger.tsx – new trigger component.
- components/chat/ModelSelectorPanel.tsx – popover/panel listbox.
- components/chat/ModelBottomSheet.tsx – mobile variant (can share list with Panel).
- hooks/useMedia.ts – small hook for viewport breakpoints.
- styles: reuse existing Tailwind config; add tokens only if missing (primary-\*, emerald chips).
- tests/components/chat/ModelSelector.test.tsx – rendering + interactions.

## 10) Copy & labels

- Trigger: "Model: <display>" on desktop; "<display>" on very small widths.
- Tooltip: "Change AI model" on hover/focus.
- Search placeholder: "Search models…".

## 11) Risks & mitigations

- Too much motion on open → respect reduced motion.
- Crowded header on small phones → stack into two rows; center trigger.
- Async model list delay → cache last list; show skeleton quickly.

## 12) Acceptance checklist

- Discoverable: Trigger visually primary; eye drawn to it first in header.
- Usability: One click/tap to open; keyboard accessible.
- Responsive: Looks good at 320–1440px.
- Theming: Passes AA contrast in both modes.
- No regressions: Message count + Enhanced remain visible and readable.

## 13) Optional future ideas

- Inline model comparison (hover card) showing cost/latency.
- Per-conversation model override with reminder banner.
- Quick-switch (⌘K) with model scope.
