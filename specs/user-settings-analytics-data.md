# User Settings Analytics Data Implementation Plan

## Overview

This plan outlines the implementation for integrating real database analytics into the UserSettings component, replacing dummy data with actual user usage statistics from the backend database.

## Current State Analysis

### Database Schema Review

Based on analysis of `/database/schema/` files, the following structures are available:

#### Core Tables

- **`public.profiles`** - User profile with `usage_stats` JSONB field containing:

  - `total_messages`: All-time message count (cumulative, includes deleted)
  - `total_tokens`: All-time token count (cumulative, includes deleted)
  - `sessions_created`: Incremental counter (currently broken - always 0)
  - `last_reset`: Timestamp from profile creation (never updated)

- **`public.user_usage_daily`** - Daily usage metrics:
  - `messages_sent`, `messages_received`: Daily message counts
  - `input_tokens`, `output_tokens`, `total_tokens`: Daily token usage
  - `models_used`: JSONB object tracking model usage counts
  - `sessions_created`, `active_minutes`: Daily activity metrics
  - `estimated_cost`: Cost tracking for paid models

#### Existing Views & Functions

- **`api_user_summary` view** - Comprehensive user data with today's usage
- **`get_user_complete_profile(user_uuid)` function** - Complete profile with preferences and usage stats
- **`track_user_usage()` function** - Updates daily and cumulative usage stats

#### Current UserSettings Component

- Uses hardcoded dummy data for analytics
- Shows: "Messages sent today: 42", "Tokens used today: 12345"
- TODO comments indicate need for real data integration

## Implementation Plan

### Phase 0: Database Preparation

#### Task 0.1: Database Function Analysis (COMPLETED)

- **Responsible**: AGENT
- [x] Analyze `public.get_user_complete_profile()` function capabilities
- [x] **FINDING**: Function returns 7-day array instead of today's specific data
- [x] **FINDING**: Function structure needs modification for clean today's data extraction
- [x] Create migration script in `/database/patches/user-settings-analytics/`
- [x] Design enhanced `get_user_complete_profile()` to include separate `today` field
- [x] Ensure backwards compatibility with existing function users
- [x] Document changes in migration script

**Expected Function Output Structure:**

```jsonb
{
  "id": "user-uuid",
  "email": "user@example.com",
  "full_name": "John Doe",
  "avatar_url": "https://example.com/avatar.jpg",
  "subscription_tier": "free",
  "credits": 100,
  "preferences": {
    "model": {
      "default_model": "gpt-4o-mini",
      "temperature": 0.7,
      "system_prompt": "You are a helpful assistant"
    },
    "ui": {"theme": "dark", "language": "en"},
    "session": {"auto_save": true, "max_history": 100}
  },
  "available_models": [
    {
      "model_id": "gpt-4o-mini",
      "model_name": "GPT-4o Mini",
      "model_description": "Fast and efficient model",
      "model_tags": ["chat", "completion"],
      "daily_limit": 100,
      "monthly_limit": 1000
    }
  ],
  "usage_stats": {
    "today": {
      "messages_sent": 5,
      "messages_received": 5,
      "total_tokens": 1250,
      "input_tokens": 500,
      "output_tokens": 750,
      "models_used": {"gpt-4o-mini": 3, "gpt-4": 2},
      "sessions_created": 2,
      "active_minutes": 45
    },
    "all_time": {
      "total_messages": 150,
      "total_tokens": 45000,
      "sessions_created": 25,
      "last_reset": "2024-01-01T00:00:00Z"
    },
    "recent_days": [
      {
        "usage_date": "2025-08-06",
        "messages_sent": 5,
        "messages_received": 5,
        "total_tokens": 1250,
        "models_used": {"gpt-4o-mini": 3},
        "sessions_created": 2,
        "active_minutes": 45
      }
    ]
  },
  "timestamps": {
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2025-08-06T10:30:00Z",
    "last_active": "2025-08-06T10:30:00Z"
  }
}
```

Refer to `/database/samples/get_user_complete_profile.json` for example data.

#### Task 0.2: Execute Database Migration

- **Responsible**: USER
- [x] Create directory `/database/patches/user-settings-analytics/`
- [x] Apply migration script `01-enhance-user-profile-function.sql`
- [x] Test enhanced function with a real user UUID
- [x] Verify today's data structure is correctly returned
- [x] Confirm backwards compatibility (recent_days still works)

**Phase 0 Summary & Testing**

- [x] **AGENT**: Provide migration script and verification queries (COMPLETED)
- [x] **USER**: Execute migration, run verification queries, confirm enhanced function works correctly

### Phase 1: Backend API Development

#### Task 1.1: Create Unified User Data API Endpoint

**API Endpoint Specification:**

**Endpoint URL:** `/api/user/data`

**GET Request:**

- **Method:** GET
- **Headers:**
  ```
  Authorization: Bearer <jwt-token>
  ```
- **Payload:** None
- **Expected Response (200):**
  ```json
  {
    "today": {
      "messages_sent": 5,
      "messages_received": 5,
      "total_tokens": 1250,
      "input_tokens": 500,
      "output_tokens": 750,
      "models_used": { "gpt-4o-mini": 3, "gpt-4": 2 },
      "sessions_created": 2,
      "active_minutes": 45
    },
    "allTime": {
      "total_messages": 150,
      "total_tokens": 45000,
      "sessions_created": 25,
      "last_reset": "2024-01-01T00:00:00Z"
    },
    "profile": {
      "email": "user@example.com",
      "full_name": "John Doe",
      "avatar_url": "https://example.com/avatar.jpg",
      "subscription_tier": "free",
      "credits": 100
    },
    "preferences": {
      "ui": { "theme": "dark", "language": "en" },
      "session": { "auto_save": true, "max_history": 100 },
      "model": {
        "default_model": "gpt-4o-mini",
        "temperature": 0.7,
        "system_prompt": "You are a helpful assistant"
      }
    },
    "timestamps": {
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2025-08-06T10:30:00Z",
      "last_active": "2025-08-06T10:30:00Z"
    }
  }
  ```

**PUT Request (Update Preferences):**

- **Method:** PUT
- **Headers:**
  ```
  Authorization: Bearer <jwt-token>
  Content-Type: application/json
  ```
- **Payload:**
  ```json
  {
    "ui": { "theme": "light", "language": "en" },
    "session": { "auto_save": false },
    "model": {
      "default_model": "gpt-4",
      "temperature": 0.8
    }
  }
  ```
- **Expected Response (200):** Same structure as GET response with updated preferences

**Error Responses:**

- **401:** `{"error": "Unauthorized", "message": "Invalid or missing token"}`
- **404:** `{"error": "User not found", "message": "User profile does not exist"}`
- **400:** `{"error": "Invalid request", "message": "Invalid preference data"}`
- **500:** `{"error": "Internal server error", "message": "Database connection failed"}`

- **Responsible**: AGENT
- [x] Create `/src/app/api/user/data/route.ts` (single endpoint for all user data)
- [x] Implement `GET` method with authentication check for reading all user data
- [x] Implement `PUT` method for updating profile preferences only
- [x] Use enhanced `public.get_user_complete_profile()` function
- [x] Extract today's data from function's `usage_stats.today` field
- [x] Extract all-time data from function's `usage_stats.all_time` field
- [x] Return structured JSON with analytics, profile, and preferences
- [x] Handle error cases (user not found, database errors)
- [x] Add validation for preference updates in PUT method

**Implementation Requirements:**

- Use existing authentication pattern from other API routes in the project
- Import and use Supabase client from `/lib/supabase/server`
- Extract user ID from JWT token using existing auth middleware
- Call database function: `await supabase.rpc('get_user_complete_profile', { user_uuid: userId })`
- Transform database response to match API specification above
- For PUT: Update user preferences in `profiles` table fields: `ui_preferences`, `session_preferences`, `default_model`, `temperature`, `system_prompt`

#### Task 1.2: TypeScript Type Definitions

- **Responsible**: AGENT
- [x] Create `/lib/types/user-data.ts` for comprehensive user data types
- [x] Define `UserDataResponse` interface matching API response
- [x] Define `UserPreferences` interface for preference updates
- [x] Update existing auth types if needed
- [x] Ensure compatibility with enhanced database function

**Implementation Requirements:**

- Export interfaces that match the API response structure exactly
- Use existing type patterns from `/lib/types/` directory
- Ensure types are compatible with existing auth types in `/lib/types/auth.ts`
- Include JSDoc comments for all interface properties
- Define optional fields correctly for `UserPreferencesUpdate` interface

**Phase 1 Summary & Testing**

- [x] **AGENT**: Summarize backend changes: unified endpoint created, types defined, enhanced function integrated
- [x] **USER**: Test API endpoint manually via browser dev tools, verify authentication works, confirm data structure includes today's analytics and preferences

### Phase 2: Frontend Integration

#### Task 2.1: Create User Data Service

- **Responsible**: AGENT
- [x] Create `/lib/services/user-data.ts`
- [x] Implement `fetchUserData()` function for comprehensive user data
- [x] Implement `updateUserPreferences()` function for preference updates
- [x] Add error handling and loading states
- [x] Include authentication headers
- [x] Add request caching/optimization if needed

**Implementation Requirements:**

- Follow existing service patterns from `/lib/services/` directory
- Use existing auth helper functions for token management
- Import types from `/lib/types/user-data.ts`
- Handle network errors and API errors appropriately
- Use existing error handling patterns from other services
- Include proper TypeScript return types

#### Task 2.2: Create User Data Hook

- **Responsible**: AGENT
- [x] Create `/hooks/useUserData.ts`
- [x] Implement data fetching with proper loading states
- [x] Handle authentication requirements
- [x] Add error state management
- [x] Include data refetch capabilities
- [x] Follow existing hook patterns in codebase

**Implementation Requirements:**

- Follow patterns from existing hooks like `/hooks/useAuth.ts` and `/hooks/useChat.ts`
- Use React hooks: `useState`, `useEffect`, `useCallback`
- Return object with: `{ data, loading, error, refetch, updatePreferences }`
- Handle authentication state changes and retry logic
- Use the service functions from `/lib/services/user-data.ts`
- Include proper TypeScript typing for all returned values

#### Task 2.3: Update UserSettings Component

- **Responsible**: AGENT
- [x] Replace dummy data with real API calls using `useUserData()` hook
- [x] Update analytics section to show:
  - Messages sent today (from `today.messages_sent`)
  - Tokens used today (from `today.total_tokens`)
  - Total messages all-time (from `allTime.total_messages`)
  - Total tokens all-time (from `allTime.total_tokens`)
- [x] Add loading states for data fetching
- [x] Handle error states gracefully
- [x] Improve UI layout for new data structure
- [x] Add refresh capability

**Implementation Requirements:**

- Locate UserSettings component (likely in `/components/` directory)
- Import `useUserData` hook and use it in component
- Replace hardcoded values: "Messages sent today: 42", "Tokens used today: 12345"
- Add loading spinner/skeleton while data is fetching
- Show error message if data fetch fails with retry button
- Ensure component maintains existing styling and layout
- Test that modal opens/closes correctly with new data integration

#### Task 2.4: Profile Data Integration

- **Responsible**: AGENT
- [x] Update profile section with real subscription tier
- [x] Show actual user preferences from database
- [x] Add ability to edit preferences (theme, default model, etc.)
- [x] Implement preference persistence using `updateUserPreferences()`
- [x] Handle validation and error feedback

**Implementation Requirements:**

- Display real values from `profile.subscription_tier`, `profile.email`, `profile.full_name`
- Show current preferences from `preferences.ui`, `preferences.model`, `preferences.session`
- Add form controls for editing: dropdown for model selection, slider for temperature, textarea for system prompt
- Call `updatePreferences` from hook when user saves changes
- Show success/error messages after preference updates
- Validate form inputs before submission (temperature 0-2, non-empty model selection)
- Disable save button while update is in progress

**Phase 2 Summary & Testing**

- [x] **AGENT**: Summarize frontend changes: components updated, real data integrated, user can see actual usage statistics
- [x] **USER**: Test UserSettings modal, verify real data appears, test preference changes persist, confirm loading states work properly

### Phase 3: Documentation & Cleanup

#### Task 3.1: Code Documentation

- **Responsible**: AGENT
- [ ] Document unified API endpoint in `/docs/api/user-data-endpoint.md`
- [ ] Update component documentation in `/docs/components/`
- [ ] Add code comments explaining analytics logic
- [ ] Document type definitions and interfaces
- [ ] Update architecture documentation

#### Task 3.2: User Documentation

- **Responsible**: AGENT
- [ ] Create user guide for settings panel in `/docs/`
- [ ] Document analytics data meaning and calculations
- [ ] Explain subscription tier features
- [ ] Add troubleshooting guide

**Phase 3 Summary & Testing**

- [ ] **AGENT**: Summarize documentation: API documented, components documented, user guide created
- [ ] **USER**: Review documentation for completeness, verify all analytics features work correctly, confirm documentation is helpful

## Advanced Features

For advanced analytics features including charts, trends, and enhanced visualizations, see `/backlog/advanced-user-analytics.md`. These features should be implemented only after the basic analytics functionality is complete and thoroughly tested.

## Technical Implementation Details

### API Endpoints Design

#### `/api/user/data` (GET/PUT)

Uses enhanced `public.get_user_complete_profile(user_uuid)` function which returns comprehensive user data including clean today's analytics:

```typescript
interface UserDataResponse {
  today: {
    messages_sent: number;
    messages_received: number;
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    models_used: Record<string, number>;
    sessions_created: number;
    active_minutes: number;
  };
  allTime: {
    total_messages: number;
    total_tokens: number;
    sessions_created: number;
    last_reset: string;
  };
  profile: {
    email: string;
    full_name: string;
    avatar_url: string;
    subscription_tier: string;
    credits: number;
  };
  preferences: {
    ui: Record<string, any>;
    session: Record<string, any>;
    model: {
      default_model: string;
      temperature: number;
      system_prompt: string;
    };
  };
  timestamps: {
    created_at: string;
    updated_at: string;
    last_active: string;
  };
}

// For PUT requests (updating preferences only)
interface UserPreferencesUpdate {
  ui?: Record<string, any>;
  session?: Record<string, any>;
  model?: {
    default_model?: string;
    temperature?: number;
    system_prompt?: string;
  };
}
```

### Database Schema Status

**Session Tracking Status**: Based on review of `/database/schema/02-chat.sql`, the following session tracking functionality is already implemented:

- **`public.track_session_creation()` function** - Already exists and properly calls `track_user_usage()` with `p_session_created=true`
- **`on_session_created` trigger** - Already exists on `chat_sessions` table to execute the function on INSERT
- **Session counter tracking** - Already functional in the existing `track_user_usage()` function

**Analytics Function Analysis**: The `public.get_user_complete_profile()` function requires modification for optimal analytics data retrieval:

**Current Issues:**

1. Returns "today" data as an array of last 7 days instead of clean today-only data
2. Structure doesn't directly map to required API response format
3. Today's data extraction requires additional processing in API layer

**Required Changes:**

1. Modify function to include clean `today_usage` field with current date data only
2. Maintain backwards compatibility for existing function users
3. Ensure efficient querying for today's specific metrics

### Database Migration Script

File: `/database/patches/user-settings-analytics/01-enhance-user-profile-function.sql`

```sql
-- =============================================================================
-- ENHANCE USER PROFILE FUNCTION FOR ANALYTICS
-- =============================================================================
-- This script modifies get_user_complete_profile() to include clean today's data
-- while maintaining backwards compatibility.

-- Drop and recreate the function with enhanced analytics
CREATE OR REPLACE FUNCTION public.get_user_complete_profile(user_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    profile_data RECORD;
    allowed_models_data JSONB;
    usage_stats_data JSONB;
    today_usage_data JSONB;
BEGIN
    -- Get main profile data
    SELECT
        id, email, full_name, avatar_url,
        default_model, temperature, system_prompt, subscription_tier, credits,
        ui_preferences, session_preferences,
        created_at, updated_at, last_active, usage_stats
    INTO profile_data
    FROM public.profiles
    WHERE id = user_uuid;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'User not found');
    END IF;

    -- Get allowed models with details (from model_access table)
    SELECT jsonb_agg(
        jsonb_build_object(
            'model_id', model_id,
            'model_name', model_name,
            'model_description', model_description,
            'model_tags', model_tags,
            'daily_limit', daily_limit,
            'monthly_limit', monthly_limit
        )
    ) INTO allowed_models_data
    FROM public.get_user_allowed_models(user_uuid);

    -- Get today's usage data specifically
    SELECT jsonb_build_object(
        'messages_sent', COALESCE(messages_sent, 0),
        'messages_received', COALESCE(messages_received, 0),
        'total_tokens', COALESCE(total_tokens, 0),
        'input_tokens', COALESCE(input_tokens, 0),
        'output_tokens', COALESCE(output_tokens, 0),
        'models_used', COALESCE(models_used, '{}'::jsonb),
        'sessions_created', COALESCE(sessions_created, 0),
        'active_minutes', COALESCE(active_minutes, 0)
    ) INTO today_usage_data
    FROM public.user_usage_daily
    WHERE user_id = user_uuid
    AND usage_date = CURRENT_DATE;

    -- If no data for today, return zeros
    IF today_usage_data IS NULL THEN
        today_usage_data := jsonb_build_object(
            'messages_sent', 0,
            'messages_received', 0,
            'total_tokens', 0,
            'input_tokens', 0,
            'output_tokens', 0,
            'models_used', '{}'::jsonb,
            'sessions_created', 0,
            'active_minutes', 0
        );
    END IF;

    -- Get recent usage stats (last 7 days for backwards compatibility)
    SELECT jsonb_build_object(
        'recent_days', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'usage_date', usage_date,
                    'messages_sent', messages_sent,
                    'messages_received', messages_received,
                    'total_tokens', total_tokens,
                    'models_used', models_used,
                    'sessions_created', sessions_created,
                    'active_minutes', active_minutes
                ) ORDER BY usage_date DESC
            )
            FROM public.user_usage_daily
            WHERE user_id = user_uuid
            AND usage_date >= CURRENT_DATE - INTERVAL '7 days'
        ),
        'today', today_usage_data,
        'all_time', profile_data.usage_stats
    ) INTO usage_stats_data;

    -- Return complete profile with enhanced analytics
    RETURN jsonb_build_object(
        'id', profile_data.id,
        'email', profile_data.email,
        'full_name', profile_data.full_name,
        'avatar_url', profile_data.avatar_url,
        'subscription_tier', profile_data.subscription_tier,
        'credits', profile_data.credits,
        'preferences', jsonb_build_object(
            'model', jsonb_build_object(
                'default_model', profile_data.default_model,
                'temperature', profile_data.temperature,
                'system_prompt', profile_data.system_prompt
            ),
            'ui', profile_data.ui_preferences,
            'session', profile_data.session_preferences
        ),
        'available_models', allowed_models_data,
        'usage_stats', usage_stats_data,
        'timestamps', jsonb_build_object(
            'created_at', profile_data.created_at,
            'updated_at', profile_data.updated_at,
            'last_active', profile_data.last_active
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================
-- Run these queries to verify the function enhancement:
--
-- 1. Test the enhanced function:
-- SELECT public.get_user_complete_profile('your-user-uuid-here');
--
-- 2. Verify today's data structure:
-- SELECT (public.get_user_complete_profile('your-user-uuid-here'))->'usage_stats'->'today';
--
-- 3. Check backwards compatibility:
-- SELECT (public.get_user_complete_profile('your-user-uuid-here'))->'usage_stats'->'recent_days';
-- =============================================================================
```

### Frontend Service Implementation

File: `/lib/services/user-data.ts`

```typescript
import { UserDataResponse, UserPreferencesUpdate } from "@/lib/types/user-data";

// Note: Import auth token function from existing auth utilities
// import { getAuthToken } from '@/lib/auth/utils'; // or wherever it's defined

export async function fetchUserData(): Promise<UserDataResponse> {
  const response = await fetch("/api/user/data", {
    headers: {
      Authorization: `Bearer ${await getAuthToken()}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch user data");
  }

  return response.json();
}

export async function updateUserPreferences(
  preferences: UserPreferencesUpdate
): Promise<UserDataResponse> {
  const response = await fetch("/api/user/data", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await getAuthToken()}`,
    },
    body: JSON.stringify(preferences),
  });

  if (!response.ok) {
    throw new Error("Failed to update preferences");
  }

  return response.json();
}
```

**Required Dependencies:**

- Ensure `getAuthToken()` function exists or create it following existing auth patterns
- Import correct types from the created type definitions file

### Component Integration

The UserSettings component will be updated to:

1. Use `useUserData()` hook for comprehensive data fetching
2. Display loading states during data fetch
3. Show real analytics instead of dummy data
4. Handle error states gracefully
5. Allow preference editing with backend persistence via unified API

## Data Flow

1. **Settings Icon Click** → UserSettings modal opens
2. **Component Mount** → `useUserData()` hook triggers
3. **API Call** → `/api/user/data` fetched with authentication
4. **Database Query** → `public.get_user_complete_profile(user_uuid)` function called
5. **Data Processing** → Function queries multiple tables and views internally
6. **Data Display** → Real metrics extracted from function response and shown in UI
7. **Preference Edit** → API call to `/api/user/data` (PUT) with updates
8. **Database Update** → Preference fields updated in `profiles` table
9. **UI Refresh** → Component shows updated preferences

## Success Criteria

- [ ] UserSettings component shows real data instead of dummy data
- [ ] Today's usage accurately reflects current day's activity
- [ ] All-time statistics show cumulative usage correctly
- [ ] Session counter works properly for new sessions
- [ ] User can edit and persist preferences
- [ ] Loading and error states work properly
- [ ] API endpoints are properly authenticated
- [ ] Database migration runs successfully
- [ ] All components are documented
- [ ] Tests pass for new functionality

## Critical Implementation Notes for AGENT

### File Locations to Identify:

1. **UserSettings Component**: Search for files containing "UserSettings" or "Settings" in `/components/` directory
2. **Auth Utilities**: Look for existing auth token functions in `/lib/auth/` or `/lib/supabase/`
3. **Existing API Routes**: Check `/src/app/api/` for authentication patterns to follow
4. **Type Definitions**: Review existing patterns in `/lib/types/` directory

### Authentication Implementation:

- Use existing Supabase client patterns from other API routes
- Extract user ID from JWT token using project's existing auth middleware
- Follow error handling patterns from existing authenticated endpoints

### Database Integration:

- Use Supabase RPC call: `supabase.rpc('get_user_complete_profile', { user_uuid: userId })`
- Handle case where function returns `{error: "User not found"}`
- Transform database JSONB response to match TypeScript interfaces

### Component Integration Requirements:

- Maintain existing UserSettings modal behavior and styling
- Replace hardcoded analytics values with real data from hook
- Add loading states that match existing UI patterns
- Preserve existing preference editing functionality while enhancing it

### Testing Requirements:

- Verify API endpoint works with valid JWT token
- Test preference updates persist correctly
- Confirm error handling displays appropriate user messages
- Validate that analytics data updates reflect real usage

## Files to Document

### `/docs/api/`

- `user-data-endpoint.md` - Unified user data API documentation

### `/docs/components/`

- Update existing `UserSettings.md` with new functionality
- `user-data-integration.md` - Technical implementation guide

### Code Comments

- API route files: Document authentication, error handling, data sources
- Service files: Document data flow, error cases, caching strategy
- Component files: Document props, state management, user interactions
- Database functions: Document the fix for sessions_created counter

This plan ensures systematic implementation of real analytics data in UserSettings while maintaining code quality, documentation, and user experience standards.
