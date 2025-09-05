# Account Banning – Completion Summary

Last updated: 2025-09-05

## What shipped

- Chat-only ban policy
  - Banned users cannot execute Tier A chat endpoints: POST /api/chat and /api/chat/stream (403 account_banned)
  - Banned users can still: sign in, read chat history (GET /api/chat/messages), and manage conversations (sessions CRUD, clear-all)
- Centralized enforcement
  - Standardized middleware: withAuth / withProtectedAuth / withEnhancedAuth
  - Per-route override of enforceBan with defaults: enforceBan=true for protected, explicitly false on read/management endpoints
- Redis auth snapshot cache
  - Key: auth:snapshot:user:{userId}; fields: isBanned, bannedUntil, tier, accountType, updatedAt, v
  - TTL: AUTH_SNAPSHOT_CACHE_TTL_SECONDS (default 900s); DB fallback if cache is down
  - Invalidation on ban/unban or tier/account changes
- Admin endpoints
  - POST /api/admin/users/{id}/ban and /api/admin/users/{id}/unban
  - Validates input, prevents self-ban, logs actions, invalidates snapshot
- Database
  - profiles: is_banned, banned_at, banned_until, ban_reason, violation_strikes
  - moderation_actions table with RLS for admins
  - Functions: is_banned(uuid), ban_user(uuid, timestamptz, text), unban_user(uuid, text)
  - get_user_complete_profile upgraded to include ban/account fields
- Client UX
  - 401/403 are terminal in chat loop (no refetch loop)
  - Send button wiring uses isSending while disabled
- Logging
  - Structured, minimal logs via shared logger; no PII; error codes standardized (ACCOUNT_BANNED)

## Key files

- lib/middleware/auth.ts – enforcement and overrides
- lib/utils/authSnapshot.ts – snapshot get/set/delete, TTL logic
- src/app/api/chat/\* – route-level enforceBan wiring
- src/app/api/admin/users/[id]/ban|unban/route.ts – admin actions + cache invalidation
- database/schema/01-users.sql – ban columns, moderation_actions, RPCs
- database/patches/account-banning/\* – incremental patches including get_user_complete_profile update
- docs/api/auth-middleware.md, docs/architecture/auth-snapshot-caching.md – reference docs

## Environment

- AUTH_SNAPSHOT_CACHE_TTL_SECONDS=900 (default 15m); tune or disable per env

## Tests

- Admin ban/unban endpoints
- Chat-only ban enforcement (403 account_banned on chat/stream)
- Conversation management allowed for banned users
- Snapshot TTL precedence (env > explicit > default)
- UI gating and input behavior

All tests passing: 76 suites, 329 tests.

## Manual verification steps

- Ban a user (admin endpoint) and confirm cache invalidation + immediate enforcement
- Confirm banned user can sign in, read messages, manage sessions, but cannot chat or stream
- Confirm TTL behavior: first request after expiry reseeds cache; subsequent requests hit cache

## Follow-ups

- Phase 2 (monitoring/detection) and Phase 4 (content moderation) remain open
- After final approval, merge patches into canonical schema and update docs index links
