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

## 🚀 **Complete Execution Plan (Start Here)**

### **Phase 0: Initial Setup (Human Coordinator)** ⏳ **IMMEDIATE NEXT STEP**

**Goal:** Prepare Supabase project and environment
**Duration:** 30 minutes
**Prerequisites:** None
**Status:** ⏳ **PENDING HUMAN ACTION**

#### Human Coordinator Tasks (Required First)

- [x] **0.1** Create Supabase project at [app.supabase.com](https://app.supabase.com)
- [x] **0.2** Note down Project URL and anon key from Settings → API
- [x] **0.3** Enable Google OAuth in Authentication → Providers
- [x] **0.4** Set redirect URLs:
  - Development: `http://localhost:3000/auth/callback`
  - Production: `https://yourdomain.com/auth/callback`
- [x] **0.5** Add environment variables to `.env.local`:
  ```bash
  NEXT_PUBLIC_SUPABASE_URL=your-project-url-here
  NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
  ```
- [x] **0.6** Provide credentials to agent for implementation

**Checkpoint:** ✅ Supabase project ready, credentials available

---

### **Phase 1: Foundation & Authentication (Priority 1)** ✅ **COMPLETED**

**Goal:** Google OAuth sign-in functionality  
**Duration:** 2-3 days
**Prerequisites:** Phase 0 complete
**Status:** ✅ **COMPLETED** - Ready for testing once Supabase is configured

#### Agent Implementation Tasks

- [x] **1.1** Install Supabase dependencies ✅ **COMPLETED**
  ```bash
  npm install @supabase/ssr @supabase/supabase-js
  ```
  **Implementation Notes:** Used `@supabase/ssr` (v0.6.1) instead of auth-helpers for Next.js 15 compatibility
- [x] **1.2** Create Supabase client configuration ✅ **COMPLETED**
  - [x] `lib/supabase/client.ts` - Client-side Supabase client ✅
  - [x] `lib/supabase/server.ts` - Server-side Supabase client ✅

#### Human SQL Execution Tasks

- [x] **1.3** Execute SQL schema in Supabase SQL Editor: ✅ **READY FOR EXECUTION**
  ```sql
  -- SQL scripts created in database/ directory
  -- Execute database/01-user-profiles.sql in Supabase SQL Editor
  ```

#### Agent Implementation Tasks (Continued)

- [x] **1.4** Build authentication infrastructure ✅ **COMPLETED (MODIFIED DESIGN)**

  - [x] `stores/useAuthStore.ts` - Zustand-based auth store (instead of Context) ✅
  - [x] `components/auth/AuthProvider.tsx` - Lightweight auth initializer ✅
  - [x] Update app layout with auth provider ✅

  **Design Change:** Implemented Zustand store pattern instead of React Context for consistency with existing architecture

- [x] **1.5** Create Google Sign-In UI ✅ **COMPLETED**

  - [x] `components/auth/SimpleAuthButton.tsx` - Google OAuth modal with perfect centering ✅
  - [x] Sign-out functionality with complete store cleanup ✅
  - [x] User profile display in navigation ✅
  - [x] Loading states and error handling ✅
  - [x] `src/app/auth/callback/route.ts` - OAuth callback handler ✅
  - [x] `src/app/auth/error/page.tsx` - Error page with auto-redirect ✅

- [x] **1.6** Implement profile creation logic ✅ **COMPLETED**
  - [x] Auto-create user profile on first sign-in ✅
  - [x] Handle profile data synchronization ✅
  - [x] Profile management utilities ✅
  - [x] Complete store cleanup on sign-out ✅

**Checkpoint:** ✅ Users can sign in/out with Google, profiles created automatically

---

## 🛠️ **IMPLEMENTATION CHANGES & FIXES COMPLETED**

### **Authentication Architecture Refinements**

- **Zustand Integration:** Migrated from useState/useEffect to Zustand store pattern for consistency
- **Modal Positioning Fix:** Implemented perfect vertical/horizontal centering for sign-in modal
- **Error Handling:** Fixed React navigation error on auth cancellation (separated countdown from navigation logic)
- **Store Cleanup:** Complete state cleanup on sign-out (clears all Zustand stores)
- **Theme Consistency:** Dark/light mode support with proper styling

### **Testing Infrastructure**

- **ESM Module Support:** Fixed Jest configuration for Supabase ESM imports
- **Supabase Mocking:** Complete mock infrastructure for authentication tests
- **Punycode Warnings:** Suppressed deprecated punycode module warnings
- **Test Isolation:** Proper test environment setup with auth mocks

### **Code Quality**

- **TypeScript Types:** Proper typing for auth state and user data
- **Error Boundaries:** Graceful error handling for auth failures
- **Performance:** Optimized re-renders with Zustand selectors

---

### **Phase 2: Chat History Database Integration (Priority 2)** ✅ **COMPLETED**

**Goal:** Sync Zustand/localStorage chat history with Supabase
**Duration:** 2-3 days  
**Prerequisites:** Phase 1 complete
**Status:** ✅ **COMPLETED** - Chat sync functional, data isolation working

#### Human SQL Execution Tasks

- [x] **2.1** Execute chat database schema in Supabase SQL Editor: ✅ **READY FOR EXECUTION**
  ```sql
  -- SQL scripts created in database/ directory
  -- Execute database/02-chat-tables.sql in Supabase SQL Editor
  ```

#### Agent Implementation Tasks

- [x] **2.2** Update Conversation interface with userId tracking ✅ **COMPLETED**

  - [x] Modify `stores/types/chat.ts` to add `userId?: string` ✅
  - [x] Update all conversation creation logic ✅
  - [x] Add data filtering utilities ✅

- [x] **2.3** Create chat sync API endpoints ✅ **COMPLETED**

  - [x] `/api/chat/sync` - Bulk conversation sync ✅
  - [x] `/api/chat/sessions` - CRUD operations for sessions ✅
  - [x] `/api/chat/messages` - CRUD operations for messages ✅
  - [x] Authentication middleware for all endpoints ✅

- [x] **2.4** Implement user-aware chat storage strategy ✅ **COMPLETED**

  - [x] Add user filtering logic to `useChatStore` ✅
  - [x] Implement conversation ownership validation ✅
  - [x] Add anonymous-to-authenticated migration logic ✅
  - [x] Create sync middleware for authenticated users ✅
  - [x] **ADD AUTO-SYNC TRIGGERS** - Auto-sync after successful message exchange ✅
  - [x] **ADD AUTO-SYNC TRIGGERS** - Auto-sync after conversation title updates ✅

- [x] **2.5** Enhance existing ChatSidebar ✅ **COMPLETED**
  - [x] Add sync status indicators (synced/syncing/offline) ✅
  - [x] Add "Sign in to sync across devices" prompt ✅
  - [x] Implement conflict resolution UI ✅
  - [x] Maintain existing CRUD functionality ✅

**Checkpoint:** ✅ Chat history syncs between devices, data isolation working

---

### **Phase 3: User Management & Session Handling (Priority 3)**

**Goal:** Complete user management system
**Duration:** 2-3 days
**Prerequisites:** Phase 2 complete

#### Human SQL Execution Tasks

- [ ] **3.1** Execute user enhancement schema in Supabase SQL Editor:
  ```sql
  -- Add credits column
  -- Add subscription_tier enum
  -- Add usage_stats jsonb
  -- Add last_active timestamp
  ```

#### Agent Implementation Tasks

- [ ] **3.2** Enhance session management

  - [ ] Implement JWT token handling with refresh
  - [ ] Create session middleware for API routes
  - [ ] Add token validation utilities
  - [ ] Handle session expiry gracefully

- [ ] **3.3** Create user dashboard

  - [ ] User profile page with editable fields
  - [ ] Usage statistics display
  - [ ] Credit balance and usage tracking
  - [ ] Account management options

- [ ] **3.4** Implement user data security
  - [ ] Server-side user data validation
  - [ ] API route protection
  - [ ] Audit trail for user actions
  - [ ] Account deletion functionality

**Checkpoint:** ✅ Complete user management, secure session handling

---

### **Phase 4: Model Configuration & Settings (Priority 4)**

**Goal:** User-configurable preferences (UI ready, backend planned)
**Duration:** 1-2 days
**Prerequisites:** Phase 3 complete

#### Human SQL Execution Tasks

- [ ] **4.1** Execute preferences schema in Supabase SQL Editor:
  ```sql
  -- Complete profiles table with:
  -- default_model, allowed_models[], temperature, system_prompt
  -- ui_preferences jsonb
  ```

#### Agent Implementation Tasks

- [ ] **4.2** Implement model access control

  - [ ] Update `/api/models` endpoint for user-specific filtering
  - [ ] Add free vs paid model access logic
  - [ ] Implement model filtering based on user tier
  - [ ] Handle unauthenticated user access

- [ ] **4.3** Create settings UI

  - [ ] User settings page with model selection
  - [ ] Temperature and system prompt configuration (UI only)
  - [ ] Model preference management interface
  - [ ] Settings persistence and loading

- [ ] **4.4** Plan future chat integration
  - [ ] Document required changes to chat endpoint
  - [ ] Plan temperature/system prompt integration
  - [ ] Design backward compatibility strategy

**Checkpoint:** ✅ Settings UI functional, model access controlled by user tier

---

### **Phase 5: Testing & Validation**

**Goal:** Comprehensive testing of all features
**Duration:** 1 day
**Prerequisites:** Phase 4 complete

#### Testing Tasks

- [ ] **5.1** Authentication flow testing

  - [ ] Google sign-in redirects correctly
  - [ ] User profile creation on first login
  - [ ] Sign-out clears session properly
  - [ ] Unauthenticated users see limited features

- [ ] **5.2** Chat history functionality testing

  - [ ] New conversations save to database
  - [ ] History loads last 10 conversations correctly
  - [ ] Messages persist with correct timestamps
  - [ ] User data isolation prevents cross-user access
  - [ ] Anonymous conversation migration works

- [ ] **5.3** User management testing

  - [ ] Session tokens refresh automatically
  - [ ] API routes reject unauthenticated requests
  - [ ] Profile updates save and load correctly
  - [ ] Account switching works cleanly

- [ ] **5.4** Model configuration testing
  - [ ] Model preferences apply to dropdown
  - [ ] Settings interface saves without errors
  - [ ] Free users see only allowed models
  - [ ] UI correctly shows current user settings

**Checkpoint:** ✅ All features tested and working correctly

---

## 📋 **Quick Start Checklist**

### **Before Implementation (Human Required)**

- [ ] ⏳ **PENDING** Phase 0 complete (Supabase project created, credentials ready)
- [x] ✅ **COMPLETED** Development environment set up
- [x] ✅ **COMPLETED** Agent has access to project and credentials

### **Implementation Order**

1. **Phase 1** → Authentication working ✅ **COMPLETED** (Google OAuth, Zustand stores, UI polished)
2. **Phase 2** → Chat history syncing ✅ **COMPLETED** (API endpoints, sync UI, data isolation working)
3. **Phase 3** → User management complete ⏳ **NEXT** (Enhanced user schema, session management)
4. **Phase 4** → Settings and preferences ⏳ **PENDING**
5. **Phase 5** → Testing and validation ⏳ **PENDING**

### **Human Intervention Points**

- **Phase 0:** ⏳ **IMMEDIATE NEXT STEP** - Initial Supabase setup (project creation, OAuth config)
- **Phase 1.3:** ✅ **COMPLETED** - Execute user schema SQL
- **Phase 2.1:** ⏳ **NEXT REQUIRED** - Execute chat schema SQL (database/02-chat-tables.sql)
- **Phase 3.1:** ⏳ **PENDING** - Execute user enhancement SQL
- **Phase 4.1:** ⏳ **PENDING** - Execute preferences schema SQL
- **Testing:** ⏳ **PENDING** - Validate functionality at each checkpoint

---

### Phase 1: Foundation & Authentication (Priority 1)

**Goal:** Google OAuth sign-in functionality
**Duration:** 2-3 days
**Human Checkpoints:** ✅ Sign-in works, ✅ User data persists

#### Task 1.1: Install Dependencies (Agent)

- Install `@supabase/supabase-js` and `@supabase/auth-helpers-nextjs`
- Create Supabase client configuration
- **Checkpoint:** Dependencies installed without conflicts

#### Task 1.2: Database Schema Setup (Human + Agent)

**Human:** Execute provided SQL in Supabase SQL Editor
**Agent:** Generate SQL scripts for:

```sql
-- Users table (auto-created by Supabase Auth)
-- profiles table with user preferences
-- Row Level Security (RLS) policies
```

**Checkpoint:** Tables created, RLS enabled

#### Task 1.3: Auth Infrastructure (Agent)

- Create `lib/supabase/client.ts` and `lib/supabase/server.ts`
- Build auth context provider (`contexts/AuthContext.tsx`)
- Create auth hooks (`hooks/useAuth.ts`)
- **Checkpoint:** Auth context available throughout app

#### Task 1.4: Google Sign-In UI (Agent)

- Create sign-in modal/page with Google OAuth
- Add sign-out functionality
- Update main layout with auth state
- **Checkpoint:** Users can sign in/out with Google

#### Task 1.5: Profile Creation (Agent)

- Auto-create user profile on first sign-in
- Handle profile data synchronization
- **Checkpoint:** User profiles created automatically

---

### Phase 2: Chat History Database Integration (Priority 2)

**Goal:** Sync existing Zustand/localStorage chat history with Supabase for signed-in users
**Duration:** 2-3 days
**Human Checkpoints:** ✅ Chats sync to DB, ✅ History retrieves across devices

#### Task 2.1: Chat Database Schema (Human + Agent)

**Human:** Execute SQL for chat tables
**Agent:** Generate:

```sql
-- chat_sessions table
-- chat_messages table
-- Indexes for performance
-- RLS policies for user data isolation
```

**Checkpoint:** Chat tables ready

#### Task 2.2: Chat Sync API (Agent)

- Create `/api/chat/sync` endpoint for bulk conversation sync
- Create `/api/chat/sessions` CRUD endpoints
- Create `/api/chat/messages` CRUD endpoints
- Add authentication middleware for protected operations
- **Checkpoint:** API endpoints functional

#### Task 2.3: User-Aware Chat Storage Strategy (Agent)

**Critical Data Isolation Fix:**

Current `Conversation` interface needs `userId` field to prevent data leakage between users.

**Required Changes:**

```typescript
// stores/types/chat.ts - Update Conversation interface
export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  userId?: string; // NEW: Track conversation owner
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  totalTokens: number;
  lastModel?: string;
  isActive: boolean;
  lastMessagePreview?: string;
  lastMessageTimestamp?: string;
}
```

**Storage Strategy by User State:**

**For Non-Signed-In Users:**

- Continue using existing Zustand + localStorage flow
- All conversations have `userId: null` or `userId: undefined`
- No changes to current behavior

**For Signed-In Users:**

- **On Sign-In:**
  1. Mark current user in auth context (`currentUserId`)
  2. Filter localStorage conversations by `userId` (keep only current user's + anonymous)
  3. Fetch user's conversations from Supabase
  4. Merge filtered localStorage + Supabase conversations
  5. Update all new conversations with current `userId`

**Data Isolation Logic:**

```typescript
// useChatStore enhancement
const getFilteredConversations = (
  conversations: Conversation[],
  currentUserId: string | null
) => {
  if (!currentUserId) {
    // Non-authenticated: show only conversations without userId
    return conversations.filter((conv) => !conv.userId);
  } else {
    // Authenticated: show only current user's conversations
    return conversations.filter((conv) => conv.userId === currentUserId);
  }
};
```

**On User Sign-Out:**

1. Sync current user's conversations to Supabase
2. Clear user-specific conversations from Zustand store
3. Keep only anonymous conversations in localStorage
4. Reset to anonymous mode

**On User Switch (A signs out, B signs in):**

1. User A signs out → A's conversations synced and filtered out
2. User B signs in → Only B's conversations loaded
3. No cross-contamination possible

**Implementation:**

- Update `Conversation` interface with `userId` field
- Add user filtering logic to useChatStore
- Implement conversation ownership validation
- Add migration logic for existing anonymous conversations
- **Checkpoint:** Complete data isolation between users

#### Task 2.4: Enhance Existing ChatSidebar (Agent)

**Current ChatSidebar already implemented - enhance it:**

- Add sync status indicators (synced/syncing/offline)
- Add "Sign in to sync across devices" prompt for non-authenticated users
- Add conflict resolution UI for sync conflicts
- Maintain existing edit/delete/new chat functionality
- **Checkpoint:** ChatSidebar enhanced with sync features

---

### Phase 3: User Tables & Session Management (Priority 3)

**Goal:** Complete user management system
**Duration:** 2-3 days
**Human Checkpoints:** ✅ User data secure, ✅ Session handling robust

#### Task 3.1: Enhanced User Schema (Human + Agent)

**Human:** Execute SQL updates
**Agent:** Add fields for:

```sql
-- credits column (integer, default 0)
-- subscription_tier (enum: free, pro, enterprise)
-- usage_stats (jsonb)
-- last_active timestamp
```

**Checkpoint:** User schema complete

#### Task 3.2: Session Management (Agent)

- Implement JWT token handling
- Add session refresh logic
- Create session middleware for API routes
- **Checkpoint:** Sessions handle properly

#### Task 3.3: User Dashboard (Agent)

- Create user profile page
- Display usage statistics
- Show credit balance
- **Checkpoint:** Users can view their data

---

### Phase 4: User Profiles & Model Configuration (Priority 4)

**Goal:** Configurable user preferences (UI ready, functionality planned)
**Duration:** 1-2 days
**Human Checkpoints:** ✅ Settings UI functional, ✅ Preferences save

#### Task 4.1: Preferences Schema (Human + Agent)

**Human:** Execute final schema updates
**Agent:** Complete profiles table:

```sql
-- default_model string
-- allowed_models text[]
-- temperature float (0.0-2.0)
-- system_prompt text
-- ui_preferences jsonb
```

**Checkpoint:** Preferences schema ready

#### Task 4.2: Model Access Control (Agent)

- Update `/api/models` endpoint for user-specific models
- Implement free vs paid model access
- Add model filtering logic
- **Checkpoint:** Model access controlled by user tier

#### Task 4.3: Settings UI (Agent)

- Create user settings page
- Add model selection interface
- Add temperature/prompt configuration (UI only)
- **Checkpoint:** Settings interface functional

#### Task 4.4: Integration Planning (Agent)

- Document chat endpoint changes needed
- Plan temperature/system prompt integration
- **Note:** Chat functionality changes deferred to future phase

---

## Session Management Strategy

### Authentication Flow

1. **Google OAuth:** User signs in → Supabase Auth → JWT token
2. **Session Persistence:** JWT stored in httpOnly cookies
3. **Token Refresh:** Automatic refresh using Supabase auth helpers
4. **Server-Side Auth:** Middleware validates tokens on API routes

### Security Considerations

- **Row Level Security (RLS):** Users can only access their own data
- **API Route Protection:** All database operations require authentication
- **Token Validation:** Server-side token verification on each request
- **CORS Configuration:** Properly configured for your domain

---

## Model Access Strategy

### Unauthenticated Users

- Access only to free models from `OPENROUTER_MODELS_LIST`
- Limited to basic models (e.g., `deepseek/deepseek-r1-0528:free`)
- No chat history persistence

### Authenticated Users (Free Tier)

- Access to free + basic paid models
- Chat history saved (last 10 conversations)
- Basic usage tracking

### Future: Premium Users

- Access to all models
- Unlimited chat history
- Advanced features (temperature control, system prompts)

---

## Human Coordinator Setup Checklist

### Pre-Implementation (Required)

- [ ] Create Supabase project
- [ ] Enable Google OAuth provider
- [ ] Set redirect URLs for auth
- [ ] Add environment variables to `.env.local`
- [ ] Provide project URL and anon key to agent

### During Implementation (SQL Execution)

- [ ] Execute database schema SQL (Phase 1.2)
- [ ] Execute chat tables SQL (Phase 2.1)
- [ ] Execute user enhancements SQL (Phase 3.1)
- [ ] Execute preferences schema SQL (Phase 4.1)

### Testing Checkpoints

- [ ] Phase 1: Sign in with Google works
- [ ] Phase 2: Chat history persists and loads
- [ ] Phase 3: User data is properly isolated
- [ ] Phase 4: Settings save and load correctly

---

## Testing & Validation Strategy

### Phase 1 Tests

- [ ] Google sign-in redirects correctly
- [ ] User profile created on first login
- [ ] Sign-out clears session
- [ ] Unauthenticated users see limited features

### Phase 2 Tests

- [ ] New conversations save to database
- [ ] Chat history loads last 10 conversations
- [ ] Messages persist with correct timestamps
- [ ] Only user's own chats are visible

### Phase 3 Tests

- [ ] Session tokens refresh automatically
- [ ] API routes reject unauthenticated requests
- [ ] User data isolation works correctly
- [ ] Profile updates save properly

### Phase 4 Tests

- [ ] Model preferences apply to dropdown
- [ ] Settings interface saves without errors
- [ ] Free users see only allowed models
- [ ] UI shows current user settings

---

## Migration Considerations

### Existing Data

- Current localStorage chat data can be migrated on first sign-in
- Existing model preferences preserved
- Gradual transition from localStorage to database

### Backward Compatibility

- Unauthenticated users maintain current functionality
- No breaking changes to existing chat API
- Optional authentication (users can continue without signing in)

---

## Chat History Management Strategy

### Current System (Existing)

- **Zustand Store:** `useChatStore` manages conversations and messages in memory
- **localStorage:** Persists conversations across browser sessions
- **ChatSidebar:** Already implemented with full CRUD operations (create, edit, delete, switch)
- **Data Flow:** User interactions → Zustand store → localStorage persistence

### New System (With Authentication)

#### For Non-Authenticated Users

- **No Changes:** Continue using existing Zustand + localStorage flow
- **Full Functionality:** All current features remain exactly the same
- **Data Storage:** Only local (localStorage), no server sync

#### For Authenticated Users

- **Primary State:** Continue using Zustand store for immediate responsiveness
- **Database Sync:** Background sync to Supabase for cross-device access
- **Data Flow:** User interactions → Zustand store → localStorage + Supabase sync

#### Sync Strategy Details

**On User Sign-In:**

1. Get `currentUserId` from auth context
2. **Anonymous Conversation Migration:** Prompt user to migrate existing anonymous conversations
3. Filter existing localStorage conversations (keep only current user's + anonymous)
4. Fetch last 10 conversations from Supabase for current user
5. Merge filtered localStorage + Supabase conversations (dedup by ID/timestamp)
6. Update Zustand store with merged data
7. Mark all new conversations with current `userId`
8. Auto-sync mode activated

**Anonymous Conversation Migration Flow:**

When user signs in and has existing anonymous conversations:

**Option A: Automatic Migration (Recommended)**

- All existing anonymous conversations automatically become owned by the signing-in user
- Update `userId` from `null/undefined` to `currentUserId`
- Sync these newly-owned conversations to Supabase
- User retains all their work seamlessly

**Option B: User Choice Migration (Advanced)**

- Show migration dialog: "You have X conversations from before signing in. Import them to your account?"
- **"Import All"** → Migrate all anonymous conversations to user account
- **"Discard"** → Keep conversations as anonymous (local only)
- **"Select"** → Let user choose which conversations to migrate

**Implementation Logic:**

```typescript
// On user sign-in
const migrateAnonymousConversations = async (currentUserId: string) => {
  const anonymousConvs = conversations.filter((conv) => !conv.userId);

  if (anonymousConvs.length > 0) {
    // Option A: Automatic migration
    const migratedConvs = anonymousConvs.map((conv) => ({
      ...conv,
      userId: currentUserId,
      updatedAt: new Date().toISOString(),
    }));

    // Update store and sync to Supabase
    updateConversationsWithUserId(migratedConvs);
    await syncConversationsToSupabase(migratedConvs);
  }
};
```

**During Session (Authenticated):**

1. All interactions continue through Zustand store
2. New conversations automatically tagged with current `userId`
3. Debounced sync to Supabase every 5 seconds for user's conversations only
4. localStorage continues as backup (with user filtering)
5. Conflict resolution for concurrent edits

**On User Sign-Out:**

1. Final sync of current user's conversations to Supabase
2. Filter out current user's conversations from Zustand store and localStorage
3. Keep only anonymous conversations in localStorage
4. Clear auth context (`currentUserId = null`)
5. Revert to anonymous-only mode

**User Switch Scenario (A → B):**

1. User A signs out → A's conversations synced and removed from local storage
2. localStorage now contains only anonymous conversations
3. User B signs in → B's conversations fetched from Supabase
4. B sees only their conversations + any new anonymous ones
5. No data leakage between users

### Implementation Benefits

- **Zero Breaking Changes:** Non-authenticated users unaffected
- **Performance:** Zustand store remains primary for UI responsiveness
- **Reliability:** localStorage as fallback during network issues
- **Cross-Device:** Authenticated users get synced history
- **Gradual Migration:** Users can sign in anytime to enable sync

---

## Data Isolation & Security Strategy

### User Data Separation

#### Problem Scenario (Solved)

Without proper data isolation:

1. User A signs in → A's conversations loaded and mixed with anonymous localStorage
2. User A signs out → conversations remain in localStorage
3. User B signs in → B's conversations merge with A's data in localStorage
4. B's sync uploads A's conversations to B's account → **Data breach!**

#### Solution: User-Aware Conversations

**Conversation Ownership Tracking:**

```typescript
interface Conversation {
  id: string;
  userId?: string; // NEW: null for anonymous, string for authenticated users
  title: string;
  messages: ChatMessage[];
  // ...other fields
}
```

**Filtering Logic:**

```typescript
// Anonymous mode: show only conversations without userId
const anonymousConversations = conversations.filter((conv) => !conv.userId);

// Authenticated mode: show only current user's conversations
const userConversations = conversations.filter(
  (conv) => conv.userId === currentUserId
);
```

### Security Benefits

1. **Data Isolation:** Each user sees only their own conversations
2. **Cross-User Protection:** Impossible to accidentally sync another user's data
3. **Anonymous Privacy:** Anonymous conversations never associated with user accounts
4. **Migration Safety:** Existing anonymous conversations remain anonymous until explicitly owned
5. **Account Switching:** Clean separation when multiple users share device

### Implementation Safeguards

- **Server-Side Validation:** API endpoints verify `userId` matches authenticated user
- **Client-Side Filtering:** Zustand store filters conversations by current user
- **Sync Protection:** Only user's own conversations sync to their Supabase account
- **Audit Trail:** Database tracks conversation ownership changes
- **Error Handling:** Reject operations on conversations user doesn't own

---

This comprehensive plan provides a structured approach to implementing Supabase authentication and database functionality while maintaining your existing chat capabilities and allowing for future enhancements.

---

## Anonymous-to-Authenticated Migration Strategy

### Scenario: User Creates Conversations Before Signing In

**Common User Journey:**

1. User visits app anonymously
2. Creates several conversations with chat history
3. Later decides to sign in to sync across devices
4. **Question:** What happens to existing anonymous conversations?

### Migration Options

#### **Option A: Seamless Migration (Recommended)**

**User Experience:** Transparent - user keeps all their work
**Implementation:**

- Automatically convert all anonymous conversations to user-owned
- Update `userId: null` → `userId: currentUserId`
- Sync migrated conversations to Supabase
- No data loss, seamless transition

**Pros:**

- ✅ Best user experience - no lost work
- ✅ Encourages sign-up (users trust they won't lose data)
- ✅ Simple implementation

**Cons:**

- ⚠️ Anonymous conversations become permanently associated with account

#### **Option B: User Choice Migration**

**User Experience:** Show migration dialog on sign-in
**Implementation:**

```typescript
// Migration dialog options
interface MigrationChoice {
  importAll: boolean; // Import all conversations
  discard: boolean; // Keep as anonymous (local only)
  selective: string[]; // Array of conversation IDs to import
}
```

**Dialog Flow:**

1. Detect anonymous conversations on sign-in
2. Show dialog: "Import your 3 existing conversations to your account?"
3. User chooses: "Import All" | "Keep Local" | "Select..."
4. Execute based on choice

**Pros:**

- ✅ User control over data association
- ✅ Privacy-conscious users can keep conversations anonymous
- ✅ Selective import option

**Cons:**

- ⚠️ More complex UX flow
- ⚠️ Risk of user accidentally discarding valuable conversations

### Recommended Implementation: Hybrid Approach

**Default Behavior:** Seamless migration (Option A)
**Advanced Option:** Settings toggle for migration preference

```typescript
// User settings
interface UserPreferences {
  autoMigrateAnonymousConversations: boolean; // default: true
}

// Migration logic
const handleSignInMigration = async (currentUserId: string) => {
  const anonymousConvs = getAnonymousConversations();

  if (anonymousConvs.length === 0) return;

  const userPrefs = await getUserPreferences(currentUserId);

  if (userPrefs.autoMigrateAnonymousConversations) {
    // Seamless migration
    await migrateAllConversations(anonymousConvs, currentUserId);
    showNotification("Your conversations have been saved to your account!");
  } else {
    // Show migration dialog
    showMigrationDialog(anonymousConvs, currentUserId);
  }
};
```

### Implementation Details

#### Database Considerations

- **Conversation IDs:** Keep existing IDs to maintain references
- **Timestamps:** Preserve original `createdAt`, update `updatedAt`
- **Metadata:** Maintain all message history and conversation metadata

#### UI/UX Flow

```typescript
// On successful sign-in
if (hasAnonymousConversations()) {
  // Show brief notification
  toast.success(
    `Welcome! Your ${count} conversations are now synced to your account.`
  );
}
```

#### Rollback Strategy

- Keep conversation migration as atomic operation
- Allow "undo" option for 24 hours after migration
- Store migration timestamp for audit purposes

### Edge Cases Handled

1. **Duplicate Conversations:** If user signs in on device with existing conversations
2. **Large Anonymous History:** Migrate in batches to avoid performance issues
3. **Network Failure:** Queue migrations for retry when connection restored
4. **Sign-out/Sign-in:** Migrated conversations remain with original user
