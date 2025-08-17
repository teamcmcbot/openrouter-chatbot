# Image attachment support (scope: images only)

IMPORTANT must read for AGENT:

- Requirements gathering phase: `Completed for Phase A`
- SQL Database changes: `Completed (schema merged + storage policies)`
- Code Implementation: `Completed (Phase A backend)`
- Testing: `Completed (Phase A backend tests green)`

- Phase A planning is implemented on the backend. Frontend/UI remains for later phases. Continue to document decisions below.

## Summary

Enable users to attach images to chats. Only enable when the selected model supports the image modality and only for authenticated users. Track image usage cost. PDF support is explicitly out-of-scope for this phase and will be addressed separately.

## Discussions Log

Document with date and timestamp each discussion point and decision made.

### 2025-08-17 — DB patches review (images-only)

- Scope/phase: Still in requirements gathering — no code changes made. Reviewed `/database/patches/image-attachments/001_schema.sql` and `002_cost_function_image_units.sql` against base schema (`/database/schema/01-users.sql`, `02-chat.sql`, `03-models.sql`, `04-system.sql`).
- Dependencies check:
  - `public.chat_attachments` FK references: `public.profiles(id)` [UUID], `public.chat_sessions(id)` [TEXT], `public.chat_messages(id)` [TEXT] — types align with current schema. `ON DELETE CASCADE` is reasonable for attachments (note: file deletion in storage will rely on a separate cleanup job).
  - Cost function uses `public.model_access.image_price` and `public.message_token_costs` — both exist in schema and types are compatible (prices stored as VARCHAR; cast occurs in SQL).
  - Trigger `after_assistant_message_cost` already exists; `CREATE OR REPLACE FUNCTION` keeps trigger wiring intact.
- Gaps/risks identified:
  1. Missing `draft_id` on `chat_attachments` — proposal and flows expect it for per-draft caps and grouping. Recommend adding `draft_id TEXT NULL` plus an index like `(user_id, session_id, draft_id)` and using it in server-side enforcement.
  2. RLS hardening for updates — current policies allow UPDATE when `user_id = auth.uid()`. Consider a stricter `WITH CHECK` ensuring any non-null `session_id`/`message_id` being set actually belongs to the same user via session ownership (mirror `chat_messages` policy semantics) to prevent cross-session linking.
  3. Storage path uniqueness — consider `UNIQUE(storage_bucket, storage_path)` to avoid accidental duplicates/overwrites.
  4. Indexes for operational queries — add helpful indexes: `(status, deleted_at)` for cleanup jobs; `(message_id, status)` partial on `status='ready'` for quick counts; `(user_id, session_id, draft_id, status)` for pre-upload cap checks.
  5. Cost timing dependency — `calculate_and_record_message_cost()` derives `image_units` by counting `chat_attachments WHERE message_id = NEW.user_message_id`. This assumes attachments are linked to the user message before the assistant message insert fires. If the server persists the assistant message first (or links attachments after), image_units will be 0. Options:
     - Enforce server ordering: link attachments to the user message before inserting the assistant message.
     - Or add a secondary pathway: a trigger/function on `chat_attachments` (when `message_id` transitions from NULL->NOT NULL) to recompute/patch the cost row for the corresponding assistant message. Also useful for retries.
  6. Extension availability — `gen_random_uuid()` is used widely; ensure `pgcrypto` (or `pgcrypto`-equivalent) is enabled in the target Supabase project (usually on by default).
  7. Message columns backfill — new `chat_messages.has_attachments`/`attachment_count` default to false/0; no backfill required, but server must set these during sync for historical accuracy. Consider a lightweight partial index on `has_attachments` if used in listing filters.
  8. Cleanup lifecycle — FKs cascade delete DB rows, but storage objects need an external job. Ensure retention/orphan cleanup job spec covers deleting files from the `attachments-images` private bucket and removing stale DB rows.
- Future analytics ideas (no implementation yet):
  - Views: `v_image_usage_daily` aggregating per-user/session/day counts and total `size_bytes` (from `chat_attachments`) and costs (join `message_token_costs`). Also a per-model view to see image usage by model.
  - Metrics to expose: images uploaded vs. images actually sent, average image size, mime distribution, attachment retry rate, retention deletions per day, per-tier image usage and size distribution.
  - Optional columns: if we want per-request size accounting, consider recording `image_bytes_used` in `message_token_costs` via a join at cost time; alternatively handle purely in analytics views.
  - Audit: a minimal `attachment_audit_log` (uploaded | linked | viewed | deleted) could help abuse investigations; keep payloads metadata-only (mime/size), no content.
- Open questions for sign-off:
  - Do we add `draft_id` in v1 schema patch to enforce the ≤3 images cap pre-persistence, or keep it app-only for now?
  - Preferred approach for cost recomputation if linking is asynchronous: enforce server ordering or add a recompute trigger on attachment link?
  - Any desire for `UNIQUE(storage_bucket, storage_path)` and stricter RLS `WITH CHECK` constraints in v1, or defer to a follow-up patch?

### 2025-08-17 — Clarifications: pgcrypto, cost recompute, TTL, storage linkage

- pgcrypto purpose: We added `CREATE EXTENSION IF NOT EXISTS pgcrypto` because our schema uses `gen_random_uuid()` to generate UUID primary keys (e.g., `chat_attachments.id`). This extension provides that function in Postgres/Supabase. If your Supabase project already has pgcrypto enabled (typical), the statement is a no-op; otherwise it ensures UUID generation works. It’s unrelated to image content—only to generating IDs server-side.
- Cost recompute strategy: We kept `calculate_and_record_message_cost()` (triggered on assistant insert) and added `recompute_image_cost_for_user_message()` plus a trigger on `chat_attachments` when `message_id` is linked. Reason: depending on server flow, attachments might link after the assistant message is inserted; in that case the original trigger sees 0 images. The recompute path updates `message_token_costs` once attachments are linked, and adjusts daily cost by delta to avoid double-counting. If we can guarantee ordering (link attachments before assistant insert), we could simplify and drop the recompute path later.
- TTL vs retention:
  - TTL refers to short-lived signed URLs for accessing a private object. TTL is implemented at signed-URL generation time via the Supabase API (client/server SDK), not in SQL. It does NOT delete the file; it just expires the temporary access link.
  - Retention/cleanup refers to deleting the actual file from storage (and cleaning its DB row) after a period (e.g., 30 days) or when orphaned (>24h unlinked). This typically needs a scheduled job/edge function, not handled by signed URL TTL. Our plan assumes signed URL TTL ~5m for access, plus a separate retention/orphan cleanup job for deletion.
- Storage linkage: The binary image lives in Supabase Storage (private bucket `attachments-images`) at `storage_path`. The DB row in `public.chat_attachments` stores metadata and the pointer (`storage_bucket`, `storage_path`). They’re linked by that path; we never store the signed URL. TTL applies to the signed URL we mint on-demand; it does not live in the DB. The DB row’s `status/deleted_at` can reflect logical deletion; the scheduled cleanup deletes the actual storage object.
- Pending: Decide whether to keep the recompute path or enforce strict server ordering; confirm retention job approach and thresholds; confirm keeping `pgcrypto` line (or manage extension separately).

### 2025-08-17 — Pricing semantics and DB flow confirmation (images-only)

- Image pricing semantics (OpenRouter):

  - Model pages list image pricing like "$5.16/K input imgs" (e.g., google/gemini-2.5-pro). "K" means per 1,000 images; price per single image is that number divided by 1000. Example: $5.16/1,000 images = $0.00516 per image.
  - The `/chat/completions` response does not include `image_tokens`; it only returns `usage.prompt_tokens`, `usage.completion_tokens`, and `usage.total_tokens`. Images are not separately itemized there.
  - If you need authoritative cost and media counts, use `/api/v1/generation?id=...` which returns `total_cost` and `num_media_prompt`. We’ll continue to compute image cost locally as `image_units * model_access.image_price` and can optionally reconcile with `total_cost` later.
  - Sources: OpenRouter Responses & Generation docs, and model pricing page for Gemini 2.5 Pro.

- Server/DB flow for `/api/chat/messages` (sync after provider response):

  1. Insert `chat_sessions` if new.
  2. Insert user + assistant rows into `chat_messages`.
  3. Link `chat_attachments` by setting `session_id` and `message_id` (the user message id), and set `has_attachments=true`, `attachment_count=n` on the user message.
  4. Cost handling: since attachment linkage happens after assistant insert, rely on the recompute trigger to update `message_token_costs` with `image_units`, `image_cost = image_units * image_price`, and `total_cost = prompt_cost + completion_cost + image_cost`.

- Decision for this phase:

  - Keep recompute trigger enabled (safety net) because linkage occurs post-assistant insert in our sync flow. We will still aim to link before assistant insert in a future optimization and can remove the recompute later.
  - Signed URL TTL remains ~5 minutes; retention = 30 days; orphan cleanup at >24h.

- Next steps (no code yet):
  - Implement `/api/uploads/images` (protected) and `/api/attachments/:id/signed-url` (protected).
  - Ensure `/api/chat` validates image-capable model and injects `{ type: 'input_image', image_url }` parts.
  - Ensure `/api/chat/messages` links attachments and lets DB recompute image costs via the existing trigger.

### 2025-08-17 — Cost accounting stance (no Generation API)

### 2025-08-17 — Status update: DB patches applied + schema merged

- Ran `/database/patches/image-attachments/001_schema.sql` and `002_cost_function_image_units.sql` successfully.
- Merged patch content into canonical schema:
  - `database/schema/02-chat.sql` now includes `chat_attachments` table, RLS/policies, indexes, and the two message columns (`has_attachments`, `attachment_count` with CHECK ≤ 3). The base function `calculate_and_record_message_cost()` remains per-token only; image costs are reconciled via `recompute_image_cost_for_user_message()` and its trigger.
  - Added `database/schema/05-storage.sql` with idempotent DO blocks creating Storage RLS policies for the private bucket `attachments-images` (read/insert/delete/update own).
- Supabase: created private bucket `attachments-images` and applied the above Storage policies (confirmed via dashboard/SQL). We’re keeping `ENABLE RLS` (no FORCE) on `chat_attachments`.
- Optional hardening (deferred): FORCE RLS on `chat_attachments`; trigger on status flip to `ready`; retention/orphan cleanup job (outside DB).

Result: Database layer is ready for implementation; schema provides all required tables, constraints, policies, and triggers.

- Decision: We will not call `/api/v1/generation` for media counts or costs. We already know image count from `chat_attachments` and will bill per-image using `model_access.image_price`.
- Rationale: We charge for images uploaded/linked (up to cap), regardless of whether the upstream provider fully consumed them. This keeps accounting simple and consistent with our UI/limits.
- Implementation: Assistant insert seeds token costs; attachment-link trigger recomputes and updates `message_token_costs.image_units`, `image_cost`, and `total_cost`.

### 2025-08-17 — User confirmations, path-on-link explanation, and delete endpoint planning

- Upload identity: Confirmed. Use the user’s Supabase session (owner = `auth.uid()`) and short-lived signed URLs; no service-key uploads.
- Limits: Confirmed. Keep max 3 images/message; size caps: Free ≤ 5MB/image; Pro/Enterprise ≤ 10MB/image.
- Signed URL TTL: Confirmed ~5 minutes for provider fetch and history preview.
- Path on link — what it means and our v1 stance:
  - Idea: After pre-uploading under a draft, optionally rename the object so the final path encodes the message id.
  - Example draft path: `attachments-images/<userId>/2025/08/17/drafts/<draftId>/<uuid>.jpg`
  - Example after-link path (if we moved): `attachments-images/<userId>/sessions/<sessionId>/messages/<messageId>/<uuid>.jpg`
  - Alternative: Don’t move in Storage; keep the original path and set `message_id`/`session_id` in DB to create the linkage.
  - Recommendation (v1): Do not move objects on link. Keep original path; DB is source of truth. This avoids rename complexity and invalidating signed URLs.
  - Final decision: Keep original path on link (no Storage rename). Linkage is via `message_id`/`session_id` in DB.
- Delete pending attachments: Confirmed. Add a protected endpoint and wire the UI “×” to remove pre-uploaded items so they won’t be sent.
  - Endpoint: `DELETE /api/attachments/:id` (protected via `withProtectedAuth`). Only when owned by caller and `message_id IS NULL`.
  - Behavior: Delete Storage object and soft-delete DB row (`status='deleted'`, `deleted_at=now()`); idempotent response (second call no-op).
  - Rate limit: modest per-user to prevent abuse.

### 2025-08-17 — Phase A implementation + tests (backend)

- Implemented endpoints:
  - `POST /api/uploads/images` (protected, multipart) with tier-aware size caps, MIME allowlist, and ≤3 pending per draft.
  - `GET /api/attachments/:id/signed-url` (protected) with ownership/status checks; TTL ~5m.
  - `DELETE /api/attachments/:id` (protected) idempotent soft-delete; blocked when already linked.
  - Integrated with existing `/api/chat` (send) to mint signed URLs and with `/api/chat/messages` to link attachments and rely on DB recompute for image costs.
- Tests: Added a focused suite covering upload → signed-url → delete and rate-limit headers. Stabilized mocks for Next server Response/Headers, global Request/Response, and Supabase chainables. Final result: tests PASS.
- Observability: Metadata-only logs on upload/delete/link/signed-url.

### 2025-08-18 — Phase B decisions & clarifications

- Tier multipliers (rate limits):
  - Definition: Apply a multiplier to per-user and per-IP base limits depending on subscription tier. Example base limits — Upload: 30/min/user, 120/min/IP.
  - Examples:
    - Free user: 30 uploads/min, 120/min/IP
    - Pro user (×2): 60 uploads/min, 240/min/IP
    - Enterprise user (×2, adjustable later): 60 uploads/min, 240/min/IP
  - Rationale: Higher tiers get more throughput while keeping abuse in check. We can tune multipliers later without API surface change.
- Global pending cap (unlinked attachments per user):
  - Decision: Defer. We will rely on the scheduled orphan cleanup job; no immediate per-user cap (e.g., 15/24h) will be enforced now.
  - Future enhancement: track in backlog as optional guardrail if abuse observed.
- Pixel dimensions cap: Defer. No max-dimension check in Phase B; consider e.g., 4096×4096 later.
- MIME hardening via magic-byte sniff: Defer to a later phase.
- Retention per tier:
  - Decision: Free 30 days, Pro 60 days, Enterprise 90 days.
  - Implementation: Scheduled job (cron/Edge function) that:
    1. Deletes storage objects past tier-based retention and marks rows deleted.
    2. Removes orphans older than 24h (unlinked attachments).
    - Configurable thresholds per tier.
- Model allowlist & modality re-check:
  - UI: Enable Attach button only when current selected model includes "image" in `input_modalities`.
  - Server: At `/api/chat`, re-validate that the selected model supports images before sending. This covers the case where a user uploads under an image-capable model then switches to a non-image model before send.
- Telemetry fields:
  - Include `attachment_id`, `user_id`, `mime`, `size_bytes`, `session_id`, `message_id` when present, and `draft_id` in metadata logs to aid debugging. No content logged.

## Phase B — Implementation Plan (ready)

- Rate limits by tier
  - [ ] Apply multipliers in rate-limit middleware: Free = base; Pro = ×2; Enterprise = ×2 (tunable later)
  - [ ] Verify headers present on all three endpoints; signed-url adds `Cache-Control: no-store`
- Limits & validation
  - [ ] Ensure server-side cap ≤ 3 images/message is enforced at upload and send
  - [ ] Confirm per-tier size caps: Free ≤ 5MB; Pro/Enterprise ≤ 10MB (constants)
  - [ ] `/api/chat` re-validates selected model has `image` in `input_modalities` before sending
- Path & ownership
  - [ ] Keep draft-path strategy on link; DB-only linkage via `session_id`/`message_id`
  - [ ] Confirm Storage RLS policies (own read/insert/update/delete)
- Observability
  - [ ] Add metadata-only logs to include `draft_id` (plus attachment_id, user_id, mime, size_bytes, session_id/message_id)
- Docs
  - [ ] Ensure API docs reflect current limits, TTL, and multipliers
- Verification (dev)
  - [ ] Happy-path manual test: upload → send (with model supporting image) → sync → signed-url → delete pending
  - [ ] Switch-model test: upload on image-capable model, switch to non-image model, send blocked with clear error
  - [ ] Rate-limit spot check: observe headers and 429 behavior

Owner handoff: After checking all boxes above, Phase B is complete.

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
- Backend implemented: upload/signed-url/delete endpoints, chat send URL-minting, chat messages linkage, and DB recompute for image costs.
- Tests: backend suite passing for Phase A.
- UI: No upload UI yet; to be addressed in later phases.
- Pricing: `specs/track-token-usage.md` anticipates image pricing; `/api/usage/costs` already has `image_cost` in selects.
- Auth: Standard middleware in use; endpoints protected via `withProtectedAuth`.

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

## Pre-implementation plan (images-only)

We will proceed in phases. Each phase ends with a user verification step (manual checks) before moving on. This section is planning only—no code until you approve.

### Phase A — API surface & contracts (planning)

- [ ] Define endpoint contracts and auth wrapper usage:
  - [ ] POST `/api/uploads/images` (protected via `withProtectedAuth`): multipart, mime/size caps by tier, server stores file in `attachments-images`, inserts `chat_attachments` row, returns id + optional preview URL.
  - [ ] GET `/api/attachments/:id/signed-url` (protected): ownership check; returns short-lived signed URL (~5m) for viewing.
  - [ ] `/api/chat` (send): accept `attachmentIds: string[]` and validate modality; do not link here (aligns with current sync flow).
  - [ ] `/api/chat/messages` (sync): persist user+assistant messages; link attachments by setting `message_id`; cost trigger recomputes image costs.
  - [ ] DELETE `/api/attachments/:id` (protected): remove pending attachments (only when `message_id IS NULL`); verify ownership; soft-delete DB row and delete Storage object; idempotent.
- [ ] Define error model and status codes (400/401/413/429/500) consistent with existing API.
- [ ] Rate limit plan per route and tier (uploads and signed URL endpoints).
- [ ] User verification (Phase A): Review a short ADR summarizing endpoints, contracts, and rate limits.

### Phase B — Storage integration patterns (planning)

- [ ] Confirm upload identity: use the authenticated user’s Supabase session on the server so `storage.objects.owner = auth.uid()` is set automatically (preferred over service key for direct uploads).
- [ ] Path convention finalization (no console setup needed): `user_id/session_id/draft_id/{uuid}.{ext}`. For v1, keep the original path on link and only set `message_id`/`session_id` in DB (no Storage rename). If adopting moves later, update `storage_path` on rename.
- [ ] Validate caps: max 3 images per message (DB enforces), size caps per tier (Free ≤ 5MB, Pro ≤ 10MB) — confirm final numbers.
- [ ] CORS: defer unless we adopt direct browser-to-Storage uploads during dev.
- [ ] User verification (Phase B): Approve the finalized path + ownership approach.

### Phase C — Chat send pipeline gating (planning)

- [ ] UI gating rules: show Attach button only when authenticated and selected model has `image` in `input_modalities`.
- [ ] Request builder: include `{ type: 'input_image', image_url }` for supported models using fresh signed URLs minted at send time (~5m TTL).
- [ ] Message link step: ensure `/api/chat/messages` sets `message_id` on attachments and updates `has_attachments` / `attachment_count` accordingly.
- [ ] User verification (Phase C): Approve gating logic and send/link flow diagram.

### Phase D — Cost attribution & analytics (planning)

- [ ] Confirm pricing source precedence: `model_access.image_price` per image unit; cap to 3 per message.
- [ ] Validate recompute path: attachment link trigger is sufficient; no changes to assistant insert trigger.
- [ ] Plan minimal views/queries for reporting (optional now): leverage `user_model_costs_daily` and add image slices later.
- [ ] User verification (Phase D): Approve cost attribution examples (1–3 images) with expected `message_token_costs` rows.

### Phase E — Test plan (planning)

- [ ] Unit tests: upload API (mime/size, ownership), signed URL endpoint, chat/messages linkage, cost recompute.
- [ ] Integration tests: end-to-end flow with 0/1/3 images; ensure costs and counts update correctly.
- [ ] Integration tests: pending-attachment delete flow (remove via UI, verify Storage object is gone and DB row is soft-deleted; repeated delete is a no-op).
- [ ] Mocks: follow project test standards (Next.js router, auth store, toast, validation utils) to avoid invariants.
- [ ] User verification (Phase E): Approve the test matrix.

### Phase F — Docs & ops (planning)

- [ ] Developer docs: `/docs/api/uploads-images.md`, `/docs/components/chat/image-attachments.md`.
- [ ] Ops: schedule retention/orphan cleanup job (24h orphans; tiered retention 30/60/90 days) — tracked.
- [ ] Draft retention/orphan cleanup job spec (user to author next):
  - Inputs: tier mapping (Free=30d, Pro=60d, Enterprise=90d), orphan threshold=24h
  - Actions: delete storage objects past retention; soft-delete DB rows; remove orphans
  - Scheduling: daily cron/Edge function; retries and idempotency
- [ ] User verification (Phase F): Sign off docs outline and job spec scope.

After all planning phases are approved, we’ll start implementation in the same order.

## Phase C — UI Integration (final checklist)

Decisions confirmed by user (2025-08-18):

- Cap images per message in UI: 3 (matches pending ≤3 per draft)
- Preview strategy (active chat): use in-memory object URLs for immediate preview; no signed URL needed
- History previews: fetch on-demand signed URLs and cache in sessionStorage with a short TTL (e.g., ~300s minus 5s skew); refresh on demand when render fails or by user action
- Drag-and-drop: Defer; clipboard paste-to-upload is required at launch
- Alt text/caption: sanitize and strip extension from filename; fallback to Image01, Image02, …
- Gating: Free tier can use image upload; anonymous users cannot—show disabled button with tooltip “Sign in to attach images.”
- Thumbnail modal: open a lightbox on click now (overlay + ESC/click-to-close)

Finalized details for Phase C (locked)

- sessionStorage caching policy (history):
  - Cache key: `att:{id}`; value shape `{ url: string; expiresAt: number }`.
  - TTL: ~300,000 ms with a 5,000 ms skew; on 403/expiry, refresh immediately.
  - Scope: sessionStorage only (never localStorage); no URLs persisted in DB.
- Filename sanitization for display/alt:
  - Strip extension; remove unsafe characters; collapse whitespace; trim; max length ~64.
  - If missing/unsafe after sanitize, fallback labels: Image01, Image02, … (per message order).
  - Use sanitized name for aria-label and alt text.
- Lightbox behavior (implement now):
  - Opens on thumbnail click; overlay backdrop; ESC and overlay click-to-close.
  - Focus trap with `aria-modal` and `role="dialog"`; restore focus on close.
  - Lock body scroll while open; support keyboard navigation on thumbnails.

Checklist

- Composer: attach UX

  - [ ] Attach Image button (accept=image/\*), visible for all; disabled for anonymous with tooltip; enabled for Free/Pro/Enterprise when model supports images
  - [ ] Enforce 3 image cap in UI; disable button and show hint when cap reached
  - [ ] Client pre-checks: MIME allowlist, size by tier (Free ≤ 5MB; Pro/Ent ≤ 10MB)
  - [ ] Clipboard paste-to-upload in textarea; handles multiple pasted images
  - [ ] Progress + error toasts for upload failures and rate limits

- Upload, preview, manage

  - [ ] POST /api/uploads/images with draftId and optional sessionId
  - [ ] Immediate local preview using object URLs; revoke on removal/unmount
  - [ ] Store returned attachmentIds in component state keyed by draftId
  - [ ] Remove pre-send: call DELETE /api/attachments/:id; update state on success

- Send with attachments

  - [ ] Include attachmentIds on send; server modality re-check handles unsupported model case
  - [ ] Clear draft state and regenerate draftId after successful send

- Rendering in chat

  - [ ] Show thumbnails for user messages with attachments
  - [ ] For history: fetch signed URL on click/tap (or on visibility) and cache per id in sessionStorage with an expiry timestamp; refresh on demand if 403/expired
  - [ ] Alt text from sanitized filename or ImageNN; basic accessible labels
  - [ ] Lightbox modal opens on thumbnail click; supports close on overlay/ESC; prevents background scroll

- Gating and safeguards

  - [ ] Anonymous: attach disabled with tooltip; hide paste-to-upload by intercepting and showing sign-in tooltip
  - [ ] Free tier allowed; enforce count/size; UI copy reflects limits

- Telemetry

  - [ ] Optional client events: upload_started/succeeded/failed, removed; no PII/content

- Tests

  - [ ] Unit: MessageInput attach/remove/paste; cap at 3; disabled state
  - [ ] Integration: upload → send → render; history signed URL fetch on demand; error path for unsupported model

- Docs
  - [ ] Update docs/components/chat/image-attachments.md with attach, paste, limits, tooltips, and signed URL preview behavior

User verification (Phase C)

- [ ] Anonymous: button visible but disabled; tooltip clarifies sign-in required; paste shows same tooltip
- [ ] Free tier: upload ≤ 3 images and ≤ 5MB each; previews render; remove works
- [ ] Send: images included for image-capable model; blocked for non-image model with clear UI error
- [ ] History: clicking an image loads via signed URL; if expired, refresh succeeds
- [ ] OpenRouter call includes image_url parts; assistant response returns normally

Cache strategy example (history view)

```ts
// sessionStorage cache key
const key = (id: string) => `att:${id}`;

export async function getSignedUrl(id: string): Promise<string> {
  const cachedRaw = sessionStorage.getItem(key(id));
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw) as {
        url: string;
        expiresAt: number;
      };
      if (Date.now() < cached.expiresAt - 5000) return cached.url; // 5s skew
    } catch {}
  }
  const res = await fetch(`/api/attachments/${id}/signed-url`);
  if (!res.ok) throw new Error("signed_url_failed");
  const { signedUrl } = await res.json();
  // Assume ~300s TTL from server; store conservatively
  sessionStorage.setItem(
    key(id),
    JSON.stringify({ url: signedUrl, expiresAt: Date.now() + 295_000 })
  );
  return signedUrl;
}
```

Pending before implementation (small setup)

- Constants: `ATTACHMENT_CAP=3`, `SIGNED_URL_TTL_MS=300_000`, `SIGNED_URL_SKEW_MS=5_000`, per-tier size caps map.
- Utils: `sanitizeAttachmentName(name: string)`, `isImageMime(mime: string)` in `lib/utils`.
- UI strings: tooltip copy for anonymous/modality/over-cap; toast messages for oversize/invalid mime/rate limit.
- Lightbox: minimal, accessible modal component with scroll lock and ESC handling.
- State wiring: draftId creation/reset on send; pass `draftId` to upload endpoint; clear composer state post-send.
- Paste-to-upload: textarea onPaste handler (images only), disabled for anonymous; honors cap and size checks.
- Tests: unit (sanitizeAttachmentName, MessageInput gating/cap/remove); integration (upload→send→render, signed URL refresh on expiry).
- Docs: add `/docs/components/chat/image-attachments.md` after implementation to reflect final UX and behaviors.

## Clarifying questions (please confirm before we implement)

1. Upload identity — Resolved: Yes, use the authenticated user’s session (`owner = auth.uid()`); no service-key uploads.
2. Size caps — Resolved: Free ≤ 5MB/image; Pro/Enterprise ≤ 10MB/image; hard cap 3 images/message.
3. Signed URL TTL — Resolved: ~5 minutes.
4. Move vs. keep path on link — Resolved: Keep the original draft path on link and only set `message_id`/`session_id` in DB (no Storage rename). See “Path on link” explanation above.
5. Delete endpoint — Resolved: Add a protected delete for pending attachments; wire UI “×” to call it.

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
  - Preview thumbnails with remove controls pre-send. The remove (“×”) calls the pending-attachment delete endpoint so the server cleans up Storage/DB immediately.
  - P1: paste and drag-and-drop (out-of-scope for first pass).
- Display in chat
  - User messages: show inline image thumbnails inside the bubble; clicking opens full-size in a modal (fetched via signed URL).
  - Assistant messages: render inline images if present in response (future); not required for initial image-input-only.
- State management
  - Local component state for selected files during composition.
  - After successful pre-upload, store only attachment IDs and minimal metadata (mime, size, preview URL) in the composer state.
  - Do not store binary data or signed URLs in localStorage; signed URLs are minted on-demand.
  - Hard cap: Prevent selecting/keeping more than 3 attachments in the composer at any time. If the user attempts to add more, show a tooltip/toast and ignore extras. Disable the Attach control when the cap is reached.
  - Draft grouping: Generate a `draftId` (uuid) when the user starts composing a new message. Include this `draftId` (and the current `sessionId` if available) with every image upload for that compose. Reset/renew the `draftId` after a successful send/sync or when the composer is cleared. If a pending attachment is removed via “×”, also remove it from local state upon successful DELETE.
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
  - DELETE `/api/attachments/:id`: verify ownership; allow only when `message_id IS NULL` and `status='ready'`; delete Storage object and soft-delete DB row. Treat as idempotent; return 204 when already deleted/not found (owned).
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
- [ ] Delete endpoint for pending attachments
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
  - Path strategy: Keep original Storage path on link (no rename); link via DB `message_id`/`session_id`.
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
