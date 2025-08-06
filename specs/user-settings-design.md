# User Settings and Analytics Design

## Overview

This document explores the database structures related to user details, preferences, and analytics. It outlines what data can surface in a settings experience, highlights configurable options, and proposes a user interface design that respects subscription tiers.

## Relevant Database Entities

### `public.profiles`
Holds core user information, preferences, and usage counters:
- Basic info: `email`, `full_name`, `avatar_url`
- Model defaults: `default_model`, `temperature`, `system_prompt`
- Subscription and credits: `subscription_tier`, `credits`
- Usage counters: `usage_stats`
- Preferences: `ui_preferences`, `session_preferences`

### `public.user_activity_log`
Audit trail of user actions with `action`, `resource_type`, `details`, `timestamp`, and client metadata (`ip_address`, `user_agent`).

### `public.user_usage_daily`
Per‑day usage metrics (`messages_sent`, `input_tokens`, `models_used`, `sessions_created`, `active_minutes`, `estimated_cost`).

### `public.chat_sessions` and `public.chat_messages`
Conversation metadata (`message_count`, `total_tokens`, `last_model`) and per‑message stats (`role`, `model`, `input_tokens`, `output_tokens`, `error_message`, `metadata`).

### `public.model_access`
Catalog of available models with tier flags (`is_free`, `is_pro`, `is_enterprise`) and rate limits (`daily_limit`, `monthly_limit`).

### `public.system_stats`
Aggregated platform statistics for admins (`total_users`, `total_conversations`, `total_tokens`, performance and storage metrics).

## Functions of Interest
- `log_user_activity(p_user_id, p_action, …)` – records events in the activity log.
- `track_user_usage(p_user_id, p_messages_sent, …)` – updates daily usage and profile counters.
- `update_user_tier(user_uuid, new_tier)` – changes subscription tier.
- `get_user_allowed_models(user_uuid)` / `can_user_use_model(user_uuid, model_to_check)` – resolve model access by tier.
- `export_user_data(user_uuid)` – bundles profile, conversations, activity, and usage for download.

## What to Display or Configure

### Profile Section
Display `email`, `full_name`, `avatar_url`, `subscription_tier`, and `credits`. Allow editing of `full_name` and `avatar_url`. Include upgrade link if tier < desired feature.

### Model Preferences
Expose `default_model`, `temperature`, and `system_prompt`. Limit `default_model` choices to results from `get_user_allowed_models`. For lower tiers, disable advanced models and show an upgrade prompt.

### UI Preferences
Toggle fields from `ui_preferences` such as theme, sidebar width, token count display, code highlighting, and compact mode.

### Session Preferences
Options from `session_preferences` (max history, auto title, auto‑save interval, timestamp display, export format). Some power features—e.g., higher history limits or advanced export formats—can be gated to Pro/Enterprise.

### Usage & Analytics
Provide totals from `usage_stats` and recent daily metrics (`messages_sent`, `tokens`, `active_minutes`). Offer charts or tables summarizing `user_usage_daily` records. Admins may view system‑wide `system_stats`.

### Activity Log
Show recent `user_activity_log` entries. For personal accounts this can be a collapsible list; admins may filter or search.

## UI Presentation

- **Access Point**: The current settings icon in `ChatSidebar`’s footer can open a slide‑up panel anchored to the bottom to keep context, or trigger a centered modal for a focused experience.
- **Layout**: Organize settings into tabs or accordion sections: Profile, Preferences, Analytics, Subscription.
- **Tier Awareness**: Grey out or badge features that require higher tiers and provide inline upgrade CTAs. When an action is attempted on a restricted feature, show an upgrade modal.
- **Responsiveness**: On mobile, use a full‑screen drawer. On desktop, a right‑side slide‑over could preserve chat visibility while adjusting settings.

## Subscription‑Tier Considerations

- **Model Access**: Only list models flagged for the user’s tier; indicate locked models with an upgrade hint.
- **Limits**: Display remaining credits and daily/monthly limits where applicable.
- **Advanced Features**: Options such as increased `max_history`, detailed usage analytics, or activity log export could be enabled only for Pro/Enterprise tiers.

## Summary
The schema supports a rich settings experience centered on the `profiles` table and augmented by activity, usage, and model‑access data. A tier‑aware, modular UI can surface these capabilities while incentivizing upgrades.

