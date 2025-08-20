# Image attachment edge case: switching from multimodal to text-only model before sending

## Context

Users can upload image(s) while composing a message when the selected model supports image input. These uploads are stored in the `attachments-images` bucket and inserted into `public.chat_attachments` with a `draft_id` and no `message_id` (unlinked). If the user then switches the model to a text-only model before sending, the current UI/flow needs clear behavior.

Relevant code and docs in this repo:

- Uploads: `POST /api/uploads/images` inserts into `chat_attachments` with `draft_id` and `status='ready'` (see `src/app/api/uploads/images/route.ts` and `docs/api/uploads-images.md`).
- Deletion: `DELETE /api/attachments/:id` exists (see `src/app/api/attachments/[id]/route.ts` and `docs/api/attachments-delete.md`).
- Signed preview: `GET /api/attachments/:id/signed-url` (for thumbnails/previews).
- Chat send: `POST /api/chat` and `POST /api/chat/messages` link attachments to the created user message when supplied as `attachmentIds`; server re-validates that the selected model supports images and will return 400 if not (see `src/app/api/chat/route.ts`, `src/app/api/chat/messages/route.ts`).
- Cleanup: internal/admin jobs clean up orphan (unlinked) attachments after a time window (24h default) and enforce retention policies (see `lib/services/attachmentsCleanup.ts`, `lib/services/attachmentsRetention.ts`, and docs under `docs/ops/`).
- UI signals: `components/chat/MessageInput.tsx` already derives `modelSupportsImages` and includes tooltip copy “Selected model doesn’t support image input”.

## Goals

- Prevent accidental sending of images with a model that doesn’t support image input.
- Make it obvious to users why image upload controls are disabled and what choices they have.
- Avoid surprising data loss. Give users a way to discard images, but don’t auto-delete without consent.
- Keep a reversible path when appropriate, while enabling a single decisive action to proceed with text only.
- Minimize storage leakage: provide an explicit discard action and rely on existing cleanup jobs for any leftover unlinked uploads.

## Recommended UX behavior

1. When a user has pending images (unlinked attachments for the current draft/session) and switches to a text-only model:

- Show an inline warning banner above the input (preferred over a fleeting toast). Content:
  - Title: “Selected model doesn’t support image input.”
  - Body: “You’ve uploaded images for this message. You can discard the images and send text only, or switch to a multimodal model to include them.”
  - Actions:
    - Primary: “Discard images and send text only” → immediately sends the current message without any attachments; on success, clears the composer text and removes all pending images from the draft state by calling `DELETE /api/attachments/:id` in bulk.
    - Secondary: “Switch model” → opens model selector pre-filtered to Multimodal.
- Keep the attachment button disabled with the existing tooltip: “Selected model doesn’t support image input.”
- Continue showing thumbnail chips for the already uploaded images in a disabled state until the primary action is taken or the user switches back to a multimodal model.

2. When sending via the primary action while on a text-only model:

- Do not include `attachmentIds` in `POST /api/chat` or `POST /api/chat/messages`.
- On successful send, clear the composer input and trigger deletion of all pending unlinked images (`DELETE /api/attachments/:id`), then clear their chips.
- If send fails, do not delete the pending images; keep the banner visible so the user can retry or switch models.

3. If the user switches back to an image-capable (multimodal) model for the same draft (without having used the primary action):

- Re-enable the attachment button and chips.
- Include the pending attachment IDs in the next `POST /api/chat/messages` request (subject to any limits and eligibility checks on the server).

4. When the user clears the composer/draft explicitly (e.g., “Clear” action):

- Offer a confirmation modal: “Also discard uploaded images?” (default: Yes). If confirmed, call `DELETE /api/attachments/:id` for each pending unlinked image and clear local state.
- If declined, keep pending images; orphan cleanup will remove them later if left unused.

5. No automatic deletion on model change:

- Do not auto-delete on switch to text-only. Deletion only occurs through the explicit primary action above, or via the clear composer flow.

## Data and state lifecycle

- Upload flow:
  - Client uploads image(s) with `draft_id` (and optional `session_id`) → server validates and stores in `attachments-images` → inserts `chat_attachments` row(s) with `status='ready'` and `message_id=null`.
  - Client displays a chip for each ready attachment; keep IDs in the draft state.
- Send (text-only primary action) flow:
  - Omit `attachmentIds` → on success, clear composer and delete all pending attachments via bulk individual `DELETE /api/attachments/:id` calls; on failure, keep state unchanged.
- Send (multimodal) flow:
  - If model supports images → include `attachmentIds` in `POST /api/chat/messages`; server verifies and links (`message_id`, `session_id`), and updates message flags.
- Discard flow (bulk via primary action or explicit clear):
  - Call `DELETE /api/attachments/:id` and remove from draft state on success. Retry or show errors on failure.
- Cleanup/retention:
  - Unused, unlinked attachments are cleaned up by the orphan cleanup job after a window (24h default). Tier retention jobs handle longer-term policies for linked attachments.

## Edge cases and safeguards

- Network race: if deletion requests lag after send, keep UI responsive; mark chips as “removing…” and hide them on success. Provide retry on failure.
- Partial deletion failures: show a dismissible error banner/toast listing failures; allow retry delete.
- Send failure: do not delete attachments; let user retry or switch model.
- Multi-tab and anonymous users: same as before; reconcile by `draft_id` and respect capability checks.
- Attachment caps and signed URL expiry: unchanged; follow existing flows.

## Implementation outline (frontend only)

- `components/chat/MessageInput.tsx`
  - Show inline banner when `pendingAttachments.length > 0 && !modelSupportsImages`.
  - Implement primary action handler:
    - Trigger send without `attachmentIds`.
    - On success: clear input, then iterate pending IDs and call `DELETE /api/attachments/:id`; optimistically remove chips; reconcile on failure.
  - Implement secondary action to open the model selector with Multimodal filter.
  - Keep chips disabled when in text-only mode; re-enable when switching back to multimodal.
- `components/ui/ModelDropdown.tsx`
  - Optional helper to open pre-filtered to Multimodal.
- Telemetry (optional): banner shown, primary action taken, deletion results.

Backend: No new endpoints needed. Rely on existing upload/delete/signed-url/chat endpoints and server-side validation.

## Acceptance criteria

- [ ] When switching to a text-only model with pending images, the inline banner appears with two actions: “Discard images and send text only” and “Switch model”.
- [ ] Primary action sends the message immediately without attachments, then clears the composer and deletes all pending unlinked images; chips disappear.
- [ ] If send fails, pending images are not deleted and the banner remains for retry.
- [ ] Switching back to a multimodal model (without taking the primary action) re-enables images; sending includes them as before.
- [ ] Clearing the composer offers to also discard images; confirming performs deletions.

## User test steps

1. Select a multimodal model and upload two images; confirm chips appear.
2. Switch to a text-only model; verify the banner appears and attach button is disabled with the tooltip.
3. Click “Discard images and send text only”; confirm the message sends without attachments, composer clears, images are deleted, and chips disappear.
4. Force a send failure (e.g., mock network error) and retry; confirm images are retained until a successful send.
5. Upload images again, switch back to a multimodal model; send and confirm attachments are included and linked.
6. Use the “Clear” action; verify the confirmation modal and that confirming deletes pending images.

## Notes and rationale

- The single decisive primary action reduces friction and matches the user’s stated intent to proceed with text only.
- We still avoid surprise deletion; it only occurs as part of a deliberate action or explicit clear.
- Storage and policy safeguards remain unchanged and effective.

## Open questions

- Do we still want a client-side timer to prompt discard if images remain unused for N minutes, or rely solely on the 24h orphan cleanup?
- For anonymous users, do we disable uploads entirely or allow ephemeral uploads tied to a session-scoped `draft_id`?

---

Owner: Chat UX / Attachments
Status: Proposed
Priority: Medium
