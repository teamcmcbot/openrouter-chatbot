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

Summary: Non-stream API augments `ChatResponse` with `output_images` (temporary, transient). Client stores and renders gallery via `MessageList`. Parser utility `extractOutputImageDataUrls` centralizes extraction & deduplication. Safe logging upheld. Additional UX polish implemented: full inline single-image rendering with lightbox click, responsive thumbnail grid, no upscaling of small images. Ready to proceed to Phase 3 (streaming image support) now; it is independent of persistence but should emit the same transient `output_images` array on final stream event prior to persistence wiring.

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

UPDATED (2025-09-07) to reflect final unified migration `001-unify-recompute.sql` (consolidated patch) and current persistence & recompute design described in `docs/architecture/db-persist-chat-messages.md`.

Key Changes vs earlier draft:

- Replaced dual-function plan (`recompute_output_image_cost_for_assistant_message` + separate input recompute) with a single unified function: `recompute_image_cost_for_user_message(p_user_message_id TEXT)` handling BOTH input (user) and output (assistant) image costs plus websearch in one pass.
- Added new columns already provisioned by consolidated patch:
  - `model_access.output_image_price` (string) replacing previously proposed `output_image_cost` name.
  - `chat_messages.output_image_tokens` (raw output image token count).
  - `message_token_costs.output_image_tokens`, `output_image_units`, `output_image_cost`.
  - `chat_attachments.metadata` JSONB with `{ source: "assistant" | "user" }` (optional, defaults to assistant when absent for backward compatibility in counting logic).
- Removed obsolete stub function `recompute_output_image_cost_for_assistant_message` (dropped by patch).
- Trigger strategy simplified: assistant INSERT + user attachment link UPDATE both call unified function; assistant attachment linking does NOT trigger recompute (prevents double counting) — output image costing handled during initial assistant insert and optionally by explicit recompute if needed.
- Output image tokens heuristic: if `output_image_tokens=0` but assistant has ready image attachments, we infer a 1:1 mapping (temporary bridge until reliable native token detail persisted per message). Present in unified function; to be removed once token details guaranteed.
- Websearch pricing fallback standardized at `$0.004` per result (capped 50) when model pricing field missing.

Structure now divides Phase 4 into two active streams (4A Persistence, 4B Unified Pricing) plus optional 4C hygiene; earlier granular separation retained only where value remains.

#### 4A — Persistence (no schema changes needed beyond unified patch)

Unchanged from prior draft EXCEPT cost recompute references now point to unified function invocation sequence:

- After assistant message INSERT (role='assistant', no error) the `after_assistant_message_cost` trigger fires `calculate_and_record_message_cost()` which calls `recompute_image_cost_for_user_message(NEW.user_message_id)`; this resolves the assistant message internally and seeds/updates the `message_token_costs` row (initially with zero output images if none linked yet).
- When user images are linked (input images) via attachment UPDATE (message_id set & status='ready'), the `after_attachment_link_recompute_cost` trigger calls unified recompute ONLY if the linked message is a user message (role='user').
- Assistant-generated image persistence flow (store endpoint) links attachments directly to the assistant message; this DOES NOT auto-trigger recompute (by design) so that we avoid double delta application. If materially needed, the store endpoint can explicitly call `SELECT recompute_image_cost_for_user_message(<assistant_id>)` after all assistant images are ready (pending final endpoint wiring decision).

Action Items (Persistence):

- [ ] Implement `/api/chat/images/store` (Protected + Tier B) storing assistant images into `chat_attachments` with `metadata.source='assistant'`.
- [ ] Decide / document whether store endpoint will explicitly call unified recompute for output images (recommended for near-real-time cost accuracy) — add an idempotent call guarded by row snapshot to avoid duplicate deltas.
- [ ] Update client to invoke store endpoint post-stream / post-non-stream finalize, then replace transient data URLs with signed URLs.
- [ ] Hydration path: rely on existing attachments fetch; ensure UI filters or groups by `metadata.source` if needed.
- [ ] Tests: endpoint success, attachment rows exist, images render after reload.

#### 4B — Unified Output Image Pricing (post-persistence)

Supersedes prior separate output-image recompute plan. Unified pricing covers:

- Prompt tokens (input) @ `prompt_price`.
- Text completion tokens (completion - output_image_tokens) @ `completion_price`.
- Input image units (user attachments, cap 3) @ `image_price`.
- Output images (assistant attachments, no cap) using either:
  - Native per-output-image token count (`chat_messages.output_image_tokens`) if > 0, ELSE
  - Attachment count heuristic (1 token each) when tokens absent.
- Websearch results (capped 50) @ `web_search_price` (fallback 0.004 if missing).

Unified function algorithm (reference snapshot – see actual SQL for authoritative logic):

1. Resolve assistant message by either user_message_id or assistant id param.
2. Collect token + model + websearch fields; load pricing from `model_access`.
3. Fallback output image price override for `google/gemini-2.5-flash-image-preview` if `output_image_price` is missing/zero (`0.00003`).
4. Count input images (user message attachments status='ready', capped 3) => `image_units`.
5. Count output images (assistant attachments status='ready', `metadata.source` absent or 'assistant') => `output_image_units`.
6. If output_image_tokens = 0 and output_image_units > 0 ⇒ infer `output_image_tokens = output_image_units`.
7. Derive text completion tokens = max(completion_tokens - output_image_tokens, 0).
8. Compute component costs; upsert into `message_token_costs` with expanded `pricing_source` JSON including: prompt & completion prices, input/output image prices, token splits, units, websearch pricing, basis markers, and output image tokens.
9. Calculate total_cost delta; apply to `user_usage_daily.estimated_cost` idempotently.

Open Decisions / Follow-ups:

- [x] Explicit endpoint recompute after assistant image persistence: DECISION = NO (documented). Cost (including output image component) is computed by the existing `after_assistant_message_cost` trigger path when `/api/chat/messages` inserts the assistant row WITH `output_image_tokens` provided in the payload. No extra recompute call in a separate image store endpoint; that endpoint (when implemented) only persists binaries/attachments. Frontend must send raw `completion_tokens` (full) plus `image_tokens`; server defensively recomputes text vs image split.
- [ ] Track removal timeline for heuristic 1:1 tokens mapping once consistent `output_image_tokens` ingestion confirmed via `/api/chat/messages` payload (>=95% coverage over 7d rolling window).
- [ ] (Optional) Add sampled debug logs for costly recompute (duration & component breakdown) for anomaly detection.

#### Phase 4 Implementation Checklist

##### 4A Persistence

- [ ] Add server DTO/interface fields for `output_image_tokens` on assistant messages (API request/response types).
- [ ] Modify `/api/chat/messages` handler to accept & persist `output_image_tokens` (clamp negatives, ignore NaN) and rely on trigger path only.
- [ ] Ensure defensive derivation: `text_completion_tokens = max(completion_tokens - output_image_tokens, 0)` (server-side, not trusting client subtraction).
- [ ] Implement `/api/chat/images/store` endpoint (Protected + Tier B) to persist assistant images (no recompute) with `metadata.source='assistant'`.
- [ ] Create helper util `persistAssistantImages` to upload/store and insert `chat_attachments` rows (status='ready').
- [ ] Client: call store endpoint post-finalization (non-stream + stream) to swap data URLs to signed URLs (graceful fallback on failure).
- [ ] Hydration: verify existing attachment fetch rehydrates assistant images with correct ordering.
- [ ] Persistence tests: endpoint auth / rate limit stub, attachment inserted, metadata.source correctness, reload renders images.

##### 4B Unified Output Image Pricing

- [ ] Confirm schema columns present (`chat_messages.output_image_tokens`, `message_token_costs.output_image_tokens`, `output_image_units`, `output_image_cost`, `model_access.output_image_price`).
- [ ] Verify unified function `recompute_image_cost_for_user_message` logic matches spec (heuristic, override price, caps, idempotent delta).
- [ ] Ensure `/api/chat/messages` forwards raw full `completion_tokens` + `image_tokens` (as `output_image_tokens`).
- [ ] Logging: add structured debug (sampled) `{ model, outputImageTokens, inferredHeuristic, outputImageUnits }` (no payloads).
- [ ] WARN (once) if completion < image tokens (clamped) with redacted context.
- [ ] Test: pure output images (no user images) cost component correctness.
- [ ] Test: mixed input + output images (both components & caps enforced).
- [ ] Test: fallback Gemini override when `output_image_price='0'`.
- [ ] Test: heuristic path (tokens missing, attachments exist) infers tokens once; second recompute no delta.
- [ ] Test: websearch + images combined (all five cost components aggregated).
- [ ] Test: back-to-back recompute unchanged state yields zero additional daily usage delta.

##### 4C Operational Hygiene (Spec Only in this Phase)

- [ ] Draft orphan GC spec: delete/cleanup assistant attachments older than TTL with no message reference or not `status='ready'`.
- [ ] Add backlog issue for GC implementation & monitoring metrics (counts by age/status).

##### Documentation & Follow-ups

- [ ] Update `docs/architecture/db-persist-chat-messages.md` with Phase 4 persistence + pricing flow and decision rationale (no explicit recompute endpoint).
- [ ] Add verification guide documenting SQL queries to inspect `message_token_costs` & `user_usage_daily` deltas.
- [ ] Add heuristic removal success metric & monitoring query snippet to docs/backlog.
- [ ] Add API contract doc for `/api/chat/images/store` (auth, rate limit tier, request/response schema, no recompute).
- [ ] Prepare manual user verification checklist: 4A (persistence) & 4B (pricing) steps.

##### Acceptance Validation (Execution Checklist)

- [ ] Assistant images persisted & rehydrated after page reload.
- [ ] Cost row includes prompt, text_completion, input_image, output_image, websearch components.
- [ ] Daily usage delta reflects single recompute per material change.
- [ ] Recompute idempotent (repeat run no cost change) confirmed.
- [ ] Logs contain only counts + summary (no base64 / raw tokens beyond counts).
- [ ] Heuristic removal backlog item created.

Test Additions (Unified):

- [ ] Back-to-back recompute with unchanged state yields zero delta.
- [ ] Output image only (no user images) path sets `image_units=0` and `output_image_units>0`.
- [ ] Mixed case (user + assistant images) sums both cost components accurately.
- [ ] Fallback price engaged when `output_image_price='0'` for Gemini preview model.
- [ ] Heuristic branch exercised (tokens=0, attachments>0) sets tokens correctly.

#### 4C — Operational Hygiene (unchanged except naming alignment)

- Continue with orphan GC plan; no changes needed for unified patch aside from ensuring we do not misclassify assistant attachments with absent `metadata.source` (treat as assistant default).

#### Acceptance Criteria (Revised)

- Assistant images persisted & rehydrated with stable ordering.
- `message_token_costs` rows reflect all five cost components (prompt, text_completion, input_image, output_image, websearch) and correct `total_cost`.
- Daily usage (`user_usage_daily.estimated_cost`) reflects single accurate delta per recompute change.
- Logs contain only summarized counts & cost metrics; no raw image data or tokens beyond counts.
- Recompute remains idempotent under repeated calls with no underlying data changes.

#### Risks & Mitigations (Delta)

- Double recompute after assistant image store: mitigate by making store endpoint recompute optional and safe (delta detection).
- Heuristic token inference drift if provider changes semantics: monitor sample rows; drop heuristic once stable ingestion pipeline confirmed.
- Potential race: assistant insert recompute runs before images persisted, producing initial cost w/out output image component — acceptable; later recompute adjusts delta.

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
