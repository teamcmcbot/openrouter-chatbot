# DB Dump Analysis – Functions

## Summary

- Total function declarations under `database/schema`: **110** across seven module files plus the `000_baseline.sql` snapshot.
- Application-owned modules (`01-` through `07-`) contribute **42** concrete functions, all of which are represented in `supabase/migrations/`.
- Exactly **20** helper functions are missing from the migrations snapshot; every one of them lives in `000_baseline.sql` and belongs to Supabase-managed domains (auth JWT helper and storage RPC utilities) that Supabase CLI omits when dumping.

### Missing function coverage

| Function                                        | Declared in        |
| ----------------------------------------------- | ------------------ |
| `auth.jwt`                                      | `000_baseline.sql` |
| `storage.add_prefixes`                          | `000_baseline.sql` |
| `storage.can_insert_object`                     | `000_baseline.sql` |
| `storage.delete_prefix`                         | `000_baseline.sql` |
| `storage.delete_prefix_hierarchy_trigger`       | `000_baseline.sql` |
| `storage.enforce_bucket_name_length`            | `000_baseline.sql` |
| `storage.filename`                              | `000_baseline.sql` |
| `storage.foldername`                            | `000_baseline.sql` |
| `storage.get_level`                             | `000_baseline.sql` |
| `storage.get_prefix`                            | `000_baseline.sql` |
| `storage.get_prefixes`                          | `000_baseline.sql` |
| `storage.get_size_by_bucket`                    | `000_baseline.sql` |
| `storage.list_multipart_uploads_with_delimiter` | `000_baseline.sql` |
| `storage.list_objects_with_delimiter`           | `000_baseline.sql` |
| `storage.objects_insert_prefix_trigger`         | `000_baseline.sql` |
| `storage.objects_update_prefix_trigger`         | `000_baseline.sql` |
| `storage.prefixes_insert_trigger`               | `000_baseline.sql` |
| `storage.search_legacy_v1`                      | `000_baseline.sql` |
| `storage.search_v1_optimised`                   | `000_baseline.sql` |
| `storage.search_v2`                             | `000_baseline.sql` |

> All missing functions are Supabase-managed helpers (auth JWT + storage RPCs). They are not exportable through `supabase db dump` and must be recreated manually if needed.

## Coverage by schema file

### `000_baseline.sql`

| Function                                        | In migrations? |
| ----------------------------------------------- | -------------- |
| `auth.email`                                    | ✅             |
| `auth.jwt`                                      | ❌             |
| `auth.role`                                     | ✅             |
| `auth.uid`                                      | ✅             |
| `public._set_updated_at`                        | ✅             |
| `public.analyze_database_health`                | ✅             |
| `public.ban_user`                               | ✅             |
| `public.calculate_and_record_message_cost`      | ✅             |
| `public.can_user_use_model`                     | ✅             |
| `public.cleanup_anonymous_errors`               | ✅             |
| `public.cleanup_anonymous_usage`                | ✅             |
| `public.cleanup_cta_events`                     | ✅             |
| `public.cleanup_old_data`                       | ✅             |
| `public.get_admin_user_model_costs_daily`       | ✅             |
| `public.get_anonymous_errors`                   | ✅             |
| `public.get_anonymous_model_costs`              | ✅             |
| `public.get_error_count`                        | ✅             |
| `public.get_global_model_costs`                 | ✅             |
| `public.get_model_sync_activity_daily`          | ✅             |
| `public.get_recent_errors`                      | ✅             |
| `public.get_sync_stats`                         | ✅             |
| `public.get_user_allowed_models`                | ✅             |
| `public.get_user_complete_profile`              | ✅             |
| `public.get_user_model_costs_daily`             | ✅             |
| `public.get_user_recent_sessions`               | ✅             |
| `public.handle_user_profile_sync`               | ✅             |
| `public.ingest_anonymous_error`                 | ✅             |
| `public.ingest_anonymous_usage`                 | ✅             |
| `public.ingest_cta_event`                       | ✅             |
| `public.is_admin`                               | ✅             |
| `public.is_banned`                              | ✅             |
| `public.log_user_activity`                      | ✅             |
| `public.on_chat_attachment_link_recompute`      | ✅             |
| `public.protect_ban_columns`                    | ✅             |
| `public.recompute_image_cost_for_user_message`  | ✅             |
| `public.sync_openrouter_models`                 | ✅             |
| `public.track_session_creation`                 | ✅             |
| `public.track_user_usage`                       | ✅             |
| `public.unban_user`                             | ✅             |
| `public.update_model_tier_access`               | ✅             |
| `public.update_session_stats`                   | ✅             |
| `public.update_session_timestamp`               | ✅             |
| `public.update_updated_at_column`               | ✅             |
| `public.update_user_tier`                       | ✅             |
| `public.write_admin_audit`                      | ✅             |
| `storage.add_prefixes`                          | ❌             |
| `storage.can_insert_object`                     | ❌             |
| `storage.delete_prefix`                         | ❌             |
| `storage.delete_prefix_hierarchy_trigger`       | ❌             |
| `storage.enforce_bucket_name_length`            | ❌             |
| `storage.extension`                             | ✅             |
| `storage.filename`                              | ❌             |
| `storage.foldername`                            | ❌             |
| `storage.get_level`                             | ❌             |
| `storage.get_prefix`                            | ❌             |
| `storage.get_prefixes`                          | ❌             |
| `storage.get_size_by_bucket`                    | ❌             |
| `storage.list_multipart_uploads_with_delimiter` | ❌             |
| `storage.list_objects_with_delimiter`           | ❌             |
| `storage.objects_insert_prefix_trigger`         | ❌             |
| `storage.objects_update_prefix_trigger`         | ❌             |
| `storage.operation`                             | ✅             |
| `storage.prefixes_insert_trigger`               | ❌             |
| `storage.search`                                | ✅             |
| `storage.search_legacy_v1`                      | ❌             |
| `storage.search_v1_optimised`                   | ❌             |
| `storage.search_v2`                             | ❌             |
| `storage.update_updated_at_column`              | ✅             |

### `01-users.sql`

| Function                           | In migrations? |
| ---------------------------------- | -------------- |
| `public.ban_user`                  | ✅             |
| `public.get_user_complete_profile` | ✅             |
| `public.handle_user_profile_sync`  | ✅             |
| `public.is_admin`                  | ✅             |
| `public.is_banned`                 | ✅             |
| `public.log_user_activity`         | ✅             |
| `public.protect_ban_columns`       | ✅             |
| `public.track_user_usage`          | ✅             |
| `public.unban_user`                | ✅             |
| `public.update_updated_at_column`  | ✅             |
| `public.update_user_tier`          | ✅             |

### `02-chat.sql`

| Function                                       | In migrations? |
| ---------------------------------------------- | -------------- |
| `public.calculate_and_record_message_cost`     | ✅             |
| `public.get_admin_user_model_costs_daily`      | ✅             |
| `public.get_error_count`                       | ✅             |
| `public.get_global_model_costs`                | ✅             |
| `public.get_recent_errors`                     | ✅             |
| `public.get_user_model_costs_daily`            | ✅             |
| `public.get_user_recent_sessions`              | ✅             |
| `public.on_chat_attachment_link_recompute`     | ✅             |
| `public.recompute_image_cost_for_user_message` | ✅             |
| `public.track_session_creation`                | ✅             |
| `public.update_session_stats`                  | ✅             |
| `public.update_session_timestamp`              | ✅             |

### `03-models.sql`

| Function                          | In migrations? |
| --------------------------------- | -------------- |
| `public.can_user_use_model`       | ✅             |
| `public.get_sync_stats`           | ✅             |
| `public.get_user_allowed_models`  | ✅             |
| `public.sync_openrouter_models`   | ✅             |
| `public.update_model_tier_access` | ✅             |

### `04-system.sql`

| Function                               | In migrations? |
| -------------------------------------- | -------------- |
| `public.analyze_database_health`       | ✅             |
| `public.cleanup_cta_events`            | ✅             |
| `public.cleanup_old_data`              | ✅             |
| `public.get_model_sync_activity_daily` | ✅             |
| `public.ingest_cta_event`              | ✅             |
| `public.write_admin_audit`             | ✅             |

### `06-anonymous.sql`

| Function                           | In migrations? |
| ---------------------------------- | -------------- |
| `public._set_updated_at`           | ✅             |
| `public.cleanup_anonymous_errors`  | ✅             |
| `public.cleanup_anonymous_usage`   | ✅             |
| `public.get_anonymous_errors`      | ✅             |
| `public.get_anonymous_model_costs` | ✅             |
| `public.ingest_anonymous_error`    | ✅             |
| `public.ingest_anonymous_usage`    | ✅             |

### `07-stripe-payments.sql`

| Function                | In migrations? |
| ----------------------- | -------------- |
| `public.set_updated_at` | ✅             |
