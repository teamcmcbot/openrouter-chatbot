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

### conversations

- id (varchar, PK) -- Using existing format: conv*{timestamp}*{random}
- user_id (uuid, FK to users)
- title (varchar)
- created_at (timestamp)
- updated_at (timestamp)
- message_count (integer)
- total_tokens (integer)
- last_model (varchar)
- is_active (boolean)
- last_message_preview (text)
- last_message_timestamp (timestamp)

### messages

- id (varchar, PK) -- Using existing format: timestamp string
- conversation_id (varchar, FK to conversations)
- content (text)
- role (varchar) -- 'user' | 'assistant'
- timestamp (timestamp)
- elapsed_time (integer)
- total_tokens (integer)
- model (varchar)
- content_type (varchar) -- 'text' | 'markdown'
- completion_id (varchar)
- error (boolean)

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

## Chat History Database Integration Analysis

### Current LocalStorage Architecture Benefits

The current chat history implementation in `useChatHistory` is **excellently positioned** for database migration. Key architectural advantages:

#### ✅ **Database-Ready Data Models**

- `ChatConversation` and `ChatMessage` interfaces map directly to database tables
- Proper ID generation, timestamps, and metadata fields already implemented
- Date serialization/deserialization logic handles both storage formats

#### ✅ **Clean Abstraction Layers**

- Storage logic isolated in `useChatHistoryStorage` hook
- Business logic (CRUD operations) abstracted from storage mechanism
- UI components depend only on hook interface, not storage details

#### ✅ **Minimal Migration Effort Required**

The transition to Supabase will be **straightforward** due to:

1. **Zero Breaking Changes**: Existing components continue to work unchanged
2. **Progressive Enhancement**: Can add cloud sync without disrupting local experience
3. **Hybrid Storage**: Support both localStorage (anonymous) and database (authenticated) users
4. **Type Safety**: Database models inherit existing TypeScript interfaces

### Implementation Strategy

#### Phase 1: Hybrid Storage Hook

```typescript
export function useChatHistory(userId?: string): UseChatHistoryReturn {
  // Use database if authenticated, localStorage if anonymous
  const storage = userId
    ? useChatHistoryDatabaseStorage(userId)
    : useChatHistoryLocalStorage(CHAT_HISTORY_KEY, initialState);

  // Sync localStorage to database on sign-in
  const syncLocalToDatabase = useCallback(async () => {
    if (userId && localConversations.length > 0) {
      await migrateConversationsToDatabase(localConversations, userId);
      clearLocalStorage(); // Optional: clear after successful sync
    }
  }, [userId, localConversations]);

  return { ...storage, syncLocalToDatabase };
}
```

#### Phase 2: Database Storage Implementation

```typescript
function useChatHistoryDatabaseStorage(userId: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchConversations = useCallback(async () => {
    const { data } = await supabase
      .from("conversations")
      .select(`*, messages(*)`)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    return deserializeChatHistory({ conversations: data || [] });
  }, [userId]);

  const saveConversation = useCallback(
    async (conversation: ChatConversation) => {
      // Upsert conversation and messages in transaction
      await supabase.rpc("save_conversation_with_messages", {
        conversation_data: conversation,
        user_id: userId,
      });
    },
    [userId]
  );
}
```

#### Phase 3: Migration Benefits

- **Seamless User Experience**: Anonymous users keep localStorage, authenticated users get cloud sync
- **Data Preservation**: Existing conversations automatically migrate on sign-in
- **Offline Support**: App continues working offline with localStorage fallback
- **Cross-Device Sync**: Conversations available across all user devices
- **Conflict Resolution**: Handle concurrent edits across devices

### Database Schema Rationale

The proposed schema directly mirrors the current localStorage structure:

- **conversations** table = `ChatConversation` interface
- **messages** table = `ChatMessage` interface
- Preserves existing ID formats and field names
- Maintains all metadata (tokens, models, completion_ids, etc.)
- Ready for advanced features (search, analytics, sharing)

### Migration Effort Assessment: **LOW**

- **Data Model Changes**: None required
- **Component Updates**: Zero breaking changes
- **Hook Interface**: Fully backward compatible
- **Testing**: Existing tests continue to work
- **Deployment**: Can be rolled out incrementally

The localStorage implementation serves as a perfect "local database" that seamlessly upgrades to Supabase with minimal code changes and zero user disruption.

---

This draft outlines the core requirements and architecture for the sign-in feature using Supabase. It will evolve as implementation progresses and feedback is gathered.
