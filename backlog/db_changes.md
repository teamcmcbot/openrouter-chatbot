## Backlog: Database Changes

- [ ] Implement a trigger on INSERT to chat_sessions to increment `sessions_created` in the corresponding user's `profiles.usage_stats` JSONB field. This will allow accurate tracking of the number of chat sessions created by each user. (Currently, this field is always 0.)

- [ ] Implement a scheduled trigger or function to reset the `last_reset` field in `profiles.usage_stats` to the current timestamp at the start of each month (or billing period). This will allow accurate tracking of usage stats per period.
