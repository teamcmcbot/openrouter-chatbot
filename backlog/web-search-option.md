# Web search option via OpenRouter

## Summary

Allow users to enable web search integration for models and providers that support it via OpenRouter API parameters.

## Current implementation snapshot

- Samples include `pricing.web_search` and `supported_parameters` containing `tools`/`tool_choice`.
- No UI or server parameter wiring for web search found.

## Approach (contract)

- Inputs: toggle (Allow web search) and optional sources/scope; current model id.
- Outputs: chat requests include `web_search=true` or appropriate tool instruction; costs tracked if billed.
- Errors: unsupported model, tier not allowed, provider errors.

## Phases

- [ ] Phase 1 — Capability detection & UI
  - [ ] Show toggle when model has `pricing.web_search` or supported parameter indicates search tool.
  - [ ] Explain cost and data-sharing implications.
  - [ ] User verification: toggle appears appropriately.
- [ ] Phase 2 — API wiring
  - [ ] Pass provider-specific search flag/tool schema in `/api/chat` when enabled.
  - [ ] Validate tier & model.
  - [ ] User verification: server logs show search enabled; provider receives correct params.
- [ ] Phase 3 — Cost & telemetry
  - [ ] Persist web-search usage and cost when reported.
  - [ ] User verification: costs visible in usage pages.
- [ ] Phase 4 — Docs
  - [ ] `/docs/components/chat/web-search.md` and privacy note.

## Clarifying questions

1. Which providers/models to enable at launch?
2. What UX: global toggle vs. per-message?
3. Do we need to surface citations/links from provider result?
4. Any compliance constraints for sending queries to the web?

## Risks

- Provider-specific shapes for search tools; need abstraction.

## Success criteria

- Users can opt into web search on supported models; requests succeed; costs/telemetry recorded.
