# Patch 004 — Usage analytics and cost update fixes

This document explains the current behavior, the root cause of the analytics anomaly (messages with image attachments incorrectly adding to `messages_sent` more than once), and the proposed fix in `004_usage_and_cost_fixes.sql`. It also maps all relevant triggers, functions, and tables, with before/after flows.

## Scope

- Prevent double-counting `messages_sent` when a user message later gets images linked to it (UPDATEs to the message row).
- Ensure `estimated_cost` is only updated via the centralized recompute path that already handles per-token costs and image-unit deltas safely under RLS.

## Key database objects

- Tables

  - `public.chat_messages` — user/assistant messages (text IDs)
  - `public.chat_sessions` — conversation container
  - `public.chat_attachments` — image metadata, links to `message_id` when attached
  - `public.user_usage_daily` — per-user daily analytics (messages, tokens, generation_ms, estimated_cost)
  - `public.message_token_costs` — per assistant message cost snapshot (tokens + images)

- Triggers and functions (baseline)
  - `public.update_session_stats()` — AFTER INSERT/UPDATE/DELETE on `chat_messages`
    - Maintains `chat_sessions.message_count`, `total_tokens`, previews, etc.
    - Also calls `public.track_user_usage(...)` to increment daily usage.
  - `public.track_user_usage(...)` — Upserts `user_usage_daily` and updates `profiles.usage_stats`.
  - `public.calculate_and_record_message_cost()` — AFTER INSERT on `chat_messages`
    - Inserts base per-token costs into `message_token_costs`
    - Updates `user_usage_daily.estimated_cost`
  - `public.recompute_image_cost_for_user_message(p_user_message_id)` — recomputes cost when images get linked; SECURITY DEFINER; applies delta to `user_usage_daily.estimated_cost`.
  - `public.on_chat_attachment_link_recompute()` + trigger `after_attachment_link_recompute_cost` (AFTER UPDATE OF message_id ON chat_attachments)
    - Calls the recompute function when an attachment becomes linked to a message.

## Current flow (before Patch 004)

1. User sends a message (INSERT into `chat_messages` with role='user')

- Trigger: `on_message_change` → `update_session_stats()` runs
  - Updates the owning `chat_sessions` row
  - Calls `track_user_usage(user_id, messages_sent=1, ...)` for INSERT, which increments `user_usage_daily.messages_sent`.

2. Assistant responds (INSERT into `chat_messages` with role='assistant')

- Trigger: `on_message_change` → `update_session_stats()` runs (updates session, usage received count/tokens)
- Trigger: `after_assistant_message_cost` → `calculate_and_record_message_cost()` runs
  - Inserts into `message_token_costs` with prompt/completion costs
  - Updates `user_usage_daily.estimated_cost` (per-token portion)

3. User links images to the same user message

- API updates `public.chat_attachments.message_id` to reference the user message
- Trigger: `after_attachment_link_recompute_cost` → `on_chat_attachment_link_recompute()` → `recompute_image_cost_for_user_message(user_msg_id)`
  - Counts image units (capped to 3), computes new `total_cost`
  - Upserts `message_token_costs` and applies only the delta to `user_usage_daily.estimated_cost`

4. Where the anomaly arises

- The user message record (or its companion rows) may be UPDATED to reflect attachment state (e.g., `has_attachments`, `attachment_count`).
- `on_message_change` runs for UPDATE too, and in pre-patch behavior it could call `track_user_usage()` on UPDATE paths, adding another `messages_sent` increment—even though the user did not send a new message.
- Net effect: each image-linked update risks inflating `user_usage_daily.messages_sent`.

## Proposed changes (Patch 004)

1. Restrict usage increments to INSERT only

- Modify `public.update_session_stats()` so `track_user_usage()` is called only when `TG_OP = 'INSERT'` and the message is successful (no error).
- KEEP session stats maintenance for INSERT/UPDATE/DELETE, but don’t increment daily counts on UPDATEs.
- Impact: Linking images (which causes UPDATE on `chat_messages`) no longer bumps `messages_sent`.

2. Centralize cost updates through recompute path

- Replace `public.calculate_and_record_message_cost()` with a thin shim that delegates to `public.recompute_image_cost_for_user_message(NEW.user_message_id)` for successful assistant messages.
- Reasoning:
  - The recompute function is SECURITY DEFINER and already safely updates `message_token_costs` and `user_usage_daily.estimated_cost` by delta.
  - Assistant insert will record per-token cost (image units = 0 if none yet), and later, linking images will adjust by delta. This prevents double-counting and keeps a single source of truth for cost updates.

## Why this fixes the issues

- `messages_sent` inflation: by moving `track_user_usage()` calls exclusively to INSERT, any later UPDATEs on the same message (for attachment flags or counts) do not change `messages_sent`.
- `estimated_cost` correctness: cost updates are consistently handled in one place (the recompute function) that knows both the prior and new totals and applies the difference. Assistant insert is covered by calling the recompute with the `user_message_id`; attachment linking is covered by the attachment trigger. No separate, divergent cost paths remain.

## Affected objects (explicit list)

- Replaced: `public.update_session_stats()`
  - Only calls `track_user_usage()` on INSERT, not on UPDATE.
- Replaced: `public.calculate_and_record_message_cost()`
  - Delegates to `public.recompute_image_cost_for_user_message(...)`.
- Unchanged but leveraged:
  - `public.recompute_image_cost_for_user_message(p_user_message_id)`
  - `public.on_chat_attachment_link_recompute()` and trigger `after_attachment_link_recompute_cost`
  - `public.track_user_usage(...)`
  - `public.message_token_costs`, `public.user_usage_daily`

## Edge cases considered

- Assistant error messages: both usage and cost updates are gated to successful messages only.
- Multiple attachments added/removed over time: recompute applies delta against the existing `message_token_costs.total_cost`, preventing cumulative drift.
- Image unit cap: recompute uses `LEAST(COUNT(*), 3)` to respect business rules.

## Acceptance criteria

- When a user sends a message (no images):
  - `user_usage_daily.messages_sent` increments by 1 once.
  - `message_token_costs` row created for the assistant reply; `user_usage_daily.estimated_cost` reflects per-token cost via recompute.
- When images are later linked to that message:
  - `messages_sent` does not change.
  - `message_token_costs.total_cost` updates to include image cost; `user_usage_daily.estimated_cost` increases only by the delta.
- Repeated attachment updates do not increment `messages_sent` and always adjust `estimated_cost` by delta.

## Manual test plan

1. Send a user message without images → verify `messages_sent` +1 once (INSERT only)
2. Get an assistant reply → verify `message_token_costs` row created and `estimated_cost` updated
3. Link 1–3 images to the user message → verify no change in `messages_sent`; `estimated_cost` increases by image-cost delta only
4. Update the same message’s attachment flags again → verify no `messages_sent` change; costs remain correct

---

Document owner: Patch 004 implementation. Last updated: current branch `feature/image-attachment`.
