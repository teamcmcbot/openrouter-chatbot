# Configure Reasoning Mode

## Summary

Expose an optional Reasoning Mode for models that support it (e.g., `reasoning`, `include_reasoning`, internal reasoning pricing). Respect tier limits and surface cost impacts.

## Reference

- https://openrouter.ai/docs/use-cases/reasoning-tokens

## Findings from docs (what “Reasoning” means)

- OpenRouter provides a unified `reasoning` request object that normalizes provider-specific knobs into one schema. Reasoning tokens are considered output tokens and billed as such.
- Some providers/models do not return their reasoning tokens in the response (e.g., some OpenAI o-series and Gemini Flash Thinking). You can still enable reasoning; the model may not expose the actual “thinking” text back.

## All ways to activate reasoning (and parameters)

Recommended unified parameter (use this; avoid per-model branching):

- reasoning: {
  - effort?: "low" | "medium" | "high"
    - OpenAI/Grok-style. OpenRouter maps this to a fraction of max_tokens.
    - Approx allocation: low ≈ 20%, medium ≈ 50%, high ≈ 80% of max_tokens.
  - max_tokens?: number
    - Anthropic-style (direct reasoning budget). Min 1024, max 32000. If using effort only, providers that need max_tokens will infer from effort ratio × max_tokens.
    - Important: response max_tokens must be strictly greater than reasoning budget.
  - exclude?: boolean (default false)
    - If true, model uses internal reasoning but omits reasoning text in response.
  - enabled?: boolean - If true with no other fields, enables reasoning at “medium” effort by default. Typically you’ll set effort or max_tokens instead.
    }

Legacy compatibility (prefer not to add new usage):

- include_reasoning: true → equivalent to reasoning: {}
- include_reasoning: false → equivalent to reasoning: { exclude: true }

Provider notes from docs:

- Anthropic (Claude 3.7/4/4.1): use the unified reasoning object; `:thinking` variants are deprecated. When given effort, OpenRouter computes budget from max_tokens using the effort ratios; when given `reasoning.max_tokens`, it uses that directly (bounded to [1024, 32000]).
- OpenAI reasoning models (o1/o3/GPT-5) and Grok: accept `reasoning.effort` directly; some do not return reasoning blocks.
- Gemini “thinking” models: some variants do not return reasoning tokens.

Implication: we can send the same `reasoning` object across supported models. The UI can still check `supported_parameters` for ‘reasoning’/‘include_reasoning’ to decide toggle visibility.

## Pricing & accounting

- Reasoning tokens are billed as output tokens (no separate meter). Expect higher completion tokens and latency when enabled.
- Some providers expose `pricing.internal_reasoning` (e.g., Perplexity). If we’re not using those models, we can ignore that field. Keep the DB column for forward compatibility but do not factor it into totals unless present and applicable.

## Default activation strategy (recommendation)

- Enterprise-only toggle: Gate by AuthContext.features/tier. Hide/disable the toggle for non-enterprise.
- Default configuration when enabled: `reasoning: { effort: "low" }` to minimize cost; avoid `enabled: true` (defaults to medium) unless we explicitly want medium.
- No per-model branching: always pass the unified `reasoning` object. OpenRouter will translate for each provider. Only guard the UI with `supported_parameters.includes('reasoning') || includes('include_reasoning')` so users don’t see a toggle on unsupported models.
- Optional future control: surface a dropdown for effort (low/medium/high) or an advanced numeric input for `reasoning.max_tokens` for Anthropic, but keep default on “low”.

## Response shape and what to store

When reasoning is enabled and returned by a model:

- Response message may include:
  - message.reasoning: the reasoning text (aka thinking tokens, sometimes within <think>…</think> or provider-specific blocks). This may be absent for models that don’t return it or when `exclude: true`.
  - message.reasoning_details: structured “reasoning blocks” used to preserve state across tool calls. For OpenAI (reasoning models) and Anthropic, these blocks should be preserved in follow-up messages if you want continuity during tools.
  - Streaming: reasoning may arrive in delta.reasoning chunks interleaved with delta.content.
- Usage/counters:
  - Reasoning tokens count towards completion/output tokens. Some providers may also emit a separate field; our types already anticipate `native_tokens_reasoning`.

DB storage plan (proposal – implement via patch after sign-off):

- messages.reasoning TEXT (nullable) – raw reasoning text if returned and not excluded.
- messages.reasoning_details JSONB (nullable) – array/object with provider-normalized “reasoning blocks” to be passed back unmodified on subsequent calls (esp. during tool use).
- generations/native usage table: native_tokens_reasoning INTEGER DEFAULT 0 – store if reported; otherwise derive as part of output tokens where possible.
- Keep existing columns for input/output tokens; no separate costs unless a model actually defines `internal_reasoning_price`.

UI/UX plan for display:

- Show a collapsible “Reasoning” section on assistant messages when message.reasoning or message.reasoning_details exists. Default collapsed with a badge (R1 or “Reasoning”).
- Tooltip on the toggle: “Enables model thinking steps; increases output tokens and latency. Enterprise-only.”
- Optional “Don’t include in response” sub-toggle (maps to `exclude: true`) if we want to save bandwidth while still allowing internal reasoning; default off.

## Implementation notes (wiring)

- Client → API (/api/chat):
  - Extend request body with an optional `reasoning` object: { effort?: 'low'|'medium'|'high'; max_tokens?: number; exclude?: boolean; enabled?: boolean }.
  - Validate: enterprise tier only; model.supported_parameters includes 'reasoning' or 'include_reasoning'; if user picks effort, do not include max_tokens simultaneously.
  - Send unified `reasoning` to OpenRouter; do not branch by provider.
- API → usage accounting:
  - Continue to rely on output token usage. If response exposes a reasoning-specific count, map it to `native_tokens_reasoning` while also counting in completion tokens.
- Persistence:
  - Save message.reasoning and message.reasoning_details when present. On tool follow-ups, pass back previous assistant message.reasoning_details unmodified to preserve continuity.

## Answers to clarifying items

1. Models at launch and tier: Use any model that lists `supported_parameters` including 'reasoning' or 'include_reasoning'; gate the UI and API to enterprise tier only as requested.
2. Cap per request: Start with `effort: "low"`. For Anthropic, if/when exposing advanced settings, enforce min 1024 and max 32000 for `reasoning.max_tokens`, and ensure `response.max_tokens > reasoning.max_tokens`.
3. UX: Start with a per-message toggle (default off). Later, add a per-session default in preferences.
4. Billing display: Fold reasoning into total output tokens. No separate line unless a model exposes `internal_reasoning_price` (rare). Keep the column for forward-compat.
5. Telemetry: Track toggle usage and `native_tokens_reasoning` (when available) for admin analytics. Feature adoption can be reported as % of requests with reasoning enabled.

## Base Requirements

- From UI, under send message text area, add a toggle for "Enable Reasoning" with a tooltip explaining the feature and costs. Default maps to `reasoning: { effort: "low" }`.
- Toggle visible only when the selected model’s `supported_parameters` includes `reasoning` or `include_reasoning`.
- Gate to enterprise tier only (per current preference). Tooltip should clarify availability and cost/latency trade-off.
- Follow the same UI pattern as the existing Web Search button:
  - A compact button in the input toolbar that opens a popover on click.
  - For eligible users (enterprise): popover shows "Enable reasoning" with a short explanation and a confirm action.
  - For ineligible users (non-enterprise): popover shows "Upgrade to enable reasoning" with a link/action to upgrade.

## Current implementation snapshot

- Models: samples include `supported_parameters` with `reasoning` and `include_reasoning`; pricing includes `internal_reasoning` in `lib/utils/openrouter.ts` and `/api/models`.
- No UI or API parameter currently wires reasoning flags into `/api/chat`.
- Token validation and features gating already exist (`validateRequestLimits`, `AuthContext.features`).
- Types already anticipate `native_tokens_reasoning`; UI has capability badges for reasoning-capable models.

## Approach (contract)

- Inputs: boolean toggle (Enable reasoning), optional `effort` (low|medium|high), optional `max_tokens` (Anthropic-style), optional `exclude`; current model id and tier.
- Outputs: chat request includes unified `reasoning` object; response usage accounts for extra cost in output tokens and optionally `native_tokens_reasoning` if returned.
- Errors: unsupported model, tier not allowed, exceeded reasoning token budget.

## Phases

- [x] Phase 1 — Database patch (prepare, verify, merge)

  - [x] Create patch at `database/patches/reasoning-mode/` with forward/reverse SQL and verification:
    - [x] ALTER TABLE `public.chat_messages` ADD COLUMNS (idempotent):
      - `reasoning` TEXT NULL
      - `reasoning_details` JSONB NULL
      - (intentionally omitted) `native_tokens_reasoning` — not available in current flow
    - [x] No function changes required
  - Note: We removed unused DB functions `public.sync_user_conversations(...)` and `public.get_session_with_messages(...)` from the schema. A dedicated drop patch exists under `database/patches/drop-orphaned-chat-functions/` for live DB cleanup.
    - [x] Ensure RLS unchanged (columns are additive); add indexes later if warranted.
  - [x] User verification: ran forward migration; confirmed new columns exist. No DB function updates required.
  - [x] Canonical schema updated (`database/schema/02-chat.sql`).

- [ ] Phase 2 — UI elements (no backend wiring yet)

  - [x] From `/api/models`, surface `supported_parameters` and `pricing.internal_reasoning` to the client (keep internal_reasoning for forward-compat only).
    - Note: `supported_parameters` is already present in client `ModelInfo` and used for capability checks.
  - [x] Add a Reasoning control in the input toolbar mirroring the Web Search button:
    - [x] Button opens a popover.
    - [x] Enterprise: popover shows "Enable reasoning" with brief cost/latency note and confirm.
    - [x] Non-enterprise: popover shows "Upgrade to enable Reasoning" with upgrade action.
  - [x] Enable the control only when selected model’s `supported_parameters` includes `reasoning` or `include_reasoning`; otherwise show an anchored notice on click.
  - [x] Tests: add UI gating tests for free tier, unsupported model, and enterprise ON state.
  - [x] User verification: on supported models, enterprise sees enable popover and can toggle ON; non-enterprise sees upgrade popover; unsupported model shows notice.

- [ ] Phase 3 — API wiring and data flow

  - [ ] Frontend: when enabled, send `reasoning` object with default `{ effort: "low" }` in POST `/api/chat`.
  - [ ] Backend `/api/chat`:
    - [ ] Gate by tier using standardized auth middleware; validate model support; reject if unsupported/non-enterprise.
    - [ ] Forward unified `reasoning` to OpenRouter.
    - [ ] Parse response; capture `message.reasoning`, `message.reasoning_details`, and any `native_tokens_reasoning` if present.
    - [ ] Persist to `public.chat_messages` (new columns) and maintain existing token counts.
  - [ ] Frontend rendering:
    - [ ] Render a collapsible Reasoning section when reasoning or reasoning_details exists.
    - [ ] Support streaming of reasoning where provided (delta.reasoning) alongside content.
  - [ ] Tool-calling continuity:
    - [ ] Frontend to include preserved `reasoning_details` when sending follow-up messages via POST `/api/chat/messages`.
    - [ ] Backend to merge/forward reasoning blocks unmodified.
  - [ ] User verification: network requests show correct `reasoning` object; DB rows include reasoning fields; UI displays reasoning where available.

- [ ] Phase 4 — History sync and chat rendering

  - [ ] Ensure GET `/api/chat/sync` includes `reasoning`, `reasoning_details`, and `native_tokens_reasoning` for assistant messages.
  - [ ] `ChatInterface` renders reasoning data properly from synced history (collapsed by default, expandable on click).
  - [ ] User verification: history loads with reasoning intact; expanding shows stored reasoning blocks/text consistently.

- [ ] Phase 5 — Docs
  - [ ] Add `/docs/components/chat/reasoning-mode.md` and update model capability docs.

## Open questions (defer for later)

- Should we allow users to choose effort vs. a numeric cap for Anthropic? If yes, add tier-based limits for `reasoning.max_tokens`.
- Do we want an organization-level default (workspace setting) that turns on low-effort reasoning for all sessions?

## Clarifying questions

1. Which models to support at launch? Any tier restrictions?
2. Should we cap reasoning tokens per request? Default cap per tier?
3. UX: per-message toggle vs. per-session default in preferences?
4. Billing: how to display reasoning cost (separate line vs. folded into total)?
5. Telemetry granularity desired for reasoning usage?

## Risks

- Provider inconsistency in param names and billing.
- Latency spikes and higher costs if not gated.

## Success criteria

- Users can opt into reasoning only on supported models; requests succeed and are billed accurately.
