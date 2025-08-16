# Streaming support feasibility

## Summary

Assess and, if feasible, implement streaming responses end-to-end (SSE/stream chunks) with markdown detection mode for rendering.

## Current implementation snapshot

- Chat API `src/app/api/chat/route.ts` does non-streaming completion via `getOpenRouterCompletion`.
- Sync endpoints reference `is_streaming: false` and tracking fields exist in `/api/chat/sync` and `/api/chat/messages` but no active streaming path.
- UI likely expects full response; no client-side stream consumption detected.

## Approach (contract)

- Inputs: a `stream=true` flag per request; target models with streaming support.
- Outputs: server streams chunks to client; UI renders progressively and determines `contentType` once enough content is available.
- Errors: client disconnects, provider timeouts; fallback to non-streaming.

## Phases

- [ ] Phase 1 — Provider capability and server plumbing
  - [ ] Add streaming option to `/api/chat` and a streamed variant endpoint (e.g., `/api/chat/stream`).
  - [ ] Use Next.js `ReadableStream` or `SSE` to forward chunks; standardize chunk schema.
  - [ ] User verification: curl/devtool can receive incrementing chunks.
- [ ] Phase 2 — Client rendering
  - [ ] Introduce a simple stream consumer hook that appends tokens to state.
  - [ ] When markdown detected in early chunk, render in markdown mode; otherwise text.
  - [ ] User verification: visible incremental rendering; mode switch stable.
- [ ] Phase 3 — Sync & persistence
  - [ ] On stream completion, persist full message and usage; ensure `is_streaming=false` when syncing.
  - [ ] User verification: message stored once, not duplicated.
- [ ] Phase 4 — Feature flags & tiers
  - [ ] Gate streaming by model support and subscription tier.
  - [ ] User verification: gating enforced by middleware features.
- [ ] Phase 5 — Docs
  - [ ] Add `/docs/components/chat/streaming.md` and API streaming docs.

## Clarifying questions

1. Must we support both SSE and fetch-stream? Which browsers are targets?
2. Any requirement to show token/speed meters during streaming?
3. Should streaming be default or opt-in per message/session?
4. Retry semantics on stream errors?

## Risks

- Next.js streaming quirks behind edge/runtime differences.
- Markdown partial rendering causing flicker; use debounced re-render.

## Success criteria

- End-to-end streaming works for supported models without breaking non-streaming path.
