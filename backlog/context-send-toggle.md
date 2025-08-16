# Toggle: Send prior context

## Summary

Per-message option to include or exclude previous messages in the prompt to save input tokens, with safe defaults and clear UX.

## Current implementation snapshot

- Chat API currently builds `messages` from provided body without a user-controlled flag.
- Token limits and estimation exist (`estimateTokenCount`, `getModelTokenLimits`, `validateRequestLimits`).
- Preferences schema has `session.max_history` but not an explicit "send context" toggle.

## Approach (contract)

- Inputs: boolean `include_context` per send; when false, only system + current user message is sent.
- Outputs: reduced token usage; UI shows token estimate before send.
- Errors: none beyond existing token gates; warn if disabled context may degrade quality.

## Phases

- [ ] Phase 1 — UI + state
  - [ ] Add a toggle near the send button (Remember context), default on.
  - [ ] Persist last choice per session in local state; optional user preference.
  - [ ] User verification: toggle state affects next send.
- [ ] Phase 2 — API assembly
  - [ ] When `include_context=false`, truncate messages to system + last user message.
  - [ ] Update token estimation to reflect flag; show preview counter.
  - [ ] User verification: server logs show reduced message count and tokens.
- [ ] Phase 3 — Guardrails
  - [ ] Add tooltip explaining tradeoffs; optional auto-on when model signals poor performance without context.
  - [ ] User verification: UX copy clarity.
- [ ] Phase 4 — Docs
  - [ ] Add `/docs/components/chat/context-toggle.md` and FAQ entry.

## Clarifying questions

1. Default state per session or global preference? If global, store in `preferences.session`?
2. Should assistants override and force context on for function/tool cases?
3. Any minimum context (e.g., last assistant message) we must always keep?
4. Should this be disabled for streaming for now?

## Risks

- Users may forget it’s off and get lower-quality answers.
- Some providers may require limited prior context for safety formatting.

## Success criteria

- Users can disable context and observe lower token usage; no server errors.
