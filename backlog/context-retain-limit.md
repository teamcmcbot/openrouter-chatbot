# Preference: number of messages to retain

## Summary

User preference to cap how many prior messages are included in each request (soft window), integrated with existing `preferences.session.max_history`.

## Current implementation snapshot

- `lib/types/user-data.ts` includes `session.max_history?: number`.
- No visible UI to edit this; chat assembly doesn’t enforce the cap explicitly.

## Approach (contract)

- Inputs: integer `max_history` (e.g., 0..N, 0 = none, null = unlimited, with reasonable hard cap by model/tier).
- Outputs: messages array truncated to last N user+assistant pairs (plus system).
- Errors: invalid values; clamp to safe bounds.

## Phases

- [ ] Phase 1 — Settings UI
  - [ ] Add a control in User Settings → Session to set `max_history`.
  - [ ] Persist via existing `/api/user/data` update path.
  - [ ] User verification: preference persists and reloads.
- [ ] Phase 2 — Enforcement in chat
  - [ ] Apply truncation policy in chat request builder prior to token estimation.
  - [ ] Respect per-model context length.
  - [ ] User verification: logs reflect truncated count; token estimate drops.
- [ ] Phase 3 — Sensible defaults & tiers
  - [ ] Set tier-based default (e.g., free: 4, pro: 16, enterprise: 32) unless overridden.
  - [ ] User verification: default appears correctly by tier.
- [ ] Phase 4 — Docs
  - [ ] Add `/docs/user-settings/session-history.md`.

## Clarifying questions

1. Desired default per tier? Any global hard max?
2. Count policy: count pairs or all messages? Include system in count?
3. Should pinned system prompts be exempt from truncation?
4. Do we need per-session overrides beyond global preference?

## Risks

- Over-truncation can remove necessary tool calls or metadata.
- Interaction with context toggle needs clear precedence.

## Success criteria

- Users can set and observe history caps; API requests reflect the cap without errors.
