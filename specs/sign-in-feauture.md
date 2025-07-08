# Sign-In Feature Specification (Draft)

## Overview

The sign-in feature enables users to authenticate, personalize their experience, and persist their chat history and preferences. Supabase will be used for authentication and as the primary database for user profiles and settings.

---

## Goals

- Secure user authentication (email/password, OAuth providers)
- Persistent user profiles and preferences
- Access to chat history across devices
- Customizable model selection and chat settings
- Seamless integration with existing chat UI

---

## Architecture

- **Auth Provider**: Supabase Auth (supports email/password, Google, GitHub, etc.)
- **Database**: Supabase Postgres (user profiles, preferences, chat logs)
- **Frontend**: Next.js (App Router), React Context or hooks for auth state
- **API**: Next.js API routes for secure data access

---

## User Stories

1. **Sign Up / Sign In**

   - As a user, I can sign up or sign in using email/password or OAuth.
   - My session is persisted securely (JWT/cookies).

2. **Profile & Preferences**

   - As a signed-in user, I have a profile (name, email, avatar).
   - I can update my profile and set preferences (e.g., default model, temperature, system prompt).

3. **Chat History**

   - My previous chat sessions are saved and accessible after sign-in.
   - I can view, search, and delete past conversations.

4. **Model Configuration**

   - I can customize which AI models appear in the model dropdown.
   - My model preferences are saved per user.

5. **Settings**

   - I can set default values for temperature, system prompt, etc.
   - These settings are applied to new chat sessions.

6. **Sign Out**
   - I can securely sign out, clearing my session.

---

## Database Schema (Supabase)

### users

- id (uuid, PK)
- email (string, unique)
- name (string)
- avatar_url (string)
- created_at (timestamp)

### profiles

- user_id (uuid, PK, FK to users)
- default_model (string)
- model_list (string[])
- temperature (float)
- system_prompt (string)
- other_preferences (jsonb)

### chat_sessions

- id (uuid, PK)
- user_id (uuid, FK to users)
- created_at (timestamp)
- last_activity (timestamp)
- total_tokens (int)

### chat_messages

- id (uuid, PK)
- session_id (uuid, FK to chat_sessions)
- role (user/assistant)
- content (text)
- timestamp (timestamp)
- model (string)
- tokens (int)

---

## UI/UX Considerations

- Sign-in/sign-up modal or page
- Profile/settings page for managing preferences
- Chat history page or sidebar
- Model dropdown reflects user preferences
- Loading and error states for auth actions

---

## Security & Privacy

- Secure session management (JWT/cookies)
- Passwords never stored in plaintext
- User data access restricted to authenticated user
- Option to delete account and all data

---

## Implementation Steps (MVP)

1. Integrate Supabase Auth (email/password, OAuth)
2. Create user profile and preferences tables
3. Update chat logic to associate sessions/messages with user
4. Build profile/settings UI
5. Enable chat history retrieval and management
6. Allow model list and chat settings customization
7. Add sign-out and account deletion

---

## Future Enhancements

- Multi-device session sync
- Two-factor authentication
- Email verification and password reset
- Analytics dashboard for users
- Notification preferences

---

This draft outlines the core requirements and architecture for the sign-in feature using Supabase. It will evolve as implementation progresses and feedback is gathered.
