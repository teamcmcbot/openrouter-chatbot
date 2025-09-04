# Configurable Web Search Max Results

Goal: Make the Web Search feature configurable per message with a slider (1–5, default 3). The chosen value is sent to the server and used as `plugins: [{ id: 'web', max_results: <N> }]` when calling OpenRouter `/chat/completions`, for both sync and streaming flows. Cost accounting and analytics must remain correct.

## Assumptions

- Current per-message UI shows a popover with a Web Search toggle.
- Server already tier-gates `webSearch` (Pro/Enterprise only). We’ll keep this and also clamp `webMaxResults` server-side.
- DB already computes web search cost per result using `websearch_result_count` × `web_search_price` with a cap at 50.
- We won’t change pricing logic; only make the requested max configurable.
- Range allowed client-side: 1–5. Server will clamp 1–10 (existing helper) and may further clamp by tier if desired.

## Phases

### Phase 1 – Frontend UI and wiring

- [ ] Add a slider control (1–5, default 3) in the Web Search popover.
  - When toggle is ON, enable the slider; when OFF, disable it.
  - Persist selection per message input state.
- [ ] Include `webMaxResults` in the message send payloads for both sync and streaming:
  - `components/chat/MessageInput.tsx`: pass `{ webSearch: webSearchOn, webMaxResults }` to `onSendMessage`.
  - `hooks/useChatStreaming.ts`: forward `webMaxResults` into the request body for `/api/chat` and `/api/chat/stream`.
- [ ] Accessibility: slider should have label, min/max ticks (1,2,3,4,5), and reflect value.

User Test Steps

- Toggle Web Search ON → slider appears/enabled defaulting to 3.
- Move slider to 5, send message → on the network tab, POST body includes `"webMaxResults": 5`.
- Toggle OFF → slider disabled/ignored; no web plugin sent.

Verification Gate

- [ ] You confirm the UI and payload work as above.

### Phase 2 – Backend API: accept and pass-through

- [ ] `/api/chat`: read `body.webMaxResults`, sanitize to integer, clamp to [1,10] (existing builder clamps too), and pass to `getOpenRouterCompletion({ webSearch, webMaxResults, reasoning })` instead of hard-coded 3.
- [ ] `/api/chat/stream`: same logic, pass to `getOpenRouterCompletionStream`.
- [ ] Optional tier-based clamp: derive max allowed from `authContext.features` (e.g., Pro ≤ 5, Enterprise ≤ 10) and re-clamp.
- [ ] Logging: log the final `webMaxResults` used for traceability.

User Test Steps

- With slider=5, observe the server logs show `webMaxResults: 5`.
- If you set slider above allowed tier (if implemented), server clamps and logs the clamped value.

Verification Gate

- [ ] You confirm the pass-through and clamping behavior from logs and request builder.

### Phase 3 – OpenRouter request & cost correctness

- [ ] The request builder (`lib/utils/openrouter.ts`) already supports `options.webMaxResults` and clamps to 1–10; keep this.
- [ ] Confirm that OpenRouter request carries `plugins: [{ id: 'web', max_results: <N> }]` when `webSearch=true`.
- [ ] Ensure response normalization still sets `has_websearch` and `websearch_result_count = annotations.length`.
- [ ] DB cost computation remains unchanged: `ROUND(LEAST(websearch_result_count, 50) * web_search_price, 6)`.

User Test Steps

- With slider=5 and 4 citations returned, `websearch_result_count` should be 4, cost ≈ 4 × unit price.
- With slider=1 and 0 citations returned, `has_websearch=true`, `websearch_result_count=0`, cost=$0.

Verification Gate

- [ ] You confirm citation counts and cost aggregation in the usage UI and DB.

### Phase 4 – Docs & tests

- [ ] Update docs:
  - `docs/api/chat.md`, `docs/api/streaming-chat-api.md`: add `webMaxResults` to request schema, examples, and describe clamping and tier gating.
  - `docs/components/chat/web-search.md`: replace fixed `max_results=3` statements; document slider (1–5 default 3) and pricing per result.
- [ ] Update or add tests:
  - Components: assert payload includes `webMaxResults` when toggle ON and slider set.
  - API: unit/integration test that request body with `webMaxResults=N` results in `plugins: [{ id: 'web', max_results: N }]`.

User Test Steps

- Run tests; ensure no regressions and updated assertions pass.

Verification Gate

- [ ] You sign off on updated docs and tests.

### Phase 5 – Optional DB audit field (low-risk enhancement)

- [ ] (Optional) Add `chat_messages.websearch_requested_max INTEGER NOT NULL DEFAULT 3 CHECK (websearch_requested_max BETWEEN 0 AND 50)` for analytics.
- [ ] Persist requested max for assistant message rows when saving metadata.
- [ ] Include this in analytics views if needed.

User Test Steps

- After messages, query messages table to see requested max persisted.

Verification Gate

- [ ] You confirm data is persisted and useful.

## Affected Files (initial)

- Frontend
  - `components/chat/MessageInput.tsx` – add slider UI, state, and payload.
  - `hooks/useChatStreaming.ts` – pass `webMaxResults` to both endpoints.
- Backend
  - `src/app/api/chat/route.ts` – read, clamp, pass `webMaxResults`.
  - `src/app/api/chat/stream/route.ts` – read, clamp, pass `webMaxResults`.
- Shared
  - `lib/utils/openrouter.ts` – already supports `webMaxResults` and clamps 1–10.
- Optional DB
  - Migration patch under `database/patches/configurable-websearch-max/` to add `websearch_requested_max` column (if chosen).
- Docs/tests
  - Update docs under `docs/api/` and `docs/components/`.
  - Add/adjust tests under `tests/` accordingly.

## Acceptance Criteria

- Slider appears in the Web Search popover when enabled; range 1–5, default 3.
- Payloads include `webMaxResults` for both sync and streaming when Web Search is ON.
- Backend accepts, clamps, and forwards value to OpenRouter; defaults preserved when omitted.
- Requests to OpenRouter include `plugins: [{ id: 'web', max_results: <N> }]`.
- `websearch_result_count` still derived from returned annotations; cost accounting unchanged and correct.
- Docs and tests are updated; build/test pass.

## Open Questions (please confirm)

1. Should tiers further restrict `webMaxResults` (e.g., Pro ≤ 5, Enterprise ≤ 10), or keep 1–5 for all eligible tiers?

- Not required for now.

2. Do we want to persist `websearch_requested_max` in `chat_messages` for analytics?

- Not required for now.

3. Any product copy changes for the popover (helper text re: per-result cost)?

- Not required for now.
