# Web Search (OpenRouter web plugin)

## Summary

Add an opt‑in, per‑message Web Search feature powered by OpenRouter’s model‑agnostic `web` plugin. Enable by appending `:online` to the model slug (exact shortcut to `plugins: [{ id: "web" }]`) and customize defaults (set `max_results` to 3). Return and render standardized URL citations from the response annotations. Track web search usage and costs at $4 per 1000 results.

Key facts from official docs:

- Enablement: append `:online` to the model slug (e.g., `openai/gpt-4o:online`) OR send `plugins: [{ id: "web", max_results }]`.
- Annotations: assistant message includes `annotations` with `type: "url_citation"` containing `{ url, title, content?, start_index, end_index }`.
- Pricing: web plugin charges $4 per 1000 results. With `max_results=3`, max of $0.012 per request (in addition to LLM tokens).
- NOTE: `pricing.web_search` in models API is not a capability gate. We will not enable Perplexity models to keep pricing simple.

## Current implementation snapshot

- UI: `MessageInput.tsx` already shows a Web Search button with tier gating and an ON/OFF toggle modal (UI-only state `webSearchOn`).
- Server: `/api/chat` does not yet set `:online` nor `plugins` and does not parse/forward `annotations`.
- DB: no columns/tables to persist citations or web search costs; `message_token_costs` only tracks token/image costs.

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

## Data model & analytics changes

Minimal viable, normalized for analytics:

1. chat_messages (new columns)

- has_websearch BOOLEAN DEFAULT false
- websearch_result_count INTEGER DEFAULT 0 CHECK (websearch_result_count >= 0)
- websearch_options JSONB DEFAULT '{}' (store `{ max_results, search_prompt? }` used for this request)
- web_annotations JSONB DEFAULT '[]' (optional denormalized cache of citations for faster reads)

2. chat_message_annotations (new table)

- id UUID PK DEFAULT gen_random_uuid()
- message_id TEXT NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE
- type TEXT NOT NULL CHECK (type IN ('url_citation'))
- url TEXT NOT NULL
- title TEXT NULL
- content TEXT NULL
- start_index INTEGER NULL
- end_index INTEGER NULL
- created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  Indexes: `idx_msg_annotations_message_id (message_id)`, consider `idx_msg_annotations_type (type)`; RLS aligned to session ownership via join on `chat_messages` → `chat_sessions`.

3. message_token_costs (new web-search fields)

- websearch_results INTEGER NOT NULL DEFAULT 0
- websearch_unit_price DECIMAL(12,8) NULL (fallback to 0.004 when absent)
- websearch_cost DECIMAL(12,6) NULL
- total_cost updated to include websearch_cost

4. user_usage_daily (new aggregates)

- websearch_results INTEGER DEFAULT 0
- websearch_cost DECIMAL(12,6) DEFAULT 0.000000

5. model_access (no schema change)

- We already store `web_search_price` (string). If OpenRouter omits it, we treat plugin price as $4/1000 results (`0.004`) at compute time.

6. api_user_summary (view)

- Optionally extend to expose today’s `websearch_results` and `websearch_cost` alongside tokens/messages.

## Server flow changes

1. /api/chat (enhanced auth)

- When request indicates `webSearchOn: true` (front-end flag), send:
  - `plugins: [{ id: 'web', max_results: 3 }]`
  - Keep base model unchanged (no `:online` needed since `plugins` is explicit). Alternatively, we can still append `:online` as a safety shortcut.
- Parse response `choices[0].message.annotations` and keep `url_citation[]` list.
- Return annotations in `ChatResponse` as `citations` array (stable, typed).

2. /api/chat/messages (protected)

- For assistant message inserts, accept optional `citations` payload and `web_search_options` used.
- Persist:
  - `has_websearch = citations.length > 0 || web_search_options?.enabled === true`
  - `websearch_result_count = citations.length`
  - `websearch_options = { max_results: 3, ... }`
  - Insert one row per citation into `chat_message_annotations`.

3. Cost computation

- Extend cost recompute path to add web search cost:
  - Determine `results_used = websearch_result_count` for the assistant message.
  - Determine `websearch_unit_price = COALESCE(model_access.web_search_price::decimal, 0.004)`.
  - `websearch_cost = ROUND(results_used * websearch_unit_price, 6)`.
  - Upsert into `message_token_costs` with new fields; recompute `total_cost` to include websearch.
- Update `user_usage_daily` by delta:
  - Increment `websearch_results` and `websearch_cost` for today.

Functions/triggers to update

- public.recompute_image_cost_for_user_message → generalize to `recompute_message_costs(p_user_message_id TEXT)` to also compute web search costs, or add a sibling `recompute_websearch_cost_for_user_message(p_assistant_message_id TEXT)`; then call both from the assistant insert trigger.
- public.calculate_and_record_message_cost (assistant insert trigger) → after insert, call recompute(s) to ensure web/image costs converge once annotations/options are stored.
- public.track_user_usage → keep signature; add new helper `public.update_websearch_usage(p_user_id UUID, p_results INT, p_cost DECIMAL)` that upserts `user_usage_daily` deltas and can be called inside recompute.

## Frontend rendering

- ChatResponse additions:
  - `citations: Array<{ url: string; title?: string; content?: string; start_index?: number; end_index?: number }>`
- UI: In each assistant message bubble, render a compact “Sources” section when citations exist:
  - Show domain-labeled markdown links, e.g., `[nytimes.com](https://nytimes.com/...)`.
  - Optionally highlight cited ranges using `start_index/end_index` when we switch to rich rendering; v1 can omit inline highlighting.
  - Add a small “Web” chip on the message header when `has_websearch`.

Accessibility

- Provide aria-labels for the Sources list; ensure links are keyboard-focusable.

## Phases

- [ ] Phase 1 — Capability detection & UI

  - [ ] Always show the Web Search button for allowed (non‑Perplexity) models; keep tier gating as implemented.
  - [ ] Settings modal toggle remains per-message; add a one-line note about cost/privacy (e.g., “Web lookups may share your query with third‑party search providers. Up to 3 results. Max ~$0.012 per request.”).
  - [ ] User verification: toggle appears for non‑Perplexity models; gating works for anonymous/free.

- [ ] Phase 2 — API wiring

  - [ ] Add `plugins: [{ id: 'web', max_results: 3 }]` to `/api/chat` when enabled; do not rely on `pricing.web_search`.
  - [ ] Parse `annotations` from OpenRouter response; include `citations` in `ChatResponse`.
  - [ ] Pass `citations` and `web_search_options` to `/api/chat/messages` when persisting.
  - [ ] User verification: server logs show plugins payload; a sample request shows `citations` returned.

- [ ] Phase 3 — Database migration

  - [ ] Add columns to `chat_messages`: `has_websearch`, `websearch_result_count`, `websearch_options`, `web_annotations`.
  - [ ] Create `chat_message_annotations` with RLS inheriting session ownership.
  - [ ] Extend `message_token_costs` with `websearch_results`, `websearch_unit_price`, `websearch_cost`.
  - [ ] Extend `user_usage_daily` with `websearch_results`, `websearch_cost`.
  - [ ] Update relevant indexes and policies.
  - [ ] User verification: run migration; insert a fixture assistant message with 3 citations; verify counts and costs computed.

- [ ] Phase 4 — Cost & telemetry

  - [ ] Implement recompute path to calculate `websearch_cost` using results used and unit price fallback `0.004`.
  - [ ] Update daily aggregates and admin analytics queries; optionally extend `api_user_summary` to expose today’s websearch metrics.
  - [ ] User verification: daily usage shows `websearch_results`/`websearch_cost`; per-message `message_token_costs` rows include websearch fields.

- [ ] Phase 5 — Docs & tests
  - [ ] Add `/docs/components/chat/web-search.md` covering UX, privacy, and cost.
  - [ ] Add unit tests for MessageInput gating/toggle and Chat API payload (plugins present when ON).
  - [ ] Add DB migration tests for cost recompute and usage deltas.

## Clarifying questions (updated)

1. Confirm we will NOT enable Perplexity models at launch; OK to show Web Search for all other allowed models?
2. Is per‑message toggle the desired UX long‑term, or should we add a per‑session default in user preferences later?
3. For citations rendering, is a “Sources” list acceptable for v1, or do you want inline highlight using `start_index/end_index`?
4. Any retention or privacy constraints on storing `web_annotations` (URLs/snippets) in our DB? If sensitive, we can store minimal `{url,title}` only.
5. For pricing, shall we hard‑fallback to `0.004`/result if `model_access.web_search_price` is empty, and surface that basis in `pricing_source` JSON?

## Risks

- Plugin pricing and unit price availability may vary; we’ll implement a safe fallback (0.004 per result) and include `pricing_source` provenance.
- Some models may return zero citations even when plugin enabled; we must handle 0‑result costs gracefully.
- Streaming: annotations arrive only after the final message; UI should tolerate delayed “Sources.”

## Success criteria

- Users on eligible tiers can toggle Web Search per message; server sends plugin config with `max_results=3`.
- Assistant responses with citations render a Sources list; persisted to DB.
- `message_token_costs.total_cost` includes `websearch_cost`; daily usage aggregates include websearch metrics; analytics views remain consistent.
