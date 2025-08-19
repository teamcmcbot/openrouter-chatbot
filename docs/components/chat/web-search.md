# Web Search (OpenRouter plugin)

Last Updated: 2025-08-20
Status: Implemented (v1)

## UX

- Per-message toggle in `MessageInput` (tier-gated). When ON, requests include the `web` plugin with `max_results=3`.
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

## Edge cases

- Plugin enabled but 0 citations returned: still mark `has_websearch` true; `websearch_result_count` = 0; cost = $0.
- Streaming: citations only finalize at end of message; UI tolerates delayed Sources.

## Testing hooks

- Unit tests should assert that when toggle is ON, the request carries `plugins: [{ id: 'web', max_results: 3 }]` and that returned citations render as title-only links.
