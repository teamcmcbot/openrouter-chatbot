# Configure Reasoning Mode

## Summary

Expose an optional Reasoning Mode for models that support it (e.g., `reasoning`, `include_reasoning`, internal reasoning pricing). Respect tier limits and surface cost impacts.

## Current implementation snapshot

- Models: samples include `supported_parameters` with `reasoning` and `include_reasoning`; pricing includes `internal_reasoning` in `lib/utils/openrouter.ts` and `/api/models`.
- No UI or API parameter currently wires reasoning flags into `/api/chat`.
- Token validation and features gating already exist (`validateRequestLimits`, `AuthContext.features`).

## Approach (contract)

- Inputs: boolean toggle (Enable reasoning), optional max reasoning tokens if supported by model; current model id.
- Outputs: chat request includes model-specific reasoning params; response usage accounts for extra cost if reported.
- Errors: unsupported model, tier not allowed, exceeded reasoning token budget.

## Phases

- [ ] Phase 1 — Capability discovery
  - [ ] From `/api/models`, surface `supported_parameters` and `pricing.internal_reasoning` to the client.
  - [ ] UI toggle appears only for models that list `reasoning` or `include_reasoning`.
  - [ ] User verification: toggle visible only for supported models.
- [ ] Phase 2 — API wiring
  - [ ] Extend chat request to pass reasoning params when enabled.
  - [ ] Validate against feature flags and tier allowances.
  - [ ] User verification: requests contain correct params; blocked when unsupported.
- [ ] Phase 3 — Pricing & limits
  - [ ] If provider reports reasoning tokens/cost, persist `native_tokens_reasoning` and map to `internal_reasoning` cost.
  - [ ] UI warning explains cost and latency tradeoffs.
  - [ ] User verification: costs are reflected and totals consistent.
- [ ] Phase 4 — Docs
  - [ ] Add `/docs/components/chat/reasoning-mode.md` and update model capability docs.

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
