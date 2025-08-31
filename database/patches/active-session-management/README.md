# Active Session Management (Archived)

This folder previously contained a function `public.set_active_session(UUID, TEXT)` to toggle a single `chat_sessions.is_active` row per user.

As of the is_active deprecation (Phase A), the application no longer stores an active session flag in the database. The active conversation is tracked client‑side in the state store and persisted to localStorage. Multi‑device concerns and correctness were the motivation for this change.

What changed:

- Column `chat_sessions.is_active` was dropped via patches in `../remove-is-active/`.
- Any server/API handling of `is_active` was removed. Legacy payloads are ignored with a deprecation warning.
- `get_user_recent_sessions` was recreated without the `is_active` field.

If you still need an “active” concept on the server in the future, prefer a per-device token or session-scoped flag rather than a global column on `chat_sessions`.
