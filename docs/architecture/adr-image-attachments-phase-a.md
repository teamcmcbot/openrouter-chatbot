# ADR: Image Attachments – Phase A (Endpoints & Rate Limits)

Date: 2025-08-17
Status: Accepted
Owners: Platform
Related: `backlog/attachments-image-pdf.md`, `database/schema/02-chat.sql`, `database/schema/05-storage.sql`

## Context

We’re enabling image attachments (images only) with pre-upload, DB linkage, and cost attribution. DB and Storage policies are merged and ready. This ADR locks the Phase A API surface, authentication wrappers, error model, and initial rate limits.

Key decisions (locked):

- Storage: Supabase private bucket `attachments-images`; signed URLs with ~5m TTL.
- Limits: 3 images per user message; Free ≤ 5MB/image; Pro/Enterprise ≤ 10MB/image; anonymous disabled.
- Path strategy: Keep original Storage path on link; DB-only linkage via `message_id`/`session_id`.
- Cost: Image cost is per image using `model_access.image_price`.

## Goals

- Define minimal, secure endpoints to support uploads, viewing, sending, and syncing with attachments.
- Standardize auth via middleware wrappers; no manual auth parsing.
- Establish conservative, tier-aware rate limits to prevent abuse.

## Non-goals

- PDFs, thumbnails, transformations, EXIF stripping, CDN; scheduled cleanup job details.

## Implementation status

- Database and Storage
  - Schema merged into `database/schema/02-chat.sql` with `chat_attachments`, message flags, indexes, RLS (ENABLE). Cost recompute trigger in place.
  - Storage policies added in `database/schema/05-storage.sql` for private bucket `attachments-images` (read/insert/update/delete own). Bucket created.
- Endpoints (backend, protected via middleware)
  - POST `/api/uploads/images` implemented: tier-aware size caps, MIME allowlist, ≤3 pending per draft, Supabase Storage upload, DB row insert. Returns attachment metadata and optional preview signed URL.
  - GET `/api/attachments/:id/signed-url` implemented: ownership + status checks; returns fresh signed URL (~5m TTL).
  - DELETE `/api/attachments/:id` implemented: idempotent soft-delete with best-effort Storage removal; guarded against linked attachments.
  - Existing `/api/chat` updated to mint signed URLs on send; `/api/chat/messages` links attachments and relies on DB recompute for image costs.
- Tests
  - Added backend tests for upload → signed-url → delete flow and rate-limit headers. Mocks stabilized (NextResponse, Web Fetch API, Supabase chainables). Test suite passing.
- Observability
  - Logging hooks added at endpoints (metadata-only) per project standards.

Remaining for Phase A sign-off

- Write concise API docs for the three endpoints (request/response examples, error cases) under `/docs/api/`.
- User verification of behavior and headers in a dev environment.

## Endpoints

All handlers MUST use standardized middleware per `/.github/copilot-instructions.md` and `/lib/middleware/auth.ts`.

### 1) POST /api/uploads/images (Protected)

- Auth: withProtectedAuth
- Content-Type: multipart/form-data
- Fields:
  - image: File (required). Allowed: image/png, image/jpeg, image/webp
  - sessionId: string (optional)
  - draftId: string (required, uuid)
  - originalName: string (optional)
- Behavior:
  - Validate tier limits (Free ≤ 5MB; Pro/Enterprise ≤ 10MB) and MIME allowlist.
  - Enforce cap ≤ 3 for `(user_id, draft_id, session_id?)` pending attachments (status='ready', deleted_at IS NULL).
  - Store in `attachments-images` under server-generated path: `userId/yyyy/mm/dd/drafts/<draftId>/<uuid>.<ext>`.
  - Insert `chat_attachments` row (user-owned). Do not set `message_id` yet.
- 200 Response:
  - { id, mime, size, storagePath, previewUrl?, previewUrlTtlSeconds?, originalName? }
- Errors: 400 invalid input, 401 unauthenticated, 413 too large, 429 rate-limited, 500 storage failure

### 2) GET /api/attachments/:id/signed-url (Protected)

- Auth: withProtectedAuth
- Behavior: Verify ownership and status='ready'. Return a fresh signed URL (TTL ~5m) for preview/history.
- 200 Response: { id, signedUrl, ttlSeconds }
- Errors: 401, 403/404 (ownership), 429, 500

### 3) DELETE /api/attachments/:id (Protected)

- Auth: withProtectedAuth
- Preconditions: Owned by caller AND message_id IS NULL AND status='ready'.
- Behavior: Delete Storage object; soft-delete DB row (status='deleted', deleted_at=now()). Idempotent.
- 204 No Content on success; repeat calls allowed (no-op).
- Errors: 401, 403/404 (ownership), 409 (already linked), 429, 500

### 4) POST /api/chat (existing) – payload additions

- Accept optional attachmentIds: string[] and draftId: string.
- Validate: ownership, MIME allowlist, ≤ 3 count, model supports image modality.
- Build provider request with `{ type: 'input_image', image_url }` using fresh signed URLs (TTL ~5m).
- Do not persist messages or link attachments here.
- Errors: 400, 401, 403, 429, 500

### 5) POST /api/chat/messages (existing sync)

- Persist user and assistant messages.
- Link attachments by setting `message_id` and `session_id` for given `attachmentIds`.
- Update user message: `has_attachments=true`, `attachment_count=n`.
- Cost: rely on recompute trigger to patch image_units/cost.
- Errors: 400, 401, 403/404 (ownership), 409 (linking inconsistency), 429, 500

## Authentication & Security

- Always use withProtectedAuth (uploads, signed-url, delete, chat, sync) or withConversationOwnership where applicable.
- Ownership: `user_id = authContext.user.id`.
- Return 404 for non-owned attachment IDs to avoid leaking existence.
- Signed URLs are never stored; minted on demand; short TTL.

## Rate Limits (initial)

- POST /api/uploads/images: 30/min/user and 120/min/IP; Pro/Enterprise multiplier ×2.
- GET /api/attachments/:id/signed-url: 120/min/user and 300/min/IP; cache-control no-store.
- DELETE /api/attachments/:id: 60/min/user and 120/min/IP.
- POST /api/chat: already governed; keep or set 30/min/user.
- POST /api/chat/messages: 30/min/user.
- Implementation: use existing rate-limit middleware hooks; adjust per tier (features.flags or accessLevel).

## Error Model

- 400: Invalid mime/size, unsupported modality, over cap (>3).
- 401: Unauthenticated (handled by middleware).
- 403/404: Ownership or visibility issues (prefer 404 for non-owned resources).
- 409: Delete when already linked; link conflicts during sync.
- 413: File too large for tier.
- 429: Rate limited.
- 500: Storage/provider/internal errors.

## Observability

- Log events (metadata only): upload, delete, link, signed-url mint. Include user_id, mime, size_bytes, attachment_id, session_id/message_id when present. No content.

## Alternatives considered

- Moving objects on link (rename): deferred for v1 due to complexity and URL invalidation risk.
- Service-key uploads: rejected for v1; prefer user session with RLS ownership.

## Rollout & Backward Compatibility

- New endpoints are additive. Existing chat flow gains optional attachment IDs.
- Frontend must gate UI by auth + model modality; server re-validates regardless of UI state.

## Open items

- Exact per-tier rate-limit factors in middleware.
- Optional pixel-dimension caps.
- Cleanup job scheduling (24h orphans, 30-day retention).
