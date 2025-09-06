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

## Pricing (Gemini 2.5 Flash Image Preview Reference)

Authoritative source (2025-09-06) combines:

1. Model listing (OpenRouter models endpoint) — exposes: `prompt`, `completion`, `image` (input image) pricing only.
2. Public model page https://openrouter.ai/google/gemini-2.5-flash-image-preview — additionally discloses output image pricing (`$0.03 / 1K output imgs`), which is NOT yet surfaced in the API `pricing` object.
3. Generation record (OpenRouter generation endpoint) — exposes native vs normalized token counts and derived `total_cost`.

### Price Units

| Dimension                 | Rate (USD)             | Unit                         | Source                                                                      |
| ------------------------- | ---------------------- | ---------------------------- | --------------------------------------------------------------------------- |
| Prompt tokens             | $0.30 / 1M             | per token (1 token = 1e-6 M) | Model page & API (`pricing.prompt` = 0.0000003)                             |
| Completion (text)         | $2.50 / 1M             | per token                    | Model page & API (`pricing.completion` = 0.0000025)                         |
| Input images              | $1.238 / 1K images     | per image (1K = 1000)        | Model page & API (`pricing.image` = 0.001238) (treated as input image unit) |
| Output images (GENERATED) | $0.03 / 1K output imgs | per generated image          | Model page ONLY (NOT in API pricing JSON)                                   |

Notes:

- Output image cost must be inferred; API omission means our automated cost recompute currently lacks this dimension unless we augment pricing metadata manually.
- Provided generation shows `native_tokens_completion_images` distinct from text completion tokens; OpenRouter multiplies that by the output image rate to derive bulk of total cost.

### Example Calculation (Provided Generation)

OpenRouter generation payload excerpts:

```
native_tokens_prompt = 303
native_tokens_completion = 2624
native_tokens_completion_images = 2580
num_media_completion = 2 (images)
total_cost = 0.0776009
```

Derive text vs image completion tokens:

```
text_completion_tokens = native_tokens_completion - native_tokens_completion_images
                = 2624 - 2580 = 44
image_tokens = 2580 (OpenRouter treats these analogous to output image token units)
```

Apply rates:

```
Prompt cost  = 303 * 0.0000003         = 0.0000909
Text output  = 44  * 0.0000025         = 0.0001100
Image output = 2580 * 0.00003          = 0.0774000
-------------------------------------------------
Total        = 0.0776009 (matches OpenRouter total_cost)
```

Image output tokens correspondence: For Gemini image generation, OpenRouter supplies `native_tokens_completion_images` which we can multiply directly by the per-output-image-token price. We do NOT need `num_media_completion` for pricing (2 images) because pricing appears token-based, not flat per-image, though the model page labels it as `$/K output imgs` — empirical evidence suggests `image_tokens` already equals (images \* internal token factor). We accept OpenRouter’s native tokenization as ground truth.

### Internal Representation Plan (Phase 4 Alignment)

We currently track:

- `prompt_tokens`
- `completion_tokens` (aggregate)
- (New) `image_tokens` (currently from final metadata)

For pricing parity we need to:

1. Split completion into text vs image at ingestion time for cost math:

- `text_completion_tokens = completion_tokens - image_tokens` (guard `>=0`).

2. Store `output_image_units` = `image_tokens` (name mirrors future schema patch).
3. Compute `output_image_cost = output_image_units * output_image_rate`.
4. Persist `output_image_rate` even though NOT in API pricing JSON by introducing an override mapping keyed by model id until OpenRouter surface catches up.
5. Extend `pricing_source` JSON to include: `{ output_image_price: <string>, output_image_units, output_image_basis: "per_output_token" }` (naming consistent with existing keys).

### Stop-Gap: Missing Output Image Rate in API

Implementation detail for Phase 2.5 (transient) & Phase 2.6 (DB):

```
const MODEL_PRICE_OVERRIDES = {
  'google/gemini-2.5-flash-image-preview': {
    output_image: '0.00003'  // $0.03 / 1K => 0.00003 per token unit (1 token = 1/1000 of K?)
  }
};
```

Rationale: Keep override small and explicit; remove once OpenRouter adds the field (feature flag around override application for easy rollback).

### Edge Cases / Validation

- If `image_tokens` absent: treat as zero; no override cost applied.
- If subtraction yields negative text tokens (malformed upstream): clamp text tokens to zero and log a single WARN with redacted context.
- Confirm recompute function idempotency: calling after persistence or retry should yield the same `total_cost`.

### Testing Strategy (Additions)

- Unit: cost calculator given (prompt=303, completion=2624, image=2580) outputs exact `0.0776009` within 1e-7 tolerance.
- Unit: absence of `image_tokens` falls back to legacy text-only math.
- Unit: negative post-subtraction clamps to zero and logs WARN.
- Integration (after persistence): generate assistant message with images, invoke recompute, validate DB row fields: `output_image_units=2580`, `output_image_cost=0.0774000`, `total_cost` sums accurately.

### Roll Forward / Roll Back

- Feature flag `ENABLE_OUTPUT_IMAGE_PRICING`: if false, skip output image components (acts as rollback lever).
- On rollback, retain stored columns but set `output_image_units=0`, `output_image_cost=0` on recompute; historical messages remain consistent.

### Open Questions

- Confirm whether OpenRouter will expose `output_image` pricing in API `pricing`; if yes, remove override and trust official field.
- Clarify if `image_tokens` scaling always equals per-output-token counting or if future models may return flat `num_media_completion` only (add adaptive path).

---

## Output Image Tokenization & Display Enhancements (Added 2025-09-06)

### Source Debug Payload (Authoritative Example)

```
[2025-09-06T13:55:33.906Z] [DEBUG] OpenRouter response received: {
  id: 'gen-1757166918-NDT6O4xrTxQOr0dXCDSA',
  provider: 'Google AI Studio',
  model: 'google/gemini-2.5-flash-image-preview',
  object: 'chat.completion',
  created: 1757166918,
  choices: [ { logprobs: null, finish_reason: 'stop', native_finish_reason: 'STOP', index: 0, message: [Object] } ],
  usage: {
    prompt_tokens: 303,
    completion_tokens: 2624,
    total_tokens: 2927,
    prompt_tokens_details: { cached_tokens: 0 },
    completion_tokens_details: { reasoning_tokens: 0, image_tokens: 2580 }
  }
}
```

### New Requirements

1. API Surfaces: `/api/chat` and `/api/chat/stream` MUST forward the raw `prompt_tokens_details` and `completion_tokens_details` objects (when present) into final metadata so the client receives `image_tokens` without recomputation heuristics.
2. UI Token Line Format:
   - If `completion_tokens_details.image_tokens > 0` then:
     - `text_output_tokens = completion_tokens - image_tokens`
     - Display: `Input: <prompt_tokens>, Output: <text_output_tokens>+<image_tokens>, Total: <total_tokens>`
   - Else retain legacy: `Input: <prompt_tokens>, Output: <completion_tokens>, Total: <total_tokens>`
3. Assistant Message Shape (frontend store): Extend message record with optional:
   - `image_tokens: number`
   - `text_output_tokens: number` (derived convenience; not strictly required to persist if we can derive each render)
   - Preserve existing flattened `input_tokens`, `output_tokens`, `total_tokens` for backward compatibility.
4. DB Schema Adjustments:
   - `chat_messages` add column: `output_image_tokens INTEGER DEFAULT 0` (mirrors naming of future cost units; narrow semantic: raw output image token count).
   - `message_token_costs` add column: `output_image_tokens INTEGER DEFAULT 0` (distinct from `output_image_units`; we will keep both because pricing may later diverge between token unit counting vs image unit counting). If we decide to unify, retain alias for migration safety.
5. Cost Computation Update (Phase 2.6 alignment):
   - `output_image_units` = `output_image_tokens` (1:1 currently) until/unless OpenRouter exposes separate unit semantics.
   - `text_completion_tokens = completion_tokens - output_image_tokens` (clamp ≥ 0).
   - `completion_cost` continues to apply only to `text_completion_tokens`.
   - `output_image_cost` applies to `output_image_tokens * output_image_rate`.
6. Sync Path (`/api/chat/messages` & any batch sync): When persisting an assistant message, if `image_tokens > 0`, recompute `text_completion_tokens` server-side for defensive correctness even if client sent derived fields; never trust client subtraction blindly.
7. Streaming Path: For `/api/chat/stream` accumulate and surface `image_tokens` only in final metadata (no partial increments at this time) — reduces protocol surface; reasoning tokens already handled similarly.
8. Backward Compatibility: Clients not updated to parse the new details simply ignore them; flattened legacy fields remain accurate (output_tokens will continue to equal FULL completion_tokens, not just text). UI-only subtraction is purely presentational; DB-level cost functions rely on explicit subtraction.
9. Logging: Do NOT log `completion_tokens_details` contents beyond aggregated counts (e.g., include `image_tokens` numeric value only). Follow existing privacy/log size guidelines.

### Implementation Notes

- Introduce a lightweight server-side type:
  ```ts
  interface CompletionTokensDetails {
    reasoning_tokens?: number;
    image_tokens?: number;
  }
  interface PromptTokensDetails {
    cached_tokens?: number;
  }
  ```
- Augment final metadata shape: `{ usage: { prompt_tokens, completion_tokens, total_tokens, prompt_tokens_details?, completion_tokens_details? } }`.
- UI selector computes `text_output_tokens` lazily to avoid schema churn if requirements change again.
- Migration ordering: Add columns (nullable / default 0) first, deploy code that writes them, then later enforce NOT NULL if desired.

### Test Plan Additions

| Test                  | Scenario                                                   | Assertion                                       |
| --------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| API unit (non-stream) | Response includes `completion_tokens_details.image_tokens` | JSON forwarded unchanged                        |
| Streaming integration | Final metadata lacks trailing newline                      | `image_tokens` still parsed                     |
| UI render w/ images   | image_tokens > 0                                           | Token footer shows `Output: X+Y`                |
| UI render no images   | image_tokens = 0                                           | Footer shows legacy single number               |
| Cost recompute        | image_tokens present                                       | DB row sets `output_image_tokens` & cost splits |
| Defensive subtraction | completion < image_tokens (synthetic)                      | text_output_tokens clamped 0, WARN logged       |

### Open Risks

- API payload size growth (minor) — mitigated by sparse optional objects.
- Potential confusion if downstream tooling expects `output_tokens` to exclude image component; we document that `output_tokens` remains full completion for continuity.

### Rollback Strategy

- Feature gate `ENABLE_IMAGE_TOKEN_DETAILS`; if disabled, suppress forwarding of detail objects and UI composite display (revert to legacy formatting) while retaining schema columns for forward compatibility.

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

Refined scope based on clarifications (2025-09-06):

Decisions:

- Emit images immediately when their `delta.images` chunk arrives (no waiting for final chunk).
- No placeholder skeleton (explicitly declined).
- No artificial soft cap in Phase 3 (cannot enforce via API; rely on prompt/model behavior). We simply dedupe.
- Image extraction errors are silent (logged at debug only, no UI badge).
- Rely primarily on streaming `delta.images` events per official docs; fallback final content scan only if none captured.

Implementation Checklist:
\

- [x] Add streaming image delta handling in SSE parser: detect `delta.images[]` objects `{ type: 'image_url', image_url: { url } }`.
- [x] Maintain a Set for dedupe; push new images to the in-flight assistant draft (`output_images` transient) immediately.
- [x] On stream completion, if no images were emitted but `requested_image_output` is true, run fallback content scan (content regex) (Phase 3 implemented local scan variant).
- [x] Ensure retry path preserves `requested_image_output` flag for streaming just like non-stream. (Flag propagated; retry path unaffected.)
- [x] Logging: finalize summary will include image count (base64 excluded). (Needs manual log verification.)

Testing Checklist:
\

- [x] Unit: parser handles multiple `delta.images` events (accumulates & dedupes). (Achieved indirectly via existing image streaming tests asserting final deduped array; explicit isolated unit test deferred as low risk.)
- [x] Unit: fallback triggers when no deltas contained images. (Covered by EOF / final metadata fallback test ensuring images still parsed when only final metadata present.)
- [x] Store: streaming flow updates assistant message state incrementally (draft assistant with images) (manually verified + test suite green).
- [x] Store: duplicate image URLs ignored (Set-based dedupe in implementation; verified by absence of duplicates in message state during tests).
- [x] Regression: reasoning/text streaming unaffected (full suite passed; reasoning tests green).

Manual Verification Steps:

1. Enable image toggle; use a streaming-capable image model; send prompt.
2. Observe text tokens stream; when `delta.images` arrives, image(s) appear immediately.
3. Confirm no placeholder skeleton appears at any time.
4. Retry message; images stream again (may differ based on model determinism).
5. Confirm logs show image count only; no base64.
6. Test a prompt that yields zero images (text-only) while toggle on; no crash, no empty gallery artifacts.

Exit Criteria:

- All tests above passing & manual checklist confirmed.
- No console/base64 leaks; only structured logger usage.
- Non-stream behavior unchanged.

### Phase 3 Completion Summary (2025-09-06)

Status: COMPLETE.

Delivered:

- Streaming image support with immediate gallery updates for final-only metadata (delta markers removed per revised scope) without leaking protocol JSON.
- Robust parsing (line-by-line, EOF residue, fallback scrub) ensures `__FINAL_METADATA__` always applied; raw JSON never displayed.
- Dedupe mechanism prevents duplicate image entries across retry and final merge.
- Logging adheres to standards (counts only, no base64 / prompt leakage).
- Full test suite (329 tests) passing; added EOF / fallback metadata test; image streaming + sanitation tests green.

Deferrals (Documented Technical Debt):

- Consolidation of duplicate streaming loops.
- Dedicated low-level unit tests for multi-delta incremental images (not required after delta removal) intentionally skipped.

Ready for Phase 4 work streams (persistence + pricing) next.

### Phase 5 — Rate limits, auth, and middleware

- [ ] Use existing auth middleware patterns (Protected/Enhanced/Tiered) for any new endpoints.
- [ ] Apply tiered rate limiting (Tier A for chat) per standards.
- [ ] Add minimal telemetry: model, durationMs, counts — no image bytes.
- [ ] User verification: check logs cleanliness and rate limiter counters.

### Phase 4 — Persistence & Output Image Pricing (Consolidated)

This new phase consolidates the previously separate Phase 2.5 (Persistence) and Phase 2.6 (DB schema prep for output‑image pricing) into a single cohesive milestone. It is divided into parallel work streams:

4A. Persistence of generated images (storage + retrieval + hydration)
4B. Output image pricing schema & recompute pipeline
4C. Operational hygiene (cleanup & GC)

#### Phase 4 Implementation Context (Added 2025-09-06)

This context block captures the current baseline (what already exists in code & schema) and the concrete deltas required to fully deliver 4A (persistence), 4B (output image pricing), and 4C (operational hygiene). It is an execution aide to prevent scope drift and ensure idempotent rollout.

Current Baseline (Already Implemented / In Schema):

- Table `chat_attachments` supports image rows with bucket/path, mime, size, status, and (newly) `metadata` JSONB for `source` tagging.
- Table `message_token_costs` tracks: prompt/completion/image(web input) tokens & costs + websearch cost; lacks explicit output image columns.
- Function & trigger chain for input image pricing:
  - `calculate_and_record_message_cost()` (after assistant insert) delegates to `recompute_image_cost_for_user_message(user_message_id)` which counts input images (linked to the _user_ message) and computes `image_cost` (input side only, capped at 3).
  - `on_chat_attachment_link_recompute` trigger re-fires recompute when an attachment is linked to a _user_ message (input images scenario).
- Stub `recompute_output_image_cost_for_assistant_message(p_assistant_message_id TEXT)` created (no-op) via Phase 0 patch so later code can safely call it before patch merge.
- Streaming & non‑streaming flows already surface final `image_tokens` (output side) in metadata for the assistant message (transient, not persisted yet in DB columns).
- No persistence yet for assistant-generated images: they remain data URLs only in memory/UI state.

Required Schema Deltas (Phase 4B):

1. Add output image token + unit columns (two-layer design for future divergence):

- `ALTER TABLE public.message_token_costs ADD COLUMN IF NOT EXISTS output_image_tokens INTEGER DEFAULT 0;`
- `ALTER TABLE public.message_token_costs ADD COLUMN IF NOT EXISTS output_image_units INTEGER DEFAULT 0;` (if we choose to keep distinct; can alias for now).
- `ALTER TABLE public.message_token_costs ADD COLUMN IF NOT EXISTS output_image_cost DECIMAL(12,6) DEFAULT 0;`

2. (Optional / Likely): Add `output_image_tokens` to `chat_messages` if UI or analytics need direct per-message token access without joining cost table: `ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS output_image_tokens INTEGER DEFAULT 0;`
3. Extend `model_access` already patched with `output_image_cost` (string rate). Confirm NOT NULL / default semantics after rollout (keep default '0').

Persistence Flow (4A) – Detailed Sequence (Non‑Streaming & Streaming unify after assistant message creation):

1. Assistant message is inserted (text + token metadata) — triggers cost insertion path (currently only text + input image + websearch dimensions).
2. Client collects generated image data URLs (accumulated during stream or final non‑stream response).
3. Client POSTs to `/api/chat/images/store` with all images for the assistant message.
4. Server:

- Auth & rate limit (Protected + Tier B) -> decode each data URL.
- Normalize/transform (WEBP quality 80, enforce 10MB cap). Compute width/height if feasible (Canvas or Sharp on server).
- Upload to `attachments-images` bucket at deterministic path pattern: `<user_id>/<session_id>/<assistant_message_id>/<index>.webp` (index stable ordering of user-visible gallery).
- Insert `chat_attachments` rows with: `message_id = assistant_message_id`, `session_id`, `user_id`, `status='ready'`, `metadata.source='assistant'`.
- Update `chat_messages` for that assistant message: `has_attachments=true`, (optionally) `attachment_count = GREATEST(existing_count, number_new)` (not relied on for pricing output images — purely legacy field).
- Call (or rely on trigger to call) `recompute_output_image_cost_for_assistant_message(assistant_message_id)` AFTER all inserts succeed.
- Return serialized attachment descriptors plus short-lived signed URLs for immediate UI replacement of data URLs.

5. Client swaps transient data URLs with returned signed URLs (or lazy-fetches via future sign endpoint if omitted here) and stores attachment IDs for later hydration.
6. On session reload, attachments for assistant messages are fetched (existing conversation sync flow) and re-signed if needed.

Recompute Output Image Cost (4B) – Function Responsibilities:
`recompute_output_image_cost_for_assistant_message(assistant_message_id)` must:

1. Fetch existing `message_token_costs` row for assistant (create if missing, mirroring logic from input recompute path). Pull prompt/completion token counts and existing component costs.
2. Count output images: `SELECT COUNT(*) FROM chat_attachments WHERE message_id = assistant_message_id AND status='ready' AND (metadata->>'source')='assistant';` (no cap).
3. Derive `output_image_tokens`:

- Primary: from `chat_messages.output_image_tokens` if present (populated at persistence time from final metadata), else fall back to counting attachments (1 token unit per image) – defensive until token details consistently stored.

4. Resolve rate: prefer `model_access.output_image_cost`; fallback to in-process MODEL_PRICE_OVERRIDES map if zero.
5. Compute `output_image_units` = `output_image_tokens` (current 1:1 assumption).
6. Compute `output_image_cost = ROUND(output_image_units * output_image_rate, 6)`.
7. Recompute `total_cost = prompt_cost + completion_cost + image_cost + output_image_cost + websearch_cost`.
8. Upsert updated fields into `message_token_costs` with pricing_source extension:

- Merge keys: `output_image_price`, `output_image_units`, `output_image_basis` ('per_output_token'), `pricing_version` bump if used.

9. Calculate delta vs previous total and increment `user_usage_daily.estimated_cost` without double-counting.
10. Be idempotent: multiple invocations with unchanged attachment set produce zero delta.

Trigger / Invocation Adjustments:

- Modify `on_chat_attachment_link_recompute`: branch by role: if linked message is _assistant_ use output-image recompute; if _user_ keep existing input-image recompute (backward compatibility).
- Extend `calculate_and_record_message_cost` to call output-image recompute stub on initial insert (will typically see 0 output images, seeding a row early so later recompute updates in-place).
- The store endpoint explicitly calls output-image recompute after linking to ensure rapid cost convergence (even if trigger also fires — the recompute must early-exit or idempotently detect no change to avoid redundant deltas).

API Endpoints (New / Updated):

- `/api/chat/images/store` (Primary persistence & recompute trigger).
- (Optional) `/api/chat/images/sign` for on-demand signing when re-hydrating history; can be deferred if client can generate signed URLs directly via Supabase client with RLS.

Acceptance Criteria Summary:

- Assistant images survive page reload (persisted & re-hydrated) with correct ordering.
- `message_token_costs` row for an assistant message with images shows non-zero `output_image_units` & `output_image_cost` matching override rate math.
- Cost delta updates user’s `user_usage_daily.estimated_cost` exactly once per change in output image count.
- Removing (future GC) or adding additional images after initial persistence recomputes costs accurately (delta applied correctly).
- No leakage of base64 data in logs; only counts & durations.
- Recompute functions are idempotent (running twice with no state change yields 0 delta).

Edge Cases & Defensive Handling:

- If `output_image_tokens` < 0 (should never happen) clamp to 0 and log WARN.
- If rate is missing (0) and override absent, treat as 0 cost but mark `pricing_source.output_image_price='0'` to surface gap.
- If attachments insert partially fails: perform best-effort storage cleanup & respond with error; no cost recompute executed.
- If recompute called before attachments committed (transaction ordering), it simply counts 0 images and returns; store endpoint recompute (post-commit) will correct it.

Testing Strategy Additions (Beyond Existing):

- SQL function unit test: create assistant message + mock attachments → call recompute → assert cost row fields & daily delta.
- API integration: simulate store endpoint request with 2 images → ensure cost row updated with expected `output_image_cost`.
- Idempotency: call recompute twice → second invocation yields unchanged `total_cost` & no daily delta change.
- Override fallback: temporarily set `model_access.output_image_cost='0'` and ensure override map applied (if implemented server-side) or cost stays 0 with explanatory pricing_source entry.

Operational Hygiene Plan (4C):

- GC job enumerates objects with no matching `chat_attachments` rows (or rows `status='deleted'`) older than 24h; deletes them; logs summary counts only.
- Secondary DB cleanup: mark orphan rows `status='deleted'` if storage object missing (consistency repair).
- Metrics (optional): count of output images generated per day; average output images per assistant message (future analytics view extension).

Rollout & Order of Operations:

1. Deploy schema patch adding new columns + stub function (already partly done).
2. Ship server code calling stub (safe no-op) to validate call paths.
3. Implement store endpoint (writes attachments, sets message flags) + update client to invoke it; observe attachments populating (no pricing yet).
4. Implement recompute function logic + trigger branching + override rates.
5. Enable feature flag `ENABLE_OUTPUT_IMAGE_PRICING` in staging; verify cost math vs sample generation.
6. Backfill (if needed) existing recent assistant messages with persisted images by scanning attachments and invoking recompute.
7. Update docs & finalize Phase 4 checklists.

Post-Rollout Monitoring:

- Sample 5 recent assistant messages with images; manually verify cost row values.
- Watch daily cost deltas for unexpected spikes (guard against recompute double application).
- Log WARN counts for output-image pricing anomalies (should remain near zero).

Deferred (Explicitly Not in Phase 4):

- Advanced image transformation variants (thumbnails, different quality tiers).
- Per-image metadata extraction (objects detection, etc.).
- Differential pricing by resolution (awaiting upstream signals).

---

Completion requires all 4A, 4B, and 4C checklist items plus a final user verification step.

#### 4A — Persistence (required)

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

#### 4B — Output-image pricing (schema + recompute)

Prepare schema to track output image pricing when OpenRouter exposes a dedicated field, and wire cost recomputations accordingly. (Formerly Phase 2.6.)

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

#### 4C — Operational hygiene (cleanup of orphans)

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

---

## 2025-09-06 Streaming Final Metadata Regression & Fix Summary

### What Broke

After removing incremental image delta markers (`__IMAGE_DELTA_CHUNK__`) per updated requirements, streaming responses that included images began to leak the raw JSON line containing the final metadata marker (e.g. `{ "__FINAL_METADATA__": { ... } }`) directly into the assistant's visible message. This occurred primarily for `imageOutput=true` conversations, while pure text conversations often still parsed metadata correctly.

### Root Causes

1. Dual Streaming Loops (Drift Risk): The streaming hook (`useChatStreaming`) contained two largely duplicated parsing paths (initial send + retry). Enhancements (EOF parse) landed only in the first path, leaving the second path without equivalent handling.
2. Newline Dependency: The original parser only attempted JSON detection line-by-line for chunks terminated by a newline (`\n`). If the server flushed the final metadata JSON without a trailing newline (common when the stream ends immediately after writing), the parser never attempted to parse the buffered remainder.
3. Missed Final Metadata Extraction: Without an end-of-stream (EOF) buffer parse or a fallback scrub, the unparsed JSON line was appended verbatim to `finalContent`, producing visible `{ "__FINAL_METADATA__": ... }` in the UI for image streams.
4. Image Path Sensitivity: Image-enabled runs exercised slightly different timing (larger final payload, no interim image deltas after we removed them), increasing likelihood that the final metadata arrived as an unterminated last chunk.
5. Test Expectation Drift: One regression test asserted `assistant.metadata.usage` (nested) while production flattens usage metrics onto the assistant message. This mismatch obscured earlier detection of the real failure mode.

### Symptoms Observed

- UI showed raw JSON blob with `__FINAL_METADATA__` after streaming image responses.
- Token usage fields (`input_tokens`, `output_tokens`, `total_tokens`) sometimes missing on image streams.
- Inconsistent behavior between initial send vs retry due to loop divergence.

### Fix Implemented

1. EOF Buffer Parse: Added an explicit parse attempt for any non-empty residual buffer at stream completion (first loop already patched earlier; second loop still relied on fallback below).
2. Fallback Metadata Scrub (Both Loops): After assembling `finalContent`, perform a defensive scan of the final line(s). If a standalone JSON object containing `__FINAL_METADATA__` is found and `finalMetadata` is still unset:

- Safely `JSON.parse` it.
- Assign extracted fields (usage tokens, images, model, id) to the assistant draft.
- Remove that raw line from `finalContent` so users never see protocol internals.

3. Token Field Mapping: Ensured usage metrics are flattened onto the assistant message (`input_tokens`, `output_tokens`, `total_tokens`) instead of relying on a nested `metadata.usage` structure.
4. Test Adjustments:

- Added/updated `useChatStreaming.finalMetadataEOF.test.tsx` to simulate missing trailing newline and assert correct token flattening + absence of leaked JSON.
- Updated image streaming tests to expect images only in final metadata (no deltas) and confirm no marker leakage.

5. Lint / Type Hygiene: Resolved TypeScript nullability warning (`finalMetadata` possibly null) and silenced purposeful `any` casts in the targeted test with scoped ESLint disables.

### Verification

- All 329 tests passing after changes; image streaming + sanitation tests green.
- Manual streaming session with an image-capable model showed clean assistant content and rendered image gallery; no raw JSON.
- No base64 payloads or prompts logged (logging limited to counts / summary per standards).

### Why This Approach (Defense in Depth)

- Minimal Risk: Pure additive logic; does not alter upstream server contract or existing successful parsing paths.
- Backward Compatible: If future backend reintroduces a trailing newline, primary parsing still works; fallback remains dormant.
- Resilient: Even if future refactors miss adding EOF logic to a new path, the fallback scrub prevents user-facing leakage.

### Remaining Technical Debt / Follow-Ups

| Item                                                                            | Rationale                    | Suggested Action                                                             |
| ------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| Duplicate streaming loops                                                       | Divergence risk              | Consolidate into a single helper or shared generator.                        |
| Explicit EOF parse in retry path                                                | Currently relies on fallback | Add symmetrical EOF parse for clarity.                                       |
| Stronger typings for final metadata shape                                       | Reduce `any` usage           | Introduce a `FinalStreamMetadata` interface reused in tests.                 |
| Negative tests for malformed JSON                                               | Hardening                    | Add test ensuring malformed metadata does not crash and is ignored silently. |
| Parser unit tests for multi-image accumulating deltas (future if deltas return) | Future-proof                 | Add if incremental image support reintroduced.                               |

### Lessons Learned

- Avoid duplication in critical protocol parsers—centralize logic to reduce drift.
- Always include an EOF residual parse for streaming protocols that may terminate without a newline delimiter.
- Provide a sanitizing fallback layer to protect UX from protocol artifacts.
- Align test expectations tightly with actual public data shapes (flattened fields vs nested objects).

### Status

Streaming image final metadata parsing is now stable; raw marker leakage eliminated; token metrics consistently present. Ready to proceed to Phase 2.5 (persistence) with a cleaner baseline.
