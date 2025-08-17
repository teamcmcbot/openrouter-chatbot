# Image attachment support (scope: images only)

IMPORTANT most read for AGENT:

- Requirements gathering phase: `Ongoing`
- SQL Database changes: `Not Started`
- Code Implementation: `Not Started`
- Testing: `Not Started`

- We are still in `requirements gathering` phase.
- During requirements gathering, we will conduct back-and-forth discussions on how certain features should be implemented. We will be making decisions based on these discussions and you can document on the discussion and decisions made during this phase.
- Summarize the discussion and decisions made during the requirements gathering phase, in `Discussions Log` below.
- DO NOT make any CODE CHANGE until user explicit confirmation.
- Wait for USER instruction to implement `code change`

## Summary

Enable users to attach images to chats. Only enable when the selected model supports the image modality and only for authenticated users. Track image usage cost. PDF support is explicitly out-of-scope for this phase and will be addressed separately.

## Discussions Log

Document with date and timestamp each discussion point and decision made.

## References

- https://openrouter.ai/docs/features/multimodal/overview
- https://openrouter.ai/docs/features/multimodal/images
  - Out-of-scope for now: https://openrouter.ai/docs/features/multimodal/pdfs

## Base Requirements (images-only)

- UI: Add an Attach Image control in the chat input (supports png, jpg/jpeg, webp).
  - Visible for all users; enabled only when the user is authenticated and the selected model has `image` in `input_modalities`.
  - Disabled state shows a tooltip explaining why (not signed in OR model doesn’t support image input).
  - Preview thumbnail(s) before sending and allow removing an image prior to send.
  - P0: button-based picker. P1 (optional enhancements): paste and drag-and-drop.
- Server/API: Provide a protected upload endpoint that validates mime/size by tier and stores in a private bucket.
- Chat integration: When sending a message, include `content` parts with `type: "input_image"` using a short-lived signed URL for each image when the model supports images.
- Pricing/usage: Attribute an `image_cost` per request when images are included.
- Security: Use short-lived signed URLs; keep originals in private storage; validate model modality server-side.

## Decisions so far (images-only)

- Storage preference: Supabase Storage (private bucket, signed URLs). Bucket: `attachments-images`. Region: Supabase primary DB region (Southeast Asia/Singapore) for locality.
- Limits: Max 3 images per user message. Size caps per tier: Free ≤ 5MB/image, Pro ≤ 10MB/image. Anonymous users: image uploads disabled.
- Flow: Prefer pre-upload via `POST /api/uploads/images` (multipart); avoid base64-in-chat body due to payload bloat and duplication.
- Cost: Track image units per exchange and compute `image_cost` using `pricing.image` when provided by `/api/models`.
- Histories: Lazy-load attachments; generate signed URLs on demand for viewing, don’t persist signed URLs.

## OpenRouter Pricing

- Images: Typically priced per image or as input tokens

```json
"pricing": {
        "prompt": "0.0000001",
        "completion": "0.0000002",
        "request": "0",
        "image": "0",
        "web_search": "0",
        "internal_reasoning": "0"
      },
```

Notes:

- Image pricing may be per image unit; if not present for a model, treat as 0 or fallback to documented rate.
- We’ll snapshot the pricing source per exchange to keep historical accuracy.

## Current implementation snapshot

- Models: `lib/utils/openrouter.ts` exposes `pricing.image` and `input_modalities`; `/api/models` returns image/internal_reasoning prices.
- No upload UI or multipart handling detected in chat UI/API. No storage integration for files.
- Pricing: `specs/track-token-usage.md` anticipates image pricing; `/api/usage/costs` already has `image_cost` in selects.
- Auth: Standard middleware exists; use `withProtectedAuth` for uploads.

## Storage costs and alternatives (overview)

- Supabase Storage (recommended to start)
  - Pros: Integrated auth/RLS patterns, simple SDK, signed URLs, easy local/dev.
  - Costs: Storage is billed per GB-month; bandwidth (egress) per GB. Exact rates vary; confirm in project billing. Roughly, 30 MB/message (3×10 MB) retained for 30 days implies ~0.03 GB-month per message. Egress occurs when viewing/LLM fetches signed URLs.
  - Consider image size caps and retention to control costs.
- Alternatives
  - Cloudflare R2: Low storage cost, egress-friendly in-Cloudflare; needs auth/signing integration and custom SDK wiring.
  - AWS S3: Mature and flexible; more setup (IAM, presigned URLs, VPC, lifecycle policies).
  - Upload services (UploadThing, etc.): Simplify client-to-bucket flows; adds a vendor, pricing tradeoffs.
  - Recommendation: Start with Supabase for velocity; revisit R2/S3 if costs scale.

### Signed URL TTL (what it does)

- Signed URLs allow temporary access to a private file.
- TTL (e.g., 5 minutes) is the expiration window; after that, the URL no longer works and a new one must be generated.
- Purpose: minimize exposure if a link leaks; limit external fetch time (OpenRouter/model and the app must fetch within TTL).
- Implementation: we never store signed URLs in DB; generate on demand for two contexts:
  1. Provider fetch: when calling OpenRouter, we include fresh URLs for the model to fetch the images. These must be valid during the call window (5 minutes is sufficient).
  2. History preview: when rendering chat history, the UI requests a fresh signed URL per image; these are separate from provider URLs and have their own TTL.

## Approach (contract)

- Inputs
  - File: png | jpg | jpeg | webp
  - Context: current model id, conversation/session id (optional for association), user auth context.
- Outputs
  - Upload response: `{ id, bucket, path, mime, size, signedUrl, signedUrlExpiresAt }`
  - Chat send: message parts include `{ type: 'input_image', image_url: string }` pointing to a short-lived URL.
- Errors
  - Unsupported model/modality, invalid mime/size, unauthenticated, per-tier limits exceeded, rate limited, storage failure.
- Non-goals (this phase)
  - PDFs, OCR, server-side transforms, thumbnails generation pipeline, EXIF stripping (documented risk below).

## Database schema design (proposal)

- New table: `public.chat_attachments`

  - Columns
    - `id` UUID PK (default `gen_random_uuid()`)
    - `user_id` UUID NOT NULL REFERENCES `public.profiles(id)` ON DELETE CASCADE
    - `session_id` TEXT NULL REFERENCES `public.chat_sessions(id)` ON DELETE CASCADE  
      (nullable to support pre-upload; will be set during message sync)
    - `message_id` TEXT NULL REFERENCES `public.chat_messages(id)` ON DELETE CASCADE  
      (nullable until `/api/chat/messages` persists the user message and links attachments)
    - `kind` TEXT NOT NULL CHECK (kind IN ('image'))
    - `mime` TEXT NOT NULL CHECK (mime IN ('image/png','image/jpeg','image/webp'))
    - `size_bytes` BIGINT NOT NULL CHECK (size_bytes > 0)
    - `storage_bucket` TEXT NOT NULL DEFAULT 'attachments-images'
  - `storage_path` TEXT NOT NULL -- e.g., userId/yyyy/mm/dd/uuid.ext
  - `draft_id` TEXT NULL -- groups pre-uploaded images per in-flight message (composer draft)
    - `width` INTEGER NULL, `height` INTEGER NULL (optional, if we can detect)
    - `checksum` TEXT NULL (optional)
    - `status` TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','deleted'))
    - `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW(), `deleted_at` TIMESTAMPTZ NULL
  - Indexes
  - `(message_id)`, `(session_id)`, `(user_id, created_at DESC)`
  - Consider `(user_id, session_id, draft_id)` to efficiently enforce draft-level caps and queries
  - RLS
    - Enable RLS; allow users to SELECT/INSERT/DELETE their own rows via `user_id` and session ownership, mirroring `chat_messages` policies.

- Columns to add on `public.chat_messages`

  - `has_attachments` BOOLEAN NOT NULL DEFAULT false
  - `attachment_count` INTEGER NOT NULL DEFAULT 0 CHECK (attachment_count >= 0 AND attachment_count <= 3)
  - Rationale: Fast querying/summarization in lists; detailed records live in `chat_attachments`.

- Usage/costs

  - Use existing `public.message_token_costs` fields: `image_units`, `image_unit_price`, `image_cost`.
  - Populate `image_units` with the number of images included in the exchange when inserting the assistant message’s cost row.

- Migration path
  - Create a patch at `database/patches/image-attachments/001_schema.sql` to add table + columns + RLS + indexes.
  - If adopting `draft_id`, include it in the patch (nullable) and backfill NULL for existing rows.
  - After sign-off, merge into `database/schema/02-chat.sql` and related files per project rules.

## Phases (images-only)

- [ ] Phase 1 — Capability gating & UI (images)
  - [ ] Attach Image button appears in chat input; enabled only when authenticated AND selected model has `image` in `input_modalities`.
  - [ ] Disabled tooltip variants:
    - Not signed in: "Sign in to attach images"
    - Model unsupported: "Selected model doesn’t support image input"
  - [ ] Basic preview and remove before sending (no transforms).
  - [ ] User verification
    - While signed out on a non-image model: button visible but disabled with the sign-in tooltip.
    - While signed in on a non-image model: button disabled with modality tooltip.
    - While signed in on an image-capable model: button enabled.
- [ ] Phase 2 — Secure upload API (protected)
  - [ ] Add `POST /api/uploads/images` with `withProtectedAuth`.
  - [ ] Accept `multipart/form-data` with field `image`; validate mime/size by tier.
  - [ ] Store in Supabase Storage private bucket (e.g., `attachments-images/` by user id).
  - [ ] Create `chat_attachments` row and return `{ id, mime, size, storagePath }` plus an optional short-lived `signedUrl` (TTL ~5 minutes) for immediate preview.
  - [ ] User verification
    - Authenticated upload succeeds and returns a valid signed URL that fetches the binary.
    - Unauthenticated call returns standardized 401 from middleware.
    - Oversized or invalid mime returns 4xx with clear message.
- [ ] Phase 3 — Chat payload integration (images)
  - [ ] Extend chat request builder to attach `{ type: 'input_image', image_url }` message parts when images are present and model supports images.
  - [ ] Server-side validation blocks sending when the selected model lacks `image` modality.
  - [ ] User verification
    - Sending with an image on a supported model succeeds.
    - Sending with an image on an unsupported model is blocked with a clear error.
- [ ] Phase 4 — Cost attribution + lifecycle
  - [ ] Attribute and persist `image_cost` per request using `pricing.image` × image count (fallback to 0 if not provided).
  - [ ] Expose `image_cost` in existing usage views (`/api/usage/costs`).
  - [ ] Basic cleanup for orphaned uploads (e.g., files not linked to a message after 24h) and retention setting (e.g., 30 days).
  - [ ] User verification
    - Requests with images show non-zero `image_cost` when pricing configured.
    - Orphans older than threshold are removed by job/script.
- [ ] Phase 5 — Docs
  - [ ] Add `/docs/components/chat/image-attachments.md` and `/docs/api/uploads-images.md`.

## Clarifying questions

1. Storage: Confirm Supabase Storage (private bucket) for images and desired bucket name/region. Any compliance constraints (PII, EXIF)?
2. Limits: What are per-tier max file size and max images-per-message? Suggested defaults: Free=5MB & 1 image; Pro=10MB & 3 images.
3. URL TTL: Preferred signed URL lifetime for inference fetch (suggest 5 minutes). Any CDN requirements?
4. Retention: How long should we keep images? Proposed 30 days, plus early cleanup for orphans (>24h not linked to a message).
5. Launch scope: Initial allowlist of image-capable models to enable by default (e.g., OpenAI GPT-4o family, Gemini vision, Claude 3.5 Sonnet vision variants, etc.).

## Risks

- Leaking signed URLs; enforce short TTL and private buckets; sign only on demand for the sender.
- Model-specific constraints; add validation to avoid provider errors (dimensions, count limits).
- Cost attribution for images may vary by model; prefer actual provider usage when available, else fallback formula.
- EXIF/metadata leakage; optionally strip on upload (out-of-scope now).

## Success criteria

- UI gates correctly; unauthorized cannot upload.
- End-to-end image chat works on supported models; costs tracked.
- No public exposure of originals; only short-lived signed URLs are used in requests.

---

## Implementation notes (draft)

- Auth: Use `withProtectedAuth` for `POST /api/uploads/images`; no manual auth parsing.
- Validation: Check selected model’s `input_modalities` before enabling UI and before sending server-side.
- Storage: Private bucket (e.g., `attachments-images`). Store path: `userId/yyyy/mm/dd/<uuid>.<ext>`.
- Response: Signed URL TTL ~5m, renewed on-demand at send time if expired.
- Pricing: Use `lib/utils/openrouter.ts` `pricing.image` when available. Persist `image_cost` alongside token costs.
- Telemetry: Count images per request; log mime/size for observability (no content).
- Future (not in this phase): paste/drag-drop, EXIF stripping, CDN/resizing, content scanning.

## POST /api/uploads/images — detailed spec

Purpose

- Pre-upload a single image to private storage and create a `chat_attachments` row owned by the user. Called once per image; the UI can run multiple calls in parallel for multi-select.

When it’s called

- Immediately after the user adds image(s) in the composer:
  - File picker (desktop/mobile): If multiple are selected at once, iterate and call once per file with a small concurrency cap (e.g., 3–5).
  - Clipboard paste (optional P1): Detect image blobs on paste and pre-upload each.
  - Drag-and-drop (optional P1): Same as file picker; one call per file.

Request

- Method: POST
- Path: `/api/uploads/images`
- Auth: Protected (withProtectedAuth)
- Content-Type: `multipart/form-data`
- Fields:
  - `image`: File (required). Allowed MIME: `image/png`, `image/jpeg`, `image/webp`.
  - `sessionId`: string (optional for brand-new chats; required when composing inside an existing conversation). If present, set on the attachment; otherwise `session_id` remains NULL until sync.
  - `draftId`: string (required, uuid). Identifies the current compose draft so the server can enforce the ≤ 3 images per message cap pre-persistence.
  - `originalName`: string (optional). For display purposes only; not used in storage path.

Validation

- Enforce size caps by tier: Free ≤ 5MB, Pro/Enterprise ≤ 10MB.
- Enforce MIME allowlist; optional magic-byte sniff in a later phase.
- Per-message cap at upload: Count attachments for `(user_id = auth.uid(), draft_id = :draftId, session_id = :sessionId OR NULL)` with `status='ready' AND deleted_at IS NULL`; reject the 4th with 400.

Response (200)
{
id: string, // attachment UUID
mime: string, // image/jpeg | image/png | image/webp
size: number, // bytes
storagePath: string, // opaque bucket-relative path (for server/internal use)
previewUrl?: string, // short-lived signed URL for immediate UI preview
previewUrlTtlSeconds?: number, // e.g., 300
originalName?: string // echo of provided original name, if any
}

Errors

- 400: invalid mime or size, missing file
- 401: unauthenticated (handled by middleware)
- 413: file too large for tier
- 429: rate-limited
- 500: storage failure

Client behavior

- On success, the composer adds a “pending attachment” entry containing the returned `id`, `mime`, `size`, optional `previewUrl`, and `originalName`. The composer keeps an ordered list for display and sending.
- The client does NOT send `storagePath` to control server behavior. Subsequent API calls send only `attachmentIds: string[]`.

Security

- Server ignores client-supplied paths. At `/api/chat` and `/api/chat/messages`, the server loads attachments by ID from the database, re-checks ownership (user_id = auth.uid()), validates MIME/count, and mints fresh signed URLs as needed. This prevents path injection.
- A user cannot reference another user’s attachments; ownership checks will 403/404.

Multi-select and mobile UX

- Multi-select: input[type="file"] with `multiple`; upload each file in parallel with progress and cancel/remove controls.
- Mobile: Use the OS-native picker (photos/camera). Same endpoint and flow.
- Clipboard paste: Optional P1; if supported, capture images on paste and pre-upload per image.

Interaction with `/api/chat` and `/api/chat/messages`

- `/api/chat` (send): payload includes `attachmentIds: string[]` and `draftId` (plus `sessionId` or conversation reference). The server:
  - Fetches those attachments by ID.
  - Verifies ownership, MIME allowlist, same `draftId` (and same `sessionId` when provided), and count ≤ 3.
  - Generates short-lived signed URLs and adds `{ type: 'input_image', image_url }` parts to the provider request.
  - Does not link attachments to a message here (fits current app behavior).
- `/api/chat/messages` (post-completion sync): payload also includes the same `attachmentIds` and the `draftId`. The server:
  - Persists user and assistant messages.
  - Sets `has_attachments=true` and `attachment_count=n` on the user message.
  - Links attachments by updating `message_id` (and `session_id`) on `chat_attachments`; optionally clear or keep `draft_id` for audit.
  - Records `image_units`/`image_cost` on the assistant message.

Naming and ordering

- Name for display: Optionally store `original_name` on upload for UI. If absent, the UI may label as IMAGE_01, IMAGE_02, etc. The storage path is server-generated and never derived from the client name.
- Ordering: The UI preserves order by the sequence of `attachmentIds`. If server-side persistence of order is needed, add an optional `position INTEGER` to `chat_attachments` and set it during the sync link step.

Notes

- `session_id` and `message_id` remain NULL at upload time by design to support pre-upload without a persisted message. They’re linked during the sync step.

## Solution Architecture Plan (images-only) — for next AGENT

Note: This section is for planning and handover. Do NOT implement until each checklist is signed off.

### Database and Supabase setup

- Proposed objects
  - Table `public.chat_attachments` for image metadata and storage pointers (private bucket path).
  - Columns on `public.chat_messages`: `has_attachments` (bool), `attachment_count` (int, 0–3).
  - Indexes: `(message_id)`, `(session_id)`, `(user_id, created_at DESC)` on `chat_attachments`.
  - RLS on `chat_attachments`: users can select/insert/update/delete their own rows.
  - Storage: Supabase private bucket `attachments-images` in Singapore region.
- Dependencies and functions
  - Session stats: no change required; attachments don’t affect token counts.
  - Costs: continue using `public.message_token_costs`; populate `image_units`, `image_unit_price`, `image_cost` when assistant replies.
  - Data access: consider adding a helper view or API join to fetch attachments per message for histories.
- Migrations/patches
  - Create SQL patch under `database/patches/image-attachments/` that: creates `chat_attachments`, adds columns to `chat_messages`, adds indexes, RLS.
  - Backfill: set `has_attachments=false`, `attachment_count=0` for existing messages.
- Supabase pre-setup
  - Create bucket `attachments-images` (private) in Supabase UI/CLI.
  - Confirm service role has access; ensure no public policy on the bucket.
  - Configure scheduled job for retention (30 days default; Enterprise 90 days) and orphan cleanup (24h).

Checklist — Database

- [ ] Patch SQL created and reviewed
- [ ] RLS policies validated (select/insert/update/delete own only)
- [ ] Bucket created (private), region confirmed (Singapore)
- [ ] Retention/orphan cleanup job spec written
- [ ] Backfill strategy confirmed (all zero by default)

### Frontend/UI

- Composer UI
  - Attach Image button, gated: visible; enabled only when signed in and model supports `image` modality; disabled tooltip variants.
  - File picker for png/jpeg/webp; enforce max 3 files and per-tier size caps (Free 5MB, Pro 10MB).
  - Preview thumbnails with remove controls pre-send.
  - P1: paste and drag-and-drop (out-of-scope for first pass).
- Display in chat
  - User messages: show inline image thumbnails inside the bubble; clicking opens full-size in a modal (fetched via signed URL).
  - Assistant messages: render inline images if present in response (future); not required for initial image-input-only.
- State management
  - Local component state for selected files during composition.
  - After successful pre-upload, store only attachment IDs and minimal metadata (mime, size, preview URL) in the composer state.
  - Do not store binary data or signed URLs in localStorage; signed URLs are minted on-demand.
  - Hard cap: Prevent selecting/keeping more than 3 attachments in the composer at any time. If the user attempts to add more, show a tooltip/toast and ignore extras. Disable the Attach control when the cap is reached.
  - Draft grouping: Generate a `draftId` (uuid) when the user starts composing a new message. Include this `draftId` (and the current `sessionId` if available) with every image upload for that compose. Reset/renew the `draftId` after a successful send/sync or when the composer is cleared.
- History
  - Lazy-load thumbnails via GET `/api/attachments/:id/signed-url` when scrolled into view.
  - Show expired placeholder when retention has removed originals.

Checklist — Frontend

- [ ] Gated Attach button and disabled tooltips
- [ ] File picker + client-side caps (3 files, size per tier)
- [ ] Preview with remove
- [ ] Enforce 3-attachment cap in composer (disable add and reject extras)
- [ ] Send pipeline passes attachment IDs
- [ ] History view lazy-load with signed URL endpoint
- [ ] Expired placeholder UX

### Backend/API

- New endpoints (protected auth)
  - POST `/api/uploads/images`: multipart upload; validate mime and per-tier size; store in private bucket; insert `chat_attachments`; return `{ id, mime, size, storagePath }` and optional preview signed URL (TTL ~5m).
  - GET `/api/attachments/:id/signed-url`: verify ownership and status; return fresh signed URL (TTL ~5m) for viewing.
- Existing chat send endpoint (`/api/chat`)
  - Accept optional `attachmentIds: string[]` in the user message payload.
  - Validate: user owns the attachments, count ≤ 3, mime is allowed, model supports image input.
  - Regenerate fresh signed URLs for provider call and include them as `{ type: 'input_image', image_url }` parts.
  - Do not persist messages or link attachments here (fits current app: persistence happens after completion).
- Message sync endpoint (post-completion) — current implementation
  - After the model responds, the client calls `/api/chat/messages` to persist both the user and assistant messages.
  - This sync request should include the same `attachmentIds: string[]` so the server can:
    - Insert the user message row and obtain `message_id` (and `session_id` if needed).
    - Set `has_attachments=true`, `attachment_count=n` on that user message.
    - Link pre-uploaded attachments by updating their `message_id` and `session_id` in `chat_attachments`.
  - On assistant message persistence, write to `message_token_costs` with `image_units=n` and compute `image_cost` from pricing.

Upload abuse prevention (server-side)

- Rate limit: Apply per-user and per-IP rate limiting to POST `/api/uploads/images` (e.g., 30 requests/5 minutes per user; tune per tier). Return 429 when exceeded.
- Pending-attachment quota: Enforce a per-user ceiling on unlinked attachments (e.g., max 15 rows where `message_id IS NULL` and age < 24h). Reject with 429/400 once exceeded to curb spam and storage growth.
- Size/MIME enforcement: Already applied at upload; reject over-limit size or disallowed MIME with 4xx.
- Ownership: Upload does not accept `messageId`; any attempt to pass it is ignored. Linking occurs only during `/api/chat/messages` sync, which rechecks ownership and session before updating `message_id`/`session_id`.
- Hard cap at send: `/api/chat` rejects payloads with more than 3 `attachmentIds` regardless of what was uploaded.
- Retry behavior
  - Reuse attachment IDs; remint provider signed URLs; block retry if any attachment missing/expired.
- Upload timing
  - Pre-upload recommended (before Send): more reliable and avoids base64 payload bloat.

Checklist — Backend

- [ ] Upload endpoint with auth + validation
- [ ] Signed URL endpoint for viewing
- [ ] Chat send accepts attachment IDs and validates modality/ownership
- [ ] Cost tracking writes image_units/image_cost
- [ ] Retry flow re-mints URLs; handles missing/expired attachments

### Security considerations

- Authentication/authorization
  - Use standardized `withProtectedAuth` middleware for all upload/view routes; block anonymous users.
  - Verify ownership on every access (user_id must match).
- Input validation
  - Enforce MIME whitelist and size caps by tier; optional magic-byte sniffing to prevent spoofing.
  - Optional pixel-dimension caps to mitigate oversized images (DoS risk).
- Least exposure
  - Private bucket only; signed URLs short-lived (~5m); never store signed URLs in DB.
  - Server-side validation of model modality; don’t rely on UI gating alone.
- Abuse prevention
  - Rate limit upload and signed-URL endpoints per user/session.
  - Orphan cleanup after 24h and 30/90-day retention reduce storage abuse.
- Audit/logging
  - Log attachment create/delete events (no content); include mime, size, user, session.

Checklist — Security

- [ ] RLS policies verified and tested
- [ ] MIME and size checks in place
- [ ] Rate limiting configured on upload/view endpoints
- [ ] Ownership checks on all reads/writes
- [ ] Short TTL signed URLs, no DB persistence of URLs

### OpenRouter integration

- Request building
  - For image-capable models, include content parts `{ type: 'input_image', image_url }` using fresh signed URLs.
  - Validate model `input_modalities` server-side; block if unsupported.
- Pricing and cost attribution
  - Read `pricing.image` for selected model; set `image_units = attachment_count` and compute `image_cost`.
  - Snapshot pricing source per request for historical accuracy.
- Edge cases
  - If provider rejects due to URL expiry, re-mint and retry once internally (bounded).
  - If model requires different payload shape, add mapping layer per model family.

Checklist — OpenRouter

- [ ] Server-side modality validation
- [ ] Content parts include `input_image` with fresh signed URLs
- [ ] Image cost calculation integrated
- [ ] Error handling for expired URLs and provider errors

### Decisions locked vs pending

- Locked
  - Storage: Supabase private bucket `attachments-images` (Singapore), signed URLs (~5m TTL).
  - Limits: 3 images per message; Free ≤ 5MB/image; Pro/Enterprise ≤ 10MB/image; anonymous disabled.
  - Retention: default 30 days; orphans deleted after 24h; Enterprise override (e.g., 90 days).
  - Flow: pre-upload images before Send; history lazy-loading with on-demand signed URLs.
- Pending
  - Exact daily/hourly rate limits for upload and signed URL endpoints.
  - Whether to add pixel-dimension caps (e.g., max 4000×4000) and thumbnail generation in a later phase.
  - UI: final decision on inline vs attachment-style rendering for large images (current plan: inline thumbnail + modal).
  - Cleanup implementation: cron/Edge scheduled function specifics and tier parameterization.

Sign-off gates

- [ ] Database plan approved
- [ ] Frontend plan approved
- [ ] Backend/API plan approved
- [ ] Security plan approved
- [ ] OpenRouter integration plan approved

## Message flow (recommended)

1. UI gating: If signed in and model supports images, enable the Attach Image button; allow up to 3 selections.
2. Pre-upload: Client sends each image via `POST /api/uploads/images` (multipart). Backend validates and stores in Supabase; creates `chat_attachments` rows owned by the user and returns attachment IDs (and optional preview `signedUrl`). Note: `session_id` and `message_id` remain NULL at this stage to support pre-upload; they will be linked during the later sync step.
3. Compose message: Client assembles message content with text and an array of attachment IDs.
4. Send: Client calls `/api/chat` (send endpoint) with message text + attachment IDs.
5. Server prepare: Server loads attachments by ID, verifies ownership and modality, generates fresh signed URLs (TTL ~5m), and builds OpenRouter `content` parts with `{ type: 'input_image', image_url }`.
6. Call provider: Server calls OpenRouter and returns the completion to the client. No DB linkage of attachments is required yet.
7. Sync to DB (current flow): Client calls `/api/chat/messages` to persist the conversation and includes the same `attachmentIds`. The server inserts user/assistant messages, sets `has_attachments`/`attachment_count` on the user message, and links `chat_attachments` with `message_id` (and `session_id`). It also records `image_units` and `image_cost` for the assistant message.
8. Display: Client renders message; images are shown using on-demand signed URLs (fetched via a small `/api/attachments/:id/signed-url` route or embedded at send time if still valid).

Notes on base64-in-request: Acceptable as a fallback for very small images, but increases payload and CPU, complicates retries. Pre-upload is preferred.

### Retry behavior with image attachments

- On retry (e.g., after a failed completion), we do not re-upload images. We re-use the same `chat_attachments` by ID.
- Before re-calling OpenRouter, the server re-validates ownership and regenerates fresh signed URLs for each attachment (previous provider URLs may have expired).
- UI: The Retry button triggers the same send pipeline with the previous message text and attachment IDs; server handles URL re-minting transparently.
- If an attachment was deleted or expired by retention, retry is blocked with a clear error and guidance to re-upload.

## Chat history rendering policy

- Do not store signed URLs; they expire. Store only storage path + metadata.
- When a history view needs to render a thumbnail/full image, request a fresh signed URL per attachment. Consider lazy-loading (viewport-based) to avoid unnecessary egress.
- If an attachment is deleted or expired by retention, show a clear placeholder state instead of breaking the message render.

### Retention policy (what it means)

- Files are kept for 30 days by default, then deleted by a cleanup job. Chat text and attachment metadata remain.
- In history, images older than 30 days won’t render; show an "attachment expired" placeholder with basic metadata.
- Orphan cleanup: if an uploaded file isn’t linked to a message within 24h, it’s deleted to reduce storage cost.

Tier-based retention

- Default: 30 days.
- Enterprise: configurable (e.g., 90 days). We’ll parameterize the cleanup job based on user tier so organizations on Enterprise retain attachments longer.
- UI: Surface retention policy in docs/settings; expired attachments get the same placeholder treatment regardless of tier.
