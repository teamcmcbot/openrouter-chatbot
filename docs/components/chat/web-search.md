# Web Search (OpenRouter plugin)

Last Updated: 2025-08-29
Status: Implemented (v1)

## UX

- Per-message toggle in `MessageInput` (tier-gated). When ON:
  - Enterprise: settings modal includes a "Max results" slider (1–5). Server clamps to 1–10.
  - Pro: settings modal shows the slider disabled with an info tooltip; backend forces `max_results=3`.
- Assistant messages that used Web Search show a small "Web" chip.
- When citations are present, a compact "Sources" list renders under the message.
  - Links are title-only, keyboard-focusable, and wrap on mobile (no horizontal scroll).

## Data returned to UI

- `has_websearch: boolean`
- `websearch_result_count: number`
- `citations: Array<{ url: string; title?: string; content?: string; start_index?: number; end_index?: number }>`
- `completion_id: string` (propagated for analytics)

## Privacy & Cost Notes

- Enabling Web Search may share parts of your query with third-party search providers through OpenRouter’s plugin.
- Cost: $4 per 1000 results (0.004/result). With `max_results=3`, max ~$0.012 per request. We cap billable results at 50.
  - Enterprise changing max results increases/decreases cost linearly per result (still capped at 50 billable results).

## Edge cases

- Plugin enabled but 0 citations returned: still mark `has_websearch` true; `websearch_result_count` = 0; cost = $0.
- Streaming: citations only finalize at end of message; UI tolerates delayed Sources.

## Testing hooks

- Unit tests should assert:
  - Pro: when toggle is ON, server uses `max_results=3` regardless of client-provided `webMaxResults`.
  - Enterprise: when toggle is ON and `webMaxResults=N` (1–5 UI), server forwards that value (clamped to ≤10) and citations render as title-only links.
