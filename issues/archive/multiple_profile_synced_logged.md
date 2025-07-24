# Multiple Profile Synced Logged

## Description

When user (existing or new) sign in to the app, it's google account details is being synced to supabase tables. There is a `log_user_activity` function that is called to log the user activity. This function is responsible for checking if the user already exists in the `profiles` table and updating or inserting the user details accordingly.

I noticed on NEW user sign up, there are multiple entries in `user_activity_log` table:

- 1 `profile_created` entry (expected)
- 7 `profile_synced` entry (unexpected)

On EXISTING user sign in, there are multiple entries in `user_activity_log` table:

- 3 `profile_synced` entries (unexpected)

Please carefully investigate the tables/functions and triggers involved in this process to identify the cause of the multiple entries. I want to know exactly what are 7 or 3 entries and why they are being created. Then suggest a fix to ensure that only one entry of `profile_synced` is created for each user sign in or sign up.

## Supabase Schema

- refer to /database/01-complete-user-management.sql
