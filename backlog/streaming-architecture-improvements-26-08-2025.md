# Streaming Architecture Improvements – Implementation Plan (26 Aug 2025)

This plan operationalizes the improvements identified in the streaming analysis, focusing on robust, model-agnostic handling of OpenRouter streams with Web Search annotations and Reasoning. It’s organized in phases with actionable tasks, acceptance criteria, and user verification steps.

---

## Clarifications resolved

1. Metadata protocol: YES — standardize on one-line JSON `{ "__FINAL_METADATA__": { ... } }` for the client-facing final metadata. The frontend already supports this: in `hooks/useChatStreaming.ts`, each line is JSON-parsed and `potentialJson.__FINAL_METADATA__` is handled. We’ll remove client-facing `__STREAM_METADATA_START__/__END__` immediately. Note: the backend’s internal `__METADATA__...__END__` remains internal to the API transform and is not forwarded to clients.
2. Reasoning visibility: YES — suppress unless explicitly allowed (tier-gated and requested).
3. Annotation dedup key: URL-only.
4. Logging level: YES — add `STREAM_DEBUG=1` to enable verbose stream logging in dev; disabled in prod. We’ll read from process.env in backend and API transform.
5. Backward compatibility: Remove client-facing legacy markers immediately (no PROD users yet).

Assumptions applied:

- Client receives a single-line `{ "__FINAL_METADATA__": { ... } }` at end-of-stream.
- Reasoning is only surfaced when validated and requested.

---

## Phase 1 — Backend SSE correctness and annotations (High priority)

- [x] 1.1 Implement SSE event buffering in `lib/utils/openrouter.ts`

  - What: In `getOpenRouterCompletionStream`, buffer incoming bytes and parse SSE events by blank-line delimiter ("\n\n"). Support multi-line `data:` payloads per SSE spec and accumulate them before `JSON.parse`.
  - How:
    - Maintain `rawBuffer: string` and append decoded chunks.
    - Extract complete SSE events split by "\n\n"; within each event, concatenate all `data:` lines (stripping `data: ` prefix) into a single JSON string.
    - Handle `[DONE]` gracefully.
    - Replace per-line JSON.parse with per-event JSON.parse. Do not silently ignore parse errors; log in debug mode and continue.
  - Acceptance:
    - No JSON parse attempts on partial payloads.
    - Events spanning multiple TCP frames parse reliably.

- [x] 1.2 Accumulate and deduplicate annotations

  - What: Replace all `streamMetadata.annotations = ...` assignments with accumulation. Forward deltas immediately, but maintain a canonical aggregated list for final metadata.
  - How:
    - Initialize `streamMetadata.annotations = []`.
    - For `message.annotations`, `delta.annotations`, and root `annotations`, push into an array.
    - Deduplicate by URL (case-insensitive) to avoid duplicates.
    - Validate minimal structure `{ type: 'url_citation', url: string }` before accepting.
  - Acceptance:
    - When models send multiple annotation batches, final metadata includes all deduped citations.
    - At least one `__ANNOTATIONS_CHUNK__` forwarded when annotations present.

- [x] 1.3 Feature-gate reasoning emission

  - What: Emit `__REASONING_CHUNK__` only if `options.reasoning` is present and user tier permits it.
  - How:
    - Pass an `allowReasoning` boolean from the API handler into `getOpenRouterCompletionStream` via `options`.
    - Conditionally enqueue reasoning markers.
  - Acceptance:
    - Models that unconditionally emit reasoning don’t surface reasoning in UI for non-entitled users.

- [x] 1.4 Backend unit tests (parser + accumulation)

  - What: Add tests for SSE buffering, multi-line events, incremental annotations, and mixed locations.
  - How:
    - Create fixtures with fragmented SSE events and verify parsed objects.
    - Verify accumulated, deduped annotations and reasoning gating.

- [x] 1.5 User verification — Phase 1
  - Summary: SSE is buffered correctly; annotations are aggregated and forwarded; reasoning honors gating.
  - Manual test steps:
    - Enable web search and use a model known to stream incremental annotations (e.g., Gemini). Confirm multiple `__ANNOTATIONS_CHUNK__` arrive and UI shows sources.
    - Repeat with a model placing annotations only at the end (e.g., DeepSeek). Final metadata includes citations.
    - Use a model that emits reasoning unconditionally; with reasoning disabled, confirm no reasoning appears.

---

## Phase 2 — API transform buffering and protocol alignment (High priority)

- [x] 2.1 Rolling buffer for markers and content in `src/app/api/chat/stream/route.ts`

  - What: Maintain a rolling string buffer across `transform()` calls. Process complete lines only; markers must be full lines with balanced JSON.
  - How:
    - Keep `carry: string`; append decoded text; split by `\n`; keep the last incomplete line in `carry`.
    - A line is a marker when it starts with `__ANNOTATIONS_CHUNK__` or `__REASONING_CHUNK__` and contains one complete JSON payload (use balanced-brace scan after the prefix).
    - Forward full marker lines as-is; exclude from `fullCompletion`.

- [x] 2.2 Remove regex-based JSON extraction/cleaning

  - What: Avoid regex for parsing embedded JSON markers; rely on line-oriented, balanced parsing only.
  - How:
    - Delete regex paths for `__ANNOTATIONS_CHUNK__` and `__REASONING_CHUNK__`.
    - For any mixed content (rare), forward text as content; markers should always be on their own line.

- [x] 2.3 Gate reasoning forwarding

  - What: Respect validated `reasoning`/tier in the API handler; drop reasoning markers when not allowed.

- [x] 2.4 Align final metadata protocol

  - What: Emit one-line JSON at flush: `{ "__FINAL_METADATA__": { ... } }` and remove client-facing legacy markers.
  - How:
    - Replace `__STREAM_METADATA_START__/__END__` emission with one-line JSON.
    - Do not forward backend `__METADATA__/__END__` to the client; consume it internally to build final metadata only.
    - Remove any residual client-facing emissions of legacy markers.

- [x] 2.5 API transform tests

  - What: Unit tests to verify buffering, split markers, and final metadata emission.

- [x] 2.6 User verification — Phase 2
  - Summary: Transform reliably forwards complete markers; no marker text leaks into content; metadata standardization in place.
  - Manual test steps:
    - Simulate fragmented marker JSON (split across multiple chunks) and confirm marker is forwarded once, intact.
    - Confirm assistant content contains no marker artifacts.
    - Inspect the final chunk to see a single-line `__FINAL_METADATA__` JSON.

---

## Phase 3 — Frontend consumer resilience (High)

- [x] 3.1 Parse standardized final metadata only

  - What: Ensure `hooks/useChatStreaming.ts` parses `{ "__FINAL_METADATA__": { ... } }` (already supported). Remove parsing of `__STREAM_METADATA_START__/__END__` and `__METADATA__/__END__` for client-facing flows.

- [x] 3.2 Accumulate and deduplicate annotations in UI

  - What: Replace `setStreamingAnnotations(...)` overwrite with accumulation + dedup by URL.
  - How:
    - `setStreamingAnnotations(prev => dedup([...prev, ...incoming]))`.
    - Dedup key: `url.toLowerCase()`.

- [x] 3.3 Gate reasoning display

  - What: Only append reasoning chunks when feature/tier is enabled; otherwise ignore.

- [x] 3.4 Defensive parsing and buffering

  - What: Keep the existing line buffer; on malformed marker JSON, log and continue without breaking the stream.

- [x] 3.5 Frontend tests (unit + integration)

  - What: Mock stream with interleaved content, fragmented markers, multiple annotation batches, and final metadata. Assert UI state updates correctly and no crashes occur.

- [x] 3.6 User verification — Phase 3
  - Summary: Annotations accumulate visually; reasoning only when enabled; final response consistent with metadata.
  - Manual test steps:
    - With web search on, watch sources update as annotation chunks arrive; final sources should be the union.
    - Toggle reasoning on/off and verify UI behavior.
    - Confirm no raw marker strings appear in the chat content.

---

## Phase 4 — Cross-model validation and edge cases (Medium)

// [x] 4.1 Model fixtures and matrix

- What: Create fixtures/scenarios for representative models: Gemini (early deltas), DeepSeek (final message), GPT variants (root annotations), and one that always emits reasoning.

// [x] 4.2 Stress: fragmentation and volume

- What: Simulate heavy fragmentation of SSE and markers, and high-frequency small chunks.

// [x] 4.3 Metrics: time-to-first-annotation

- What: Measure and log TTF-annotation; target < 200ms in typical dev env (best-effort).

  - [ ] 4.4 User verification — Phase 4
  - Manual test steps:
    - Run the model matrix manually; confirm consistent behavior across models.
    - Verify no annotation loss under fragmented conditions.

---

## Phase 5 — Observability and documentation (Medium)

- [x] 5.1 Toggleable verbose logging

- What: Add `STREAM_DEBUG` env gate to print chunk/marker diagnostics in dev; ensure low noise in prod.

- [x] 5.2 Documentation updates

- What: Update `/docs/architecture/streaming.md` and `/docs/api/` to capture the standardized marker protocol and buffering approach; note reasoning gating rules.

- [x] 5.3 User verification — Phase 5
- Manual test steps:
  - Enable `STREAM_DEBUG=1`; confirm useful logs during a sample session.
  - Review docs for clarity and completeness.

---

## Phase 6 — Rollout and fallback (Medium)

- [x] 6.1 Feature flags and staging rollout

  - What: Guard new transform behavior and backend parser behind env flags; deploy to staging first.

- [ ] 6.2 Canary and monitoring

  - What: Watch error logs and user reports; prepare quick flag to revert to old behavior if needed.

- [x] 6.3 Finalize and remove legacy paths

  - What: Remove legacy metadata protocol and regex paths immediately (no PROD back-compat required per plan).

- [x] 6.4 User verification — Phase 6
  - Manual test steps:
    - Flip flags in staging; validate behavior and metrics.
    - Promote to production; monitor.

---

## Success criteria

- Zero annotation data loss in normal conditions across supported models.
- Annotations accumulate and deduplicate correctly; sources always render when web search is used.
- Reasoning never appears when disabled; appears smoothly when enabled.
- No visible marker artifacts in assistant content.
- Frontend parses standardized final metadata reliably.

## Risks and mitigations

- Parser complexity increases: Mitigate with focused unit tests and fixtures.
- Model variability surprises: Cover via model matrix and conservative defaults.
- Performance overhead: Keep parsing O(n) per chunk and avoid heavy regex; optional debug logging only in dev.

## Final tasks

- [ ] Merge schema/docs updates into `/docs/` and any README references.
- [ ] Announce protocol change to contributors; remove legacy support after one release.
