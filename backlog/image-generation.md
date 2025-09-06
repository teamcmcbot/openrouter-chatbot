# Image generation support plan

Date: 2025-09-05
Source refs:

- Announcement: https://openrouter.ai/announcements/the-first-ever-image-model-is-up-on-openrouter
- Docs: https://openrouter.ai/docs/features/multimodal/image-generation

## Scope

Add image output support for OpenRouter models with `output_modalities` including `image` (e.g., `google/gemini-2.5-flash-image-preview`) across non‑streaming and streaming chat flows, without breaking existing text-only behavior.

## Assumptions

- We already call OpenRouter `/api/v1/chat/completions`.
- We can pass `modalities: ["image", "text"]` when we intend to request images.
- Responses may contain an `images` array on the assistant message or data-URL strings in content parts depending on provider normalization; we’ll handle both.
- Images usually arrive at end of stream; no incremental base64 chunks.
- We won’t enforce a backend cap on number of generated images; the model/prompt controls count. UI and storage must handle N images.

## Phases

### Phase 0 — SQL patch creation

Create incremental, idempotent SQL patches under `database/patches/image-output-pricing/` to prepare schema for output images while preserving existing input-attachment limits.

- [x] Add `model_access.output_image_cost` (default '0')
  - `ALTER TABLE public.model_access ADD COLUMN IF NOT EXISTS output_image_cost VARCHAR(20) DEFAULT '0';`
- [x] Stage future cost columns (commented/guarded; no behavior change)
  - `ALTER TABLE public.message_token_costs ADD COLUMN IF NOT EXISTS output_image_units INTEGER DEFAULT 0;`
  - `ALTER TABLE public.message_token_costs ADD COLUMN IF NOT EXISTS output_image_cost DECIMAL(12,6) DEFAULT 0;`
- [x] Add metadata column to `chat_attachments` for differentiation and future fields
  - `ALTER TABLE public.chat_attachments ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;`
  - We'll set `{ "source": "assistant" | "user" }` on insert; scan code for any JSONB casts/assumptions (none expected today).
- [x] Add new recompute function stub (no-op body now) to avoid deploy-order issues
  - `CREATE OR REPLACE FUNCTION public.recompute_output_image_cost_for_assistant_message(p_assistant_message_id TEXT) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN RETURN; END; $$;`
- [ ] Document merge-back step: after approval, fold into `/database/schema/` and update docs under `/docs/database/`

### Phase 1 — Planning & Wiring

- [x] Confirm a feature flag to gate image generation UI/requests (Decision: NO new env flag; rely on enterprise tier + model capability gating only.)
- [x] Composer control: add a "Generate Image" toggle/button (same pattern as Web Search and Reasoning). Placement: immediately after the Image attachment button.
  - Enterprise-only: gate by `authContext.features` (tier='enterprise') and model capability (`output_modalities` contains `image`). Hidden/disabled otherwise with tooltip.
  - When enabled, request builder includes `modalities: ["image","text"]` and downstream persistence wiring activates. (Request builder wiring still pending.)
- [x] Add request builder support for `modalities: ["image", "text"]` only when an image-capable model is selected. (Implemented: UI toggle propagates `imageOutput`; API routes inject modalities; OpenRouter util passes `modalities`.)
- [x] Update model picker to indicate models with `image` output and restrict UI affordances accordingly.
- [x] Models dropdown: add an "Image Generation" tag/chip for models where `output_modalities` contains `"image"`.
- [x] Model details sidebar: in Overview tab, add an "Output" field (under "Input") that shows `Text` or `Text, Image` based on `output_modalities`.
- [ ] Clarify storage strategy: transient (in-memory/data URLs) vs persisted (object storage). (Pending final decision; leaning toward persistence Phase 2.5.)
  - UI behavior: render raw data URLs immediately (non-streaming after response; streaming on final event), then switch to signed Supabase URL after successful upload to ensure persistence and cacheability.
- [ ] Security review: sanitize prompts, do not log image data, respect logging standards. (Planned; logging currently excludes image/base64 payloads.)
- [x] Security review: confirmed no base64/image data logged. `logger` usage only in new wiring (routes/util) avoids payload bodies; no `console.log` of image data. Added guard to never send logs from browser drain. No persistence yet, so no signed URL leakage. (2025-09-06)
- [ ] User verification: Confirm UX/flag behavior and model gating.

Additional completed UI polish (not originally enumerated):

- [x] Toggle emerald styling & icon swap (PhotoIcon)
- [x] Toggle resets on model change
- [x] Unsupported / upgrade popovers standardized

### Phase 2 — Non‑streaming support

// Phase 2 IMPLEMENTATION STATUS (2025-09-06): Non-streaming parsing & inline render COMPLETE (transient only)

- [x] Update API client/types to detect assistant images in responses:
  - Primary path handled: `choices[0].message.images[]` supports both string data URLs and objects `{ type: 'image_url', image_url: { url } }`.
  - Fallback path implemented: regex extraction of `data:image/...;base64,` URLs from `message.content` (string or text parts array).
- [x] UI: render image gallery in assistant bubble when images present; preserves existing markdown text.
  - Current flow: show data URL thumbnails immediately (no persistence swap yet; that arrives in Phase 2.5).
- [x] Error handling: silent fallback to text-only when parser yields zero images (no user-facing error required at this stage).
- [x] Logging: only logs `imageCount`; no base64 payloads or raw image data logged.
- [x] Tests: parser unit tests (primary + fallback + dedupe) API route test validating `output_images` array, plus UI component tests (single image full render, multi-image grid, clickable lightbox, responsive sizing, no-upscale behavior).
- [x] User verification (manual): Confirmed with real model (`google/gemini-2.5-flash-image-preview`) – single image full-width (natural size, no upscale), multi-image grid (responsive), lightbox opens, logging shows only counts (no base64). Screenshot evidence captured in conversation.

Summary: Non-stream API augments `ChatResponse` with `output_images` (temporary, transient). Client stores and renders gallery via `MessageList`. Parser utility `extractOutputImageDataUrls` centralizes extraction & deduplication. Safe logging upheld. Additional UX polish implemented: full inline single-image rendering with lightbox click, responsive thumbnail grid, no upscaling of small images. Ready to proceed to Phase 2.5 persistence endpoint.

Readiness Note (2025-09-06): Phase 2 scope is functionally COMPLETE; persistence (Phase 2.5) and streaming (Phase 3) remain. We can safely begin Phase 3 (streaming image support) now; it is independent of persistence but should emit the same transient `output_images` array on final stream event prior to persistence wiring.

### Phase 3 — Streaming support

- [ ] Enable `stream: true` with `modalities: ["image", "text"]`.
- [ ] SSE handling: keep current text deltas; buffer until the terminal chunk, then detect `delta.images` or images on the final assistant message.
- [ ] UI: show progress status while streaming; on completion, render images.
- [ ] Tests: streaming parser test for lines containing `delta.images` and final message merge.
- [ ] User verification: manual streaming run; ensure no JSON parse errors on SSE comments.

### Phase 4 — Rate limits, auth, and middleware

- [ ] Use existing auth middleware patterns (Protected/Enhanced/Tiered) for any new endpoints.
- [ ] Apply tiered rate limiting (Tier A for chat) per standards.
- [ ] Add minimal telemetry: model, durationMs, counts — no image bytes.
- [ ] User verification: check logs cleanliness and rate limiter counters.

### Phase 2.5 — Persistence (required)

We will persist generated images so they render on history sync and are available to the user after reload. Reuse existing schema and storage policies; no new tables.

- [ ] Schema reuse (no changes):
  - Use `public.chat_attachments` for generated images (it already supports kind=image, mime, size, storage_bucket/path, message linkage).
  - Link generated images to the assistant message (`chat_attachments.message_id = <assistant_message_id>`), and set `metadata.source = "assistant"` to distinguish from user uploads. This keeps input-image pricing unaffected (current cost logic counts attachments on the user message only).
  - Set `chat_messages.has_attachments=true` and `attachment_count` on the assistant message.
  - IMPORTANT: Keep existing `attachment_count <= 3` to preserve user input-image caps and current functionality. For assistant-generated images, we will not rely on this field to reflect the full count; instead, we will fetch attachments from `chat_attachments` directly for rendering.
- [ ] Storage:
  - Bucket: `attachments-images` (policies exist in `database/schema/05-storage.sql`).
  - Normalize and transform before upload with size guard:
    - Default to WEBP (quality ~80) for best size/quality tradeoff; keep original if already webp/jpeg/png and smaller than transformed.
    - Enforce 10 MB max size post-transform; if larger, downscale dimensions proportionally until under cap (or fail with clear error if impossible).
  - Upload object per image under `attachments-images/<user_id>/<session_id>/<assistant_message_id>/<n>.<ext>`.
  - Server returns the storage bucket+path and an optional signed URL for immediate display; the DB stores only bucket+path, not signed URLs.
- [ ] API endpoint (server):
  - Path: `/api/chat/images/store`.
  - Auth: `withProtectedAuth` + `withTieredRateLimit({ tier: "tierB" })` (storage/DB tier).
  - Input: `{ sessionId: string, assistantMessageId: string, images: Array<{ dataUrl: string }> }`.
  - Behavior: decode data URLs → upload to Storage with `owner=auth.uid()` → insert rows in `chat_attachments` with width/height if available → update `chat_messages` flags → return `{ attachments: ChatAttachment[] }` plus short-lived signed URLs for immediate rendering.
  - Logging: structured summary only; never log payloads.
  - Partial failure policy: if storage upload succeeds but DB insert fails, best-effort delete uploaded objects; if DB insert succeeds but linking fails later, mark rows `status='deleted'` and schedule cleanup.
- [ ] Client wiring:
  - Non‑streaming: upon receiving images from OpenRouter, call `/api/chat/images/store` and then render via returned signed URLs. Keep assistant text intact.
  - Streaming: buffer any image references; when stream ends, call the store endpoint once with all images.
  - History hydration: when loading messages, fetch attachments for each assistant message and generate signed URLs on-demand client-side or via a small `/api/chat/images/sign` endpoint (Protected + Tier B) that returns temporary links.
- [ ] Tests:
  - Unit test for data‑URL → storage path normalization and DB insertion payload.
  - API test with mocks for Storage client and Supabase insert.
  - UI test: render assistant bubble with attachments present.
- [ ] Docs update under `/docs/components/chat` describing storage flow and privacy.

  - Include details of the immediate-data-URL render → switch-to-signed-URL flow.

- [ ] User verification: reload a session with generated images; confirm they render from storage, DB rows exist in `chat_attachments`, and no base64 is logged.

Notes:

- We intentionally do not create a separate `chat_images` table; `chat_attachments` already models this and is covered by RLS.
- Cost snapshots remain unchanged for now; output images are not yet counted in image_units (input-side). See Phase 2.6 for DB prep to support output image pricing.

### Phase 2.6 — DB schema prep for output-image pricing

Prepare schema to track output image pricing when OpenRouter exposes a dedicated field, and wire cost recomputations accordingly.

- [ ] Schema changes (patch under `database/patches/image-output-pricing/`):
  - `ALTER TABLE public.model_access ADD COLUMN IF NOT EXISTS output_image_cost VARCHAR(20) DEFAULT '0';`
  - Future (no-op now): `ALTER TABLE public.message_token_costs ADD COLUMN IF NOT EXISTS output_image_units INTEGER DEFAULT 0;`
    and `ADD COLUMN IF NOT EXISTS output_image_cost DECIMAL(12,6) DEFAULT 0;`
  - Related: no schema change to `chat_messages.attachment_count`. Maintain the cap for compatibility; assistant images can exceed three in storage, and UI will query/count from `chat_attachments`.
- [ ] DB functions/triggers to add/update:
  - New function `public.recompute_output_image_cost_for_assistant_message(p_assistant_message_id TEXT)`:
    - Look up assistant message/session/user/model.
    - Count all LLM-generated attachments linked to the assistant message (no cap): `chat_attachments WHERE message_id = p_assistant_message_id AND status='ready'` (and `metadata.source='assistant'` when available).
    - Read `model_access.output_image_cost` for the model; compute `output_image_units` and `output_image_cost = output_image_units * output_image_cost`.
    - Upsert into `message_token_costs` for the assistant message: set `output_image_units`, `output_image_cost`, and update `total_cost = prompt_cost + completion_cost + image_cost + output_image_cost + websearch_cost`.
    - Update `pricing_source` JSON to include `output_image_price`, `output_image_units`, and `output_image_basis` (e.g., `per_output_image`).
    - Maintain daily estimated cost delta same as current logic.
  - Update trigger `public.on_chat_attachment_link_recompute` (after UPDATE OF message_id on `chat_attachments`):
    - Detect the linked message role; if it’s an assistant message, call `recompute_output_image_cost_for_assistant_message(NEW.message_id)`; otherwise keep existing `recompute_image_cost_for_user_message(NEW.message_id)` behavior (input images).
  - Update `public.calculate_and_record_message_cost` (AFTER INSERT on `chat_messages`):
    - When inserting an assistant message (no error), also call `recompute_output_image_cost_for_assistant_message(NEW.id)` to seed a row; final values will be corrected after images are persisted/linked.
  - Views/functions:
    - `public.user_model_costs_daily` aggregates `total_cost` already; no change needed if `total_cost` now includes `output_image_cost`.
    - Admin analytics (e.g., `public.get_global_model_costs`) also rely on `total_cost`; no change required. Optional future: expose `SUM(output_image_units)` metrics.
- [ ] App integration:
  - The `/api/chat/images/store` endpoint, after persisting LLM images, triggers a recompute (SQL function call) for the assistant message to finalize `output_image_units` and `output_image_cost`.
  - Logging remains summary-only; do not log payloads or signed URLs.

### Operational hygiene — cleanup of orphans

- [ ] Best-effort rollback is in the store endpoint as above.
- [ ] Add a periodic GC job (SQL function + cron or external worker) to:
  - List storage objects without corresponding `chat_attachments` rows older than N hours and delete them.
  - Mark DB rows with missing storage objects as `status='deleted'` and optionally purge after retention.

## UX notes

- Indicate models capable of images; disable image request affordances otherwise.
- Render images in a grid beneath the assistant text.
- Support multiple images per response.
- We do not restrict the number of generated images in the backend; it is prompt-driven and model-dependent. UI renders a gallery when multiple are returned.
- Defer heavy persistence until validated.

## Testing plan

- Unit tests: response parsing (images array and data-url fallback), rendering behavior, streaming end image reveal.
- Mocks: follow project testing standards; minimal mocks for Next.js router, stores, and toast.
- Optional integration test: one non‑streaming call via a mocked client.

## Logging & privacy

- Use `lib/utils/logger.ts`; no `console.*` in app code.
- Don’t log prompts, image data, or headers.
- Emit a single INFO summary per request (model, durationMs, imageCount) with sampling.

## Risks & mitigations

- Provider variance in response shape → handle both `message.images[]` and data URLs in content.
- Large base64 payloads in memory → avoid logging, avoid persistence by default.
- Streaming parsing fragility → reuse existing SSE parser, ignore comment lines.

## Open questions

- Should we expose an explicit UI control to request image vs text, or infer from model?
- Do we need object storage now, or is in‑session display sufficient?
- Any per‑tenant limits for images distinct from text?

## Manual test checklist

- [ ] Select `google/gemini-2.5-flash-image-preview`; send prompt; receive and render images (non‑streaming)
- [ ] Same with `stream: true`; images appear after final chunk
- [ ] Multiple images render in grid; text + images interleaved
- [ ] Logs contain summary only; no payloads
- [ ] Rate limitations respected

---

## Next Focus (Working Set)

### Phase 1 Completion Summary (2025-09-06)

Decisions & Status:

- Feature flag: Chose NO new env flag; gating via enterprise tier + model `output_modalities` only.
- UI Toggle: "Generate Image" enterprise-gated control with capability + unsupported and upgrade popovers implemented.
- Propagation: `imageOutput` flag flows MessageInput → hooks (stream & non-stream) → API routes → OpenRouter util; routes inject `modalities: ["text","image"]` when enabled.
- Types: Added `requested_image_output` on ChatMessage for auditing.
- Logging/Security: Confirmed no base64 image data or prompts logged; logger drains server-side only; Phase 2 persistence endpoint will follow same standards.
- Tests: Adjusted brittle MessageInput test to tolerate extended option object.

Ready to proceed with Phase 2 parsing & persistence work.

1. Phase 2 parsing: detect assistant images (response `message.images[]` or data URLs in content) in non‑streaming handler.
2. Implement `/api/chat/images/store` endpoint (Phase 2.5) with protected auth + tiered rate limiting; persist assistant images (`metadata.source='assistant'`).
3. Wire non‑streaming flow to call store endpoint and return attachment IDs + signed URLs.
4. Add client rendering of assistant image gallery + swap data URL → signed URL after persistence.
5. Streaming integration (Phase 3): buffer image references; call store endpoint on final metadata.
6. Security/logging review & docs update; then user verification checklist execution (covers remaining Phase 1 verification + Phase 2/3 additions).
7. Proceed to pricing recompute logic (Phase 2.6) and orphan GC planning.

After these, proceed to pricing recompute logic (Phase 2.6) and orphan GC.

## Rollout

- Phase behind a feature flag → internal → staged rollout → public.
- Add docs entry under `/docs/components/chat` or similar after verification.
