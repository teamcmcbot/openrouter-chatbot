# DB Dump Analysis – Policies
## Summary

- Unique policy declarations under `database/schema`: **104** across seven module files plus the `000_baseline.sql` snapshot.
- Every policy definition is present in `supabase/migrations/`.
- Supabase-managed policies (profiles, storage, auth) appear both in the baseline dump and in their module-specific files; duplication is expected.

> No gaps detected: migrations recreate all row level security policies from the schema dump.

### `000_baseline.sql`
| Policy | Table | In migrations? |
| --- | --- | --- |
| `Admin can read CTA events` | `"public"."cta_events"` | ✅ |
| `Admins can insert moderation actions` | `"public"."moderation_actions"` | ✅ |
| `Admins can insert sync logs` | `"public"."model_sync_log"` | ✅ |
| `Admins can read anonymous errors` | `"public"."anonymous_error_events"` | ✅ |
| `Admins can read anonymous model usage` | `"public"."anonymous_model_usage_daily"` | ✅ |
| `Admins can read anonymous usage` | `"public"."anonymous_usage_daily"` | ✅ |
| `Admins can update moderation actions` | `"public"."moderation_actions"` | ✅ |
| `Admins can update sync logs` | `"public"."model_sync_log"` | ✅ |
| `Admins can view moderation actions` | `"public"."moderation_actions"` | ✅ |
| `All users can view model access` | `"public"."model_access"` | ✅ |
| `Allow inserts from server roles` | `"public"."cta_events"` | ✅ |
| `Deny direct deletes` | `"public"."anonymous_model_usage_daily"` | ✅ |
| `Deny direct deletes` | `"public"."anonymous_usage_daily"` | ✅ |
| `Deny direct updates` | `"public"."anonymous_model_usage_daily"` | ✅ |
| `Deny direct updates` | `"public"."anonymous_usage_daily"` | ✅ |
| `Deny direct writes` | `"public"."anonymous_model_usage_daily"` | ✅ |
| `Deny direct writes` | `"public"."anonymous_usage_daily"` | ✅ |
| `Deny error deletes` | `"public"."anonymous_error_events"` | ✅ |
| `Deny error updates` | `"public"."anonymous_error_events"` | ✅ |
| `Deny error writes` | `"public"."anonymous_error_events"` | ✅ |
| `Insert message costs` | `"public"."message_token_costs"` | ✅ |
| `Insert via definer only` | `"public"."admin_audit_log"` | ✅ |
| `Only admins can read audit logs` | `"public"."admin_audit_log"` | ✅ |
| `Only admins can view sync logs` | `"public"."model_sync_log"` | ✅ |
| `Update profiles` | `"public"."profiles"` | ✅ |
| `Users can create messages in their sessions` | `"public"."chat_messages"` | ✅ |
| `Users can create their own chat sessions` | `"public"."chat_sessions"` | ✅ |
| `Users can delete messages in their sessions` | `"public"."chat_messages"` | ✅ |
| `Users can delete their own attachments` | `"public"."chat_attachments"` | ✅ |
| `Users can delete their own chat sessions` | `"public"."chat_sessions"` | ✅ |
| `Users can delete their own message annotations` | `"public"."chat_message_annotations"` | ✅ |
| `Users can insert their own attachments` | `"public"."chat_attachments"` | ✅ |
| `Users can insert their own message annotations` | `"public"."chat_message_annotations"` | ✅ |
| `Users can insert their own profile` | `"public"."profiles"` | ✅ |
| `Users can insert their own usage` | `"public"."user_usage_daily"` | ✅ |
| `Users can update messages in their sessions` | `"public"."chat_messages"` | ✅ |
| `Users can update their own attachments` | `"public"."chat_attachments"` | ✅ |
| `Users can update their own chat sessions` | `"public"."chat_sessions"` | ✅ |
| `Users can update their own usage` | `"public"."user_usage_daily"` | ✅ |
| `Users can view messages from their sessions` | `"public"."chat_messages"` | ✅ |
| `Users can view their own activity` | `"public"."user_activity_log"` | ✅ |
| `Users can view their own attachments` | `"public"."chat_attachments"` | ✅ |
| `Users can view their own chat sessions` | `"public"."chat_sessions"` | ✅ |
| `Users can view their own message annotations` | `"public"."chat_message_annotations"` | ✅ |
| `Users can view their own usage` | `"public"."user_usage_daily"` | ✅ |
| `View message costs` | `"public"."message_token_costs"` | ✅ |
| `View profiles` | `"public"."profiles"` | ✅ |
| `attachments-images: delete own` | `"storage"."objects"` | ✅ |
| `attachments-images: insert own` | `"storage"."objects"` | ✅ |
| `attachments-images: read own` | `"storage"."objects"` | ✅ |
| `attachments-images: update own` | `"storage"."objects"` | ✅ |

### `01-users.sql`
| Policy | Table | In migrations? |
| --- | --- | --- |
| `View profiles` | `public.profiles` | ✅ |
| `Update profiles` | `public.profiles` | ✅ |
| `Users can insert their own profile` | `public.profiles` | ✅ |
| `Users can view their own activity` | `public.user_activity_log` | ✅ |
| `Users can view their own usage` | `public.user_usage_daily` | ✅ |
| `Users can insert their own usage` | `public.user_usage_daily` | ✅ |
| `Users can update their own usage` | `public.user_usage_daily` | ✅ |
| `Admins can view moderation actions` | `public.moderation_actions` | ✅ |
| `Admins can insert moderation actions` | `public.moderation_actions` | ✅ |
| `Admins can update moderation actions` | `public.moderation_actions` | ✅ |

### `02-chat.sql`
| Policy | Table | In migrations? |
| --- | --- | --- |
| `Users can view their own chat sessions` | `public.chat_sessions` | ✅ |
| `Users can create their own chat sessions` | `public.chat_sessions` | ✅ |
| `Users can update their own chat sessions` | `public.chat_sessions` | ✅ |
| `Users can delete their own chat sessions` | `public.chat_sessions` | ✅ |
| `Users can view messages from their sessions` | `public.chat_messages` | ✅ |
| `Users can create messages in their sessions` | `public.chat_messages` | ✅ |
| `Users can update messages in their sessions` | `public.chat_messages` | ✅ |
| `Users can delete messages in their sessions` | `public.chat_messages` | ✅ |
| `Users can view their own attachments` | `public.chat_attachments` | ✅ |
| `Users can insert their own attachments` | `public.chat_attachments` | ✅ |
| `Users can update their own attachments` | `public.chat_attachments` | ✅ |
| `Users can delete their own attachments` | `public.chat_attachments` | ✅ |
| `Users can view their own message annotations` | `public.chat_message_annotations` | ✅ |
| `Users can insert their own message annotations` | `public.chat_message_annotations` | ✅ |
| `Users can delete their own message annotations` | `public.chat_message_annotations` | ✅ |
| `View message costs` | `public.message_token_costs` | ✅ |
| `Insert message costs` | `public.message_token_costs` | ✅ |

### `03-models.sql`
| Policy | Table | In migrations? |
| --- | --- | --- |
| `All users can view model access` | `public.model_access` | ✅ |
| `Only admins can view sync logs` | `public.model_sync_log` | ✅ |
| `Admins can insert sync logs` | `public.model_sync_log` | ✅ |
| `Admins can update sync logs` | `public.model_sync_log` | ✅ |

### `04-system.sql`
| Policy | Table | In migrations? |
| --- | --- | --- |
| `Only admins can read audit logs` | `public.admin_audit_log` | ✅ |
| `Insert via definer only` | `public.admin_audit_log` | ✅ |
| `Admin can read CTA events` | `public.cta_events` | ✅ |
| `Allow inserts from server roles` | `public.cta_events` | ✅ |

### `05-storage.sql`
| Policy | Table | In migrations? |
| --- | --- | --- |
| `attachments-images: read own` | `storage.objects` | ✅ |
| `attachments-images: insert own` | `storage.objects` | ✅ |
| `attachments-images: delete own` | `storage.objects` | ✅ |
| `attachments-images: update own` | `storage.objects` | ✅ |

### `06-anonymous.sql`
| Policy | Table | In migrations? |
| --- | --- | --- |
| `Admins can read anonymous usage` | `public.anonymous_usage_daily` | ✅ |
| `Deny direct writes` | `public.anonymous_usage_daily` | ✅ |
| `Deny direct updates` | `public.anonymous_usage_daily` | ✅ |
| `Deny direct deletes` | `public.anonymous_usage_daily` | ✅ |
| `Admins can read anonymous model usage` | `public.anonymous_model_usage_daily` | ✅ |
| `Deny direct writes` | `public.anonymous_model_usage_daily` | ✅ |
| `Deny direct updates` | `public.anonymous_model_usage_daily` | ✅ |
| `Deny direct deletes` | `public.anonymous_model_usage_daily` | ✅ |
| `Admins can read anonymous errors` | `public.anonymous_error_events` | ✅ |
| `Deny error writes` | `public.anonymous_error_events` | ✅ |
| `Deny error updates` | `public.anonymous_error_events` | ✅ |
| `Deny error deletes` | `public.anonymous_error_events` | ✅ |

### `07-stripe-payments.sql`
| Policy | Table | In migrations? |
| --- | --- | --- |
| `Users select own subscriptions` | `public.subscriptions` | ✅ |
| `Users select own payments` | `public.payment_history` | ✅ |

