# Image attachments (Phase C)

Developer guide for the chat UI image-attachment experience: attach, preview, send, and render with signed URLs.

## Overview

- Attach Image button in the composer, gated by auth and selected model modality (requires `image`).
- **Collapsible UI:** Button visible only when MessageInput is in expanded state; attaching an image auto-expands the input.
- Pre-upload images to Supabase Storage via `POST /api/uploads/images` (multipart), grouped by a `draftId`.
- Local thumbnail previews via Object URLs with remove ("×") prior to send.
- Send includes `attachmentIds[]` and `draftId`; server revalidates and links on sync.
- History thumbnails use signed URLs minted on demand and cached in sessionStorage.
- Lightbox modal on click; ESC/overlay close with body scroll lock.

## Key files

- `components/chat/MessageInput.tsx` – attach button, paste-to-upload, previews, delete, `draftId` lifecycle.
- `components/chat/MessageList.tsx` – renders attachments in messages, lightbox modal.
- `components/chat/InlineAttachment.tsx` – requests a signed URL and renders a thumbnail; handles retries.
- `lib/utils/signedUrlCache.ts` – sessionStorage cache for signed URLs with TTL skew handling.
- `src/app/api/attachments/[id]/signed-url/route.ts` – protected endpoint to mint signed URLs (~5m TTL).
- `src/app/api/attachments/[id]/route.ts` – protected DELETE for pending attachments (pre-send cleanup).
- `src/app/api/uploads/images/route.ts` – protected image upload endpoint.

## Gating and limits

- Attach button enabled only when:
  - user is authenticated, and
  - selected model’s `input_modalities` includes `image`.
- Cap: max 3 images per message (UI enforces; server enforces at upload and linking).
  - If a selection exceeds the cap, the UI accepts only up to the remaining capacity and shows a toast error: "You can attach up to 3 images.".
  - The file input is reset after handling to allow re-selecting the same files if needed.
- MIME allowlist: png, jpeg, webp.
- Size: client does a soft check (<=10MB); server enforces tier caps (Free ≤ 5MB, Pro/Enterprise ≤ 10MB).

## Previews and removal

- After a successful upload, the UI creates an Object URL for instant preview.
- **Auto-expansion:** Attaching images automatically expands the MessageInput to show attachment tiles.
- **Visibility:** Attachment tiles visible only when MessageInput is in expanded state.
- Remove calls `DELETE /api/attachments/:id` to soft-delete the DB row and storage object, then revokes the Object URL.
- Draft state resets and a new `draftId` is generated on successful send.
- **Collapse behavior:** MessageInput collapses only if empty (no message text AND no attachments).

### Mobile vs desktop affordance

- On devices without hover (touch devices), the remove (×) button is always visible.
- On hover-capable devices (desktop), the remove button is revealed on hover for a cleaner UI.

## History rendering

- Inline thumbnails request a signed URL for each attachment and cache it in sessionStorage (`att:{id}`) with an expiry timestamp.
- Signed URLs are not stored in the database and are never persisted cross-session.
- On error/expiry, a fresh signed URL is requested.

## Accessibility and UX

- Thumbnails include meaningful `alt` text from sanitized filenames or fallbacks (Image01, Image02, …).
- Lightbox modal sets `aria-modal`, closes on ESC or backdrop click, and prevents background scroll while open.
- Dark mode: thumbnails in user (green) bubbles include a white border/ring for contrast.

## Troubleshooting

- “Upload failed” or oversized: server enforces tier size caps; inspect network response for 4xx details.
- Thumbnail doesn’t load: the signed URL may have expired; re-opening or re-rendering requests a fresh URL.
- Disabled attach button: ensure user is signed in and the selected model supports image input.

## Related API docs

- `docs/api/uploads-images.md` (multipart upload)
- `GET /api/attachments/:id/signed-url` (protected, not yet separately documented)
- `DELETE /api/attachments/:id` (protected, not yet separately documented)
