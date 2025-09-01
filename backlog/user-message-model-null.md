# User message `model` is often null — analysis and impact

Date: 2025-09-02
Owner: Admin Analytics
Status: Draft (discussion)

## Problem overview

- Today, many error rows (and some normal rows) have `chat_messages.model` = NULL for `role = 'user'`.
- We currently persist an authoritative model on the assistant message and in `message_token_costs.model_id` (cost snapshot), but not always on the user message.
- Errors raised prior to assistant generation (validation, content-size, provider preflight, network) are attached to the user message and therefore lack a model.

## Why the model is not saved on user messages

- App flow: user sends → we create a `user` message, then try to generate an `assistant` reply.
- The resolved model is selected at the time of calling the provider and persisted on the assistant message (and cost snapshot). The user message insert often happens before model resolution, so `user.model` remains NULL.
- In some paths we rely on `chat_sessions.last_model` as a convenience, but it is not enforced at write-time for the user message.

## Impact if we start saving model on user messages

### A) UserSettings analytics (Today / All time)

Depending on current implementations:

- If metrics for models/tokens are derived from assistant messages (or `message_token_costs`), then adding `user.model` will NOT double count. It only improves the ability to attribute events that happen on the user message (e.g., error rates by model, pre-inference costs like websearch flags) — provided queries explicitly scope to one role or cost table.
- If some UserSettings tiles count per-message without filtering by role, then once `user.model` is populated those queries could start surfacing user messages in model-based charts as well. That may or may not be desired: user messages represent prompts; assistant messages are completions. We should keep model-attribution semantics consistent per chart:
  - Tokens in/out, cost, latency: assistant-only (from `message_token_costs` or assistant rows)
  - Prompt-side metrics: user-only (if we ever add prompt pricing)
  - Total message counts: count both roles, but do not group user+assistant under the same “model usage” unless explicitly intended.
- Conclusion: No inherent double counting if queries remain role-aware and/or based on the cost table for cost/token metrics. We will audit any charts that group by model from `chat_messages` to ensure a role filter is present.

### B) /usage/costs page impact

- The `/usage/costs` endpoints derive from `message_token_costs` and/or admin functions that aggregate that table. That table is written only for successful assistant messages.
- Therefore, saving model on the user message will NOT affect `/usage/costs` totals or series. Verified by inspecting `database/schema/02-chat.sql`:
  - `message_token_costs` is populated in `recompute_image_cost_for_user_message()` for assistant rows only.
  - Views/functions like `user_model_costs_daily` and `get_global_model_costs` aggregate `message_token_costs`.
- Conclusion: No changes to `/usage/costs` numbers from adding `user.model`.

### C) Will having models on both roles double-count?

- Not if queries remain role-aware. Examples:
  - Tokens in/out averages: derive from `message_token_costs` or assistant rows → no double counting.
  - "Models used" charts intended to reflect completions: filter `WHERE role='assistant'` (or use cost table) → no double counting.
  - If we add a prompt-centric chart later, filter `WHERE role='user'` intentionally.
  - Only ambiguous case is a naive per-message group-by(model) with both roles mixed; we will audit and add role filters.

## Proposed fixes (options)

1. Write-time set on user messages (recommended forward)
   - At user send time, set `chat_messages.model = selected_model`.
   - Minimal app change, authoritative going forward.
2. Triggers for safety/backfill
   - BEFORE INSERT on `chat_messages` for `role='user'`: if `NEW.model` is null, set from `chat_sessions.last_model`.
   - AFTER INSERT on `chat_messages` for `role='assistant'`: update linked user message model = COALESCE(existing, assistant.model).
   - One-time backfill for historical user messages using assistant linkage and session.last_model.
3. Pending assistant pattern (optional, larger change)
   - Insert an assistant row in `pending` state first with the model; attach errors there. Guarantees model on error rows.

## Analytics guardrails to avoid double counting

- Cost and tokens: always use `message_token_costs` (assistant-only source of truth).
- Model usage charts built off `chat_messages`: add `WHERE role = 'assistant'` unless the intent is to reflect prompts.
- Error analytics: with user model populated, errors tied to user messages can be grouped by model reliably.

## Operational plan

- Choose 1) now, add 2) for historical completeness.
- Prepare forward-only SQL patch with triggers and backfill and run in staging first.
- Update any charts that query `chat_messages` grouped by model to be role-aware.

## Appendix: recent errors enrichment

- We deployed an admin function `get_recent_errors` that enriches model using:
  `COALESCE(m.model, costs by assistant_message_id, costs by user_message_id, assistant reply model via user_message_id, session.last_model)`.
- This improves near-term visibility but does not replace write-time persistence on user messages.
