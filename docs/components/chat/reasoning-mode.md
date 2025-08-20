# Reasoning Mode (Enterprise)

## What it is

Optional model “thinking” that can improve complex responses. Enabled per-message and billed as output tokens.

## Enablement & gating

- Availability: Enterprise only (tier-gated via AuthContext.features).
- Models: Toggle appears only if the selected model’s `supported_parameters` includes `reasoning` or `include_reasoning`.
- Default when enabled: `reasoning: { effort: "low" }` to minimize cost/latency.

## UI behavior

- Message input toolbar adds a Reasoning button with a popover.
- Enterprise users can enable/disable; others see an upgrade prompt.
- Assistant messages with reasoning show a collapsed "Reasoning" panel. Click to expand and view:
  - `reasoning` (text)
  - `reasoning_details` (JSON blocks), when provided by the model

## API contract

- Outbound request (client → `/api/chat` and `/api/chat/messages`):
  - Optional `reasoning` object: `{ effort?: 'low'|'medium'|'high'; max_tokens?: number; exclude?: boolean; enabled?: boolean }`
- Backend forwards unified `reasoning` to OpenRouter if tier/model allow.
- Response mapping (and persistence):
  - `message.reasoning` → `chat_messages.reasoning` (TEXT, nullable)
  - `message.reasoning_details` → `chat_messages.reasoning_details` (JSONB, nullable)
- History sync (`/api/chat/sync`): returns `reasoning` and `reasoning_details` for assistant messages.

## Database fields

- `public.chat_messages.reasoning TEXT NULL`
- `public.chat_messages.reasoning_details JSONB NULL`

## Cost & usage

- Reasoning tokens count as output tokens; expect higher token usage and latency.
- Some providers may expose additional pricing fields; these are not required for normal accounting.

## Notes & limitations

- Not all models return visible reasoning text; some only use internal reasoning.
- Streaming of reasoning deltas may be provider-dependent; UI collapses reasoning by default.
- Tool-calling continuity: future enhancement to pass prior `reasoning_details` on follow-ups.

## Manual test

1. Pick a reasoning-capable model; enable Reasoning (low).
2. Send a message; observe collapsed Reasoning panel on the reply.
3. Refresh the page; confirm panel still appears for the saved message.
4. Expand to view text and JSON details (if present).
