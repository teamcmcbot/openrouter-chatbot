# MessageInput

Modern, collapsible chat composer with attachments, tier gating, and per-message Web Search. Optimized for mobile with space-saving collapsed state.

## Purpose

- Let users compose a message with optional image attachments and an optional per-message Web Search flag.
- Trigger submit on Enter (IME-safe) or via the Send button.
- Minimize vertical space when not actively composing (especially beneficial on mobile).

## Layout States

### Collapsed State (Default - 80px height)

When textarea is not focused and empty:

- **Row 1 only:** Single-line textarea with right-aligned Send button
- **Hidden:** Feature buttons, attachments, banners
- **Space savings:** ~44% height reduction (80px vs 144px)
- **Use case:** Reading messages, casual browsing

```
┌──────────────────────────────────────┐
│ [Type your message...        ][▶]   │
└──────────────────────────────────────┘
```

### Expanded State (144-216px height)

When textarea is focused or has content/attachments:

- **Row 1:** Auto-expanding textarea (40-80px height)
- **Row 2 (conditional):** Attachment preview tiles (64-80px when present)
- **Row 2.5 (conditional):** Inline banner for incompatible models (~80-100px when shown)
- **Row 3:** 5 feature buttons (left) + Send button (right)
- **Character counter:** Floating badge at bottom center, aligned with feature buttons row baseline

```
┌──────────────────────────────────────┐
│ [Type your message...              ] │
│ [Attachment tiles if present]        │
│ [Banner if model incompatibility]    │
│ [▶][🌐][💡][📎][📷]           [▶]   │
└──────────────────────────────────────┘
```

## Expansion Behavior

### Auto-Expand Triggers

- User focuses textarea (click/tap)
- Message text present (`message.length > 0`)
- Attachments present (`attachments.length > 0`)
- Model incompatibility banner showing

### Auto-Collapse Triggers

- User blurs textarea (click/tap outside)
- **Only if:** Message empty AND no attachments AND no banner
- **Mobile:** 100ms blur delay to prevent premature collapse when tapping feature buttons

### Animation

- **Duration:** 200ms smooth transition
- **Properties:** Padding, gap, height, opacity
- **Accessibility:** Respects `prefers-reduced-motion` for instant transitions

## Key Behaviors

- **Collapsible UI:** Expands on focus, collapses on blur (if empty). Saves ~64px vertical space on mobile.
- **IME-safe Enter:** Enter sends only when not composing; Shift+Enter inserts newline.
- **Character counter:** Floating, non-interactive, positioned at bottom center aligned with feature buttons row.
- **Image attach:** Supports click-to-add, paste, and drag; caps at 3 images; shows uploading/failed with Retry and Remove. Auto-expands when attachments added.
- **Feature buttons (expanded state only):**
  - **Streaming (▶):** Toggle streaming mode on/off
  - **Web Search (🌐):** Configure per-message web search with tier-based limits
  - **Reasoning (💡):** Enable AI reasoning mode with gating for free/anonymous users
  - **Attach Image (📎):** Upload image attachments (up to 3)
  - **Image Generation (📷):** Toggle AI image generation on/off (Pro+ only)
- **Web Search:**
  - Anonymous/free → clicking opens a centered "Upgrade to use Web Search" modal.
  - Pro → clicking opens a centered settings modal with an ON/OFF toggle. "Max results" slider is disabled at 3 with an info tooltip explaining Enterprise-only configurability.
  - Enterprise → clicking opens a centered settings modal with ON/OFF toggle and a "Max results" slider (1–5). Value is persisted per user and applied per message; server clamps to [1,10].
  - Tooltip was removed; aria-label reflects ON/OFF state.
- **Image Generation:**
  - Anonymous/free → clicking opens a centered "Upgrade for AI Image Generation" modal.
  - Pro/Enterprise → clicking toggles image generation on/off for the current message with visual feedback.
  - When enabled, compatible models (e.g., DALL-E) will generate images based on user prompts.
  - Generated images are automatically stored and displayed in the chat.
- **Gating (images & search):** Outside click and Escape close any gating/settings modals; no analytics are emitted for these modals.
- **Mobile optimization:** Blur delay (100ms) prevents premature collapse when tapping feature buttons or modals.

## Props

| Prop            | Type                    | Required? | Description                         |
| --------------- | ----------------------- | --------- | ----------------------------------- |
| `onSendMessage` | `(msg: string) => void` | Yes       | Called with the trimmed text.       |
| `disabled`      | `boolean`               | No        | Disables input and shows a spinner. |

## State (not exhaustive)

- `message`: current textarea value
- `isExpanded`: boolean controlling collapsed (false) vs expanded (true) state
- `attachments`: files with status (pending/failed/ready)
- `webSearchOn`: per-message boolean (eligible tiers only)
- `imageGenerationOn`: per-message boolean (Pro+ tiers only)
- `gatingOpen`: false or one of 'images' | 'search' | 'imageGeneration' (upgrade/gating modal)
- `searchModalOpen`: boolean (settings modal for eligible tiers)

## Handlers

- `handleSend()` – submit and clear the textarea/attachments if successful; collapses input if empty.
- `handleKeyDown(e)` – IME-safe Enter to send, Shift+Enter for newline.
- `handleFocus()` – expands the input to show all feature buttons and full controls.
- `handleBlur(e)` – collapses input if empty (no message, no attachments); includes mobile-specific 100ms delay.
- `handlePickFiles()` – shows gating for ineligible tiers, otherwise opens file picker; auto-expands on file selection.
- `handleFileChange()` – validates and enqueues uploads; auto-expands to show attachment previews.
- `handlePaste(e)` – handles pasted images with same gating as Add; auto-expands if image attached.

## Accessibility

- Buttons have descriptive aria-labels; Web Search label reflects ON/OFF.
- Textarea includes `aria-expanded` attribute indicating current state (collapsed/expanded).
- Screen reader announces state changes: "Message composer expanded" / "Message composer collapsed".
- Modals close on Escape and outside click; focus is preserved across close.
- Attachment tiles include alt text and status is announced to screen readers.
- Respects `prefers-reduced-motion` for users sensitive to animations.

## Usage Locations

- `components/chat/ChatInterface.tsx`

## Notes

- The Upgrade CTA in gating modals is a no-op placeholder; wiring target TBD.
- **Collapsible feature:** Implemented October 14, 2025 to optimize mobile viewport usage.
- **Space savings:** Collapsed state saves ~64px vertical space (44% reduction from 144px to 80px).
- **Feature buttons z-index:** Fixed with `z-20` to prevent character counter from blocking clicks.
- **Character counter positioning:** Uses `relative` parent container to position correctly inside pill.
- **Blur handling:** Enhanced with `data-keep-expanded` attribute and `relatedTarget` checks to prevent premature collapse when clicking feature buttons or opening modals.

## Related Documentation

- Implementation details: `/specs/Collapsible-MessageInput.md`
- Layout fixes: `/docs/updates/collapsible-messageinput-layout-fixes.md`
- Testing: `/tests/components/MessageInput.test.tsx`
