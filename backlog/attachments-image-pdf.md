# Attachment support (images/PDF)

## Summary

Enable users to attach images/PDFs to chats. Only enable when the selected model supports the modality and only for authenticated users. Track image usage cost.

## Current implementation snapshot

- Models: `lib/utils/openrouter.ts` exposes `pricing.image` and `input_modalities`; `/api/models` returns image/internal_reasoning prices.
- No upload UI or multipart handling detected in chat UI/API. No storage integration for files.
- Pricing: `specs/track-token-usage.md` anticipates image pricing; `/api/usage/costs` already has `image_cost` in selects.
- Auth: Standard middleware exists; use `withProtectedAuth` for uploads.

## Approach (contract)

- Inputs: files (png,jpg,jpeg,webp,pdf), current model id, session id (optional).
- Outputs: signed file URL + metadata; chat accepts message parts including image/file URLs when allowed.
- Errors: unsupported model/modality, invalid mime/size, unauthenticated, rate limit.

## Phases

- [ ] Phase 1 — Capability gating & UI
  - [ ] Toggle an Attach button in chat input only if user is authenticated and model `input_modalities` includes `image` or `file`.
  - [ ] Disabled state tooltip explains requirements.
  - [ ] User verification: button appears only for multimodal models while signed-in.
- [ ] Phase 2 — Secure upload API
  - [ ] Add `POST /api/uploads` with `withProtectedAuth`, validate mimetypes and size by tier, store in Supabase Storage (private).
  - [ ] Return short-lived signed URL + file id + mime + size.
  - [ ] User verification: upload works; unauth gets standardized 401.
- [ ] Phase 3 — Chat payload integration
  - [ ] Extend chat request builder to include `content` parts with `type: 'input_image' | 'file'` using signed URLs for supported models.
  - [ ] Server-side validation blocks attachments when model lacks modality.
  - [ ] User verification: image requests succeed against supported models; blocked with clear error otherwise.
- [ ] Phase 4 — Cost + lifecycle
  - [ ] Attribute and persist `image_cost` when image units are billed; include in usage views.
  - [ ] Background cleanup for orphaned uploads; configurable retention.
  - [ ] User verification: `image_cost` visible for such messages.
- [ ] Phase 5 — Docs
  - [ ] New `/docs/components/chat/attachments.md` and `/docs/api/uploads.md`.

## Clarifying questions

1. Do we prefer Supabase Storage or another store? Any compliance for PDFs/images?
2. Per-tier limits: max file size, count per message?
3. PDF handling: send-as-is vs. OCR/text extraction?
4. Retention policy and user-facing file management needed?
5. Initial allowlist of models for launch?

## Risks

- Leaking signed URLs; enforce short TTL and private buckets.
- Model-specific constraints; need hard validation to avoid provider errors.
- Cost attribution for images might vary by model.

## Success criteria

- UI gates correctly; unauthorized cannot upload.
- End-to-end image chat works on supported models; costs tracked.
