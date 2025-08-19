# Web Search (OpenRouter web plugin)

## Summary

Opt‑in, per‑message Web Search powered by OpenRouter’s model‑agnostic `web` plugin is implemented. We explicitly send `plugins: [{ id: "web", max_results: 3 }]` when the toggle is ON. We normalize `annotations` → `url_citation[]`, persist citations, and compute websearch cost at $4 per 1000 results (0.004/result) with a hard cap of 50 results for billing.

Key facts from official docs:

- Enablement: append `:online` to the model slug (e.g., `openai/gpt-4o:online`) OR send `plugins: [{ id: "web", max_results }]`.
- Annotations: assistant message includes `annotations` with `type: "url_citation"` containing `{ url, title, content?, start_index, end_index }`.
- Pricing: web plugin charges $4 per 1000 results. With `max_results=3`, max of $0.012 per request (in addition to LLM tokens).
- NOTE: `pricing.web_search` in models API is not a capability gate. We will not enable Perplexity models to keep pricing simple.

## Current implementation snapshot

- UI: Web Search toggle available (tier‑gated). Assistant messages with web search show a small "Web" chip and a compact Sources list with title‑only links (mobile friendly; no horizontal scroll).
- Server: `/api/chat` conditionally sends `plugins: [{ id: 'web', max_results: 3 }]`, parses `annotations` and returns normalized citations. `completion_id` is propagated.
- Sync: `/api/chat/sync` POST persists annotations and web flags; GET returns them so clients can render Sources after reload.
- DB: Canonical schema updated. `chat_messages` has `has_websearch BOOLEAN NOT NULL DEFAULT false`, `websearch_result_count INTEGER NOT NULL DEFAULT 0 CHECK (websearch_result_count >= 0 AND websearch_result_count <= 50)`. New table `public.chat_message_annotations` stores `url_citation` rows with RLS. `message_token_costs` includes `websearch_cost DECIMAL(12,6)` and pricing snapshot; recompute function includes websearch with fallback unit price `0.004`.

## Approach (contract)

- Inputs
  - Per-message toggle: Web Search ON/OFF (default OFF).
  - Current model id (e.g., `google/gemini-2.0-flash-exp:free`).
  - Optional future: per-message web options (e.g., `search_prompt`), but default `max_results=3` now.
- Behavior
  - When ON, request uses `model: "<selected>:online"` OR `plugins: [{ id: "web", max_results: 3 }]`.
  - We will use the plugin config path to be explicit and future‑proof.
  - Exclude Perplexity models from toggle (we won’t enable them at launch).
- Outputs
  - Frontend receives assistant content AND `annotations` with `url_citation` entries for rendering.
  - Server enriches the persisted assistant message with `has_websearch=true`, `websearch_result_count`, and stores citations.
  - Costs recorded per assistant message: compute `websearch_cost = (results_used * unit_price)` with `unit_price = 4/1000 = 0.004`.
- Errors
  - Tier not allowed → gated as today.
  - Model disabled (Perplexity) → toggle hidden/disabled.
  - Provider/API errors surface as regular chat errors.

## Data model & analytics changes (implemented)

1. chat_messages

- has_websearch BOOLEAN NOT NULL DEFAULT false
- websearch_result_count INTEGER NOT NULL DEFAULT 0 CHECK (websearch_result_count >= 0 AND websearch_result_count <= 50)
- Indexes: partial index on `has_websearch=true`; btree on `websearch_result_count`.

2. chat_message_annotations (new table)

- Columns: id UUID PK, user_id UUID, session_id TEXT, message_id TEXT, annotation_type TEXT CHECK IN ('url_citation'), url TEXT, title TEXT, content TEXT, start_index INT, end_index INT, created_at TIMESTAMPTZ DEFAULT now()
- Constraints: start/end index sanity check
- Indexes: by message_id; (user_id, created_at desc); by session_id
- RLS: owner‑scoped select/insert/delete

3. message_token_costs

- Added websearch_cost DECIMAL(12,6); pricing_source JSON includes `web_search_price` (unit), `websearch_results`, `websearch_unit_basis='per_result'`
- total_cost includes websearch_cost

4. Pricing source

- model_access includes `web_search_price VARCHAR(20)`; compute fallback `0.004` per result when zero/empty

5. Aggregates

- `user_usage_daily.estimated_cost` updated by delta including websearch_cost (no separate websearch counters yet)

## Server flow changes (implemented)

1. /api/chat (enhanced auth)

- When `webSearchOn: true`, send `plugins: [{ id: 'web', max_results: 3 }]` (no `:online` necessary).
- Parse response annotations and normalize to `url_citation[]`.
- Return `citations`, plus `has_websearch` and `websearch_result_count`; propagate `completion_id`.

2. /api/chat/messages (protected)

- Persist assistant messages with `has_websearch`, `websearch_result_count` and insert one row per citation into `chat_message_annotations`.

3. Cost computation

- Recompute function now includes web search: `websearch_cost = ROUND(LEAST(results_used,50) * unit_price, 6)` with unit_price fallback `0.004`. total_cost includes it. `user_usage_daily.estimated_cost` increments by delta.

Functions/triggers

- `public.recompute_image_cost_for_user_message(p_user_message_id TEXT)` now also computes websearch_cost.
- Called by existing triggers (assistant insert and attachment link) to converge costs.

## Frontend rendering (implemented)

- ChatResponse additions:
  - `citations: Array<{ url: string; title?: string; content?: string; start_index?: number; end_index?: number }>`
- Each assistant message with citations renders a compact “Sources” list.
- Title‑only clickable links, wrapping nicely on mobile (no horizontal scroll).
- A small “Web” chip appears when `has_websearch` is true.

Accessibility

- Provide aria-labels for the Sources list; ensure links are keyboard-focusable.

## Phases

- [x] Phase 1 — Capability detection & UI
- [x] Phase 2 — API wiring
- [x] Phase 3 — Database migration (merged into canonical schema)
- [x] Phase 4 — Cost & telemetry
- [ ] Phase 5 — Docs & tests (this task)

## Clarifying questions (updated)

1. Confirm we will NOT enable Perplexity models at launch; OK to show Web Search for all other allowed models?
2. Is per‑message toggle the desired UX long‑term, or should we add a per‑session default in user preferences later?
3. For citations rendering, is a “Sources” list acceptable for v1, or do you want inline highlight using `start_index/end_index`?
4. Any retention or privacy constraints on storing citations (URLs/snippets) in our DB? If sensitive, we can store minimal `{url,title}` only.
5. For pricing, shall we hard‑fallback to `0.004`/result if `model_access.web_search_price` is empty, and surface that basis in `pricing_source` JSON?

## Risks

- Plugin pricing and unit price availability may vary; we’ll implement a safe fallback (0.004 per result) and include `pricing_source` provenance.
- Some models may return zero citations even when plugin enabled; we must handle 0‑result costs gracefully.
- Streaming: annotations arrive only after the final message; UI should tolerate delayed “Sources.”

## Success criteria

- Users on eligible tiers can toggle Web Search per message; server sends plugin config with `max_results=3`.
- Assistant responses with citations render a Sources list; persisted to DB.
- `message_token_costs.total_cost` includes `websearch_cost`; daily usage aggregates include websearch metrics; analytics views remain consistent.
