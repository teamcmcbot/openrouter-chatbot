# MessageInput

Modern, fused 3-row chat composer with attachments, tier gating, and per-message Web Search.

## Purpose

- Let users compose a message with optional image attachments and an optional per-message Web Search flag.
- Trigger submit on Enter (IME-safe) or via the Send button.

## Layout

- Row 1: Input dock – left controls (Web Search, Add files), expandable textarea, right-aligned Send.
- Row 2: Attachments strip – thumbnails appear when files are added (80px desktop / 64px mobile);
  horizontal scroll on mobile with snap.
- Row 3: Controls/status – includes a floating character counter badge centered in the row.

## Key Behaviors

- IME-safe Enter: Enter sends only when not composing; Shift+Enter inserts newline.
- Character counter: floating, non-interactive, avoids overlaying textarea.
- Image attach: supports click-to-add, paste, and drag; caps at 3 images; shows uploading/failed with Retry and Remove.
- Web Search:
  - Anonymous/free → clicking opens a centered "Upgrade to use Web Search" modal.
  - Pro → clicking opens a centered settings modal with an ON/OFF toggle. "Max results" slider is disabled at 3 with an info tooltip explaining Enterprise-only configurability.
  - Enterprise → clicking opens a centered settings modal with ON/OFF toggle and a "Max results" slider (1–5). Value is persisted per user and applied per message; server clamps to [1,10].
  - Tooltip was removed; aria-label reflects ON/OFF state.
- Image Generation:
  - Anonymous/free → clicking opens a centered "Upgrade for AI Image Generation" modal.
  - Pro/Enterprise → clicking toggles image generation on/off for the current message with visual feedback.
  - When enabled, compatible models (e.g., DALL-E) will generate images based on user prompts.
  - Generated images are automatically stored and displayed in the chat.
- Gating (images & search): outside click and Escape close any gating/settings modals; no analytics are emitted for these modals.

## Props

| Prop            | Type                    | Required? | Description                         |
| --------------- | ----------------------- | --------- | ----------------------------------- |
| `onSendMessage` | `(msg: string) => void` | Yes       | Called with the trimmed text.       |
| `disabled`      | `boolean`               | No        | Disables input and shows a spinner. |

## State (not exhaustive)

- `message`: current textarea value
- `attachments`: files with status (pending/failed/ready)
- `webSearchOn`: per-message boolean (eligible tiers only)
- `imageGenerationOn`: per-message boolean (Pro+ tiers only)
- `gatingOpen`: false or one of 'images' | 'search' | 'imageGeneration' (upgrade/gating modal)
- `searchModalOpen`: boolean (settings modal for eligible tiers)

## Handlers

- `handleSend()` – submit and clear the textarea/attachments if successful.
- `handleKeyDown(e)` – IME-safe Enter to send, Shift+Enter for newline.
- `handlePickFiles()` – shows gating for ineligible tiers, otherwise opens file picker.
- `handleFileChange()` – validates and enqueues uploads.
- `handlePaste(e)` – handles pasted images with same gating as Add.

## Accessibility

- Buttons have descriptive aria-labels; Web Search label reflects ON/OFF.
- Modals close on Escape and outside click; focus is preserved across close.
- Attachment tiles include alt text and status is announced to screen readers.

## Usage Locations

- `components/chat/ChatInterface.tsx`

## Notes

- The Upgrade CTA in gating modals is a no-op placeholder; wiring target TBD.
