# User Data Integration Technical Guide

## Overview

This technical guide documents the implementation of real database analytics integration in the UserSettings component, covering the complete data flow from database to frontend UI.

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   Frontend      │    │   API Layer      │    │   Database Layer    │
│   Components    │    │                  │    │                     │
├─────────────────┤    ├──────────────────┤    ├─────────────────────┤
│ UserSettings    │───▶│ /api/user/data   │───▶│ get_user_complete_  │
│ Component       │    │ (GET/PUT)        │    │ profile()           │
│                 │    │                  │    │                     │
│ useUserData     │    │ Authentication   │    │ user_usage_daily    │
│ Hook            │    │ Validation       │    │ profiles            │
│                 │    │ Error Handling   │    │ model_access        │
│ UserData        │    │                  │    │                     │
│ Service         │    │                  │    │                     │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
```

## Data Flow Implementation

### 1. Component Initialization

```typescript
// UserSettings.tsx
export function UserSettings({ isOpen, onClose }: UserSettingsProps) {
  const { user, isLoading: authLoading } = useAuth();
  const {
    data: userData,
    loading,
    error,
    refetch,
    updatePreferences,
  } = useUserData(isOpen); // Only fetch when modal is open

  // Conditional rendering based on data state
  if (authLoading || loading) return <LoadingSpinner />;
  if (error) return <ErrorState onRetry={refetch} />;
  if (!userData) return <EmptyState />;

  return <UserDataDisplay data={userData} />;
}
```

### 2. Data Fetching Hook

```typescript
// hooks/useUserData.ts
export function useUserData(shouldFetch: boolean = true) {
  const [data, setData] = useState<UserDataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const fetchData = useCallback(
    async (forceRefresh = false) => {
      if (!user || !shouldFetch) return;

      setLoading(true);
      setError(null);

      try {
        const userData = await fetchUserData();
        setData(userData);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch user data"
        );
      } finally {
        setLoading(false);
      }
    },
    [user, shouldFetch]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData, updatePreferences };
}
```

### 3. API Service Layer

```typescript
// lib/services/user-data.ts
export async function fetchUserData(): Promise<UserDataResponse> {
  const response = await fetch("/api/user/data", {
    headers: {
      Authorization: `Bearer ${await getAuthToken()}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user data: ${response.status}`);
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
    throw new Error(`Failed to update preferences: ${response.status}`);
  }

  return response.json();
}
```

### 4. API Route Implementation

```typescript
// src/app/api/user/data/route.ts
export async function GET(): Promise<
  NextResponse<UserDataResponse | UserDataError>
> {
  try {
    const supabase = await createClient();

    // Authenticate user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Invalid or missing token" },
        { status: 401 }
      );
    }

    // Call enhanced database function
    const { data: profileData, error: profileError } = await supabase.rpc(
      "get_user_complete_profile",
      { user_uuid: user.id }
    );

    if (profileError) {
      console.error("Database error:", profileError);
      return NextResponse.json(
        {
          error: "Internal server error",
          message: "Database connection failed",
        },
        { status: 500 }
      );
    }

    // Transform data to API response format
    const response: UserDataResponse = {
      today: {
        messages_sent: profileData.usage_stats?.today?.messages_sent || 0,
        messages_received:
          profileData.usage_stats?.today?.messages_received || 0,
        total_tokens: profileData.usage_stats?.today?.total_tokens || 0,
        // ... other today fields
      },
      allTime: {
        total_messages: profileData.usage_stats?.all_time?.total_messages || 0,
        total_tokens: profileData.usage_stats?.all_time?.total_tokens || 0,
        // ... other all-time fields
      },
      // ... profile, preferences, timestamps
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: "Unexpected server error" },
      { status: 500 }
    );
  }
}
```

### 5. Database Function Enhancement

```sql
-- Enhanced get_user_complete_profile function
CREATE OR REPLACE FUNCTION public.get_user_complete_profile(user_uuid UUID)
RETURNS JSONB AS $$
DECLARE
    profile_data RECORD;
    today_usage_data JSONB;
    usage_stats_data JSONB;
BEGIN
    -- Get main profile data
    SELECT * INTO profile_data FROM public.profiles WHERE id = user_uuid;

    -- Get today's specific usage data
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
    WHERE user_id = user_uuid AND usage_date = CURRENT_DATE;

    -- Return complete profile with enhanced analytics
    RETURN jsonb_build_object(
        'usage_stats', jsonb_build_object(
            'today', COALESCE(today_usage_data, '{}'::jsonb),
            'all_time', profile_data.usage_stats
        ),
        -- ... other profile fields
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Type System Implementation

### Core Data Types

```typescript
// lib/types/user-data.ts
export interface UserDataResponse {
  today: TodayUsage;
  allTime: AllTimeUsage;
  profile: UserProfileData;
  preferences: UserPreferences;
  availableModels: AvailableModel[];
  timestamps: UserTimestamps;
}

export interface TodayUsage {
  messages_sent: number;
  messages_received: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  models_used: Record<string, number>;
  sessions_created: number;
  active_minutes: number;
}

export interface UserPreferencesUpdate {
  ui?: Record<string, any>;
  session?: Record<string, any>;
  model?: {
    default_model?: string;
    temperature?: number;
    system_prompt?: string;
  };
}
```

## Performance Optimizations

### 1. Conditional Data Fetching

```typescript
// Only fetch data when modal is open
const { data, loading, error } = useUserData(isOpen);
```

### 2. Request Deduplication

Update (Aug 2025): Cross-instance dedupe is now built into `useUserData`.

Key changes

- `hooks/useUserData.ts` maintains a module-level cache and in-flight map keyed by `userId` (via `globalThis`) to coalesce concurrent requests across components.
- `forceRefresh()` bypasses cache but still shares the same in-flight promise to avoid double-calling when multiple triggers occur simultaneously (e.g., modal open + manual refresh).
- `components/system/ThemeInitializer.tsx` now consumes `useUserData` instead of calling the service directly, so all components share a single GET on page load.

Implications

- On `/chat` load, ThemeInitializer, ChatInterface, and MessageInput all read from the same `useUserData` source: only one GET `/api/user/data` is executed.
- Opening User Settings triggers a fresh fetch once; overlapping triggers dedupe.

Testing

- See `tests/hooks/useUserData.dedupe.test.tsx` for unit coverage: concurrent mounts → one GET; overlapping refresh → one GET; subsequent force refresh → new GET.

### 3. Optimistic Updates

```typescript
const updatePreferences = useCallback(
  async (newPrefs: UserPreferencesUpdate) => {
    // Optimistically update UI
    setData((prev) =>
      prev
        ? {
            ...prev,
            preferences: { ...prev.preferences, ...newPrefs },
          }
        : null
    );

    try {
      const updatedData = await updateUserPreferences(newPrefs);
      setData(updatedData);
    } catch (error) {
      // Revert optimistic update on error
      setData(originalData);
      throw error;
    }
  },
  []
);
```

## Error Handling Strategy

### 1. API Error Handling

```typescript
// Structured error responses
interface UserDataError {
  error: string;
  message: string;
  details?: Record<string, any>;
}

// Client-side error processing
const handleError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "An unexpected error occurred";
};
```

### 2. Network Error Recovery

```typescript
// Retry mechanism with exponential backoff
const fetchWithRetry = async (retries = 3): Promise<UserDataResponse> => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchUserData();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, i) * 1000)
      );
    }
  }
  throw new Error("Max retries exceeded");
};
```

### 3. Validation Error Handling

```typescript
// Preference validation
const validatePreferences = (prefs: UserPreferencesUpdate): string[] => {
  const errors: string[] = [];

  if (
    prefs.model?.temperature &&
    (prefs.model.temperature < 0 || prefs.model.temperature > 2)
  ) {
    errors.push("Temperature must be between 0 and 2");
  }

  if (
    prefs.model?.default_model &&
    !availableModels.includes(prefs.model.default_model)
  ) {
    errors.push("Selected model is not available");
  }

  return errors;
};
```

## Security Implementation

### 1. Authentication Validation

```typescript
// Token-based authentication
const getAuthToken = async (): Promise<string> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("User not authenticated");
  }
  return session.access_token;
};
```

### 2. Input Sanitization

```typescript
// Sanitize user input before API calls
const sanitizePreferences = (
  prefs: UserPreferencesUpdate
): UserPreferencesUpdate => {
  return {
    ui: prefs.ui ? sanitizeObject(prefs.ui) : undefined,
    session: prefs.session ? sanitizeObject(prefs.session) : undefined,
    model: prefs.model
      ? {
          default_model: sanitizeString(prefs.model.default_model),
          temperature: sanitizeNumber(prefs.model.temperature),
          system_prompt: sanitizeString(prefs.model.system_prompt),
        }
      : undefined,
  };
};
```

### 3. Database Security

```sql
-- Row Level Security (RLS) policies
CREATE POLICY "Users can only access their own data" ON profiles
FOR ALL USING (auth.uid() = id);

-- Function security
CREATE OR REPLACE FUNCTION get_user_complete_profile(user_uuid UUID)
-- ... SECURITY DEFINER ensures proper permissions
```

## Testing Strategy

### 1. Unit Tests

```typescript
// Component testing
describe("UserSettings", () => {
  test("displays loading state initially", () => {
    render(<UserSettings isOpen={true} onClose={jest.fn()} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  test("displays user data when loaded", async () => {
    mockUserData(sampleUserData);
    render(<UserSettings isOpen={true} onClose={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Messages sent today: 5")).toBeInTheDocument();
    });
  });
});
```

### 2. Integration Tests

```typescript
// API endpoint testing
describe("/api/user/data", () => {
  test("returns user data for authenticated user", async () => {
    const response = await request(app)
      .get("/api/user/data")
      .set("Authorization", `Bearer ${validToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      today: expect.objectContaining({
        messages_sent: expect.any(Number),
        total_tokens: expect.any(Number),
      }),
      profile: expect.objectContaining({
        email: expect.any(String),
      }),
    });
  });
});
```

### 3. Database Tests

```sql
-- Test enhanced database function
SELECT get_user_complete_profile('test-user-uuid');
-- Verify structure and data accuracy
```

## Monitoring and Observability

### 1. Error Tracking

```typescript
// Error reporting
const reportError = (error: Error, context: Record<string, any>) => {
  console.error("User data error:", error, context);
  // Send to error tracking service (e.g., Sentry)
};
```

### 2. Performance Monitoring

```typescript
// Track API response times
const trackAPICall = async (operation: string, fn: () => Promise<any>) => {
  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;
    console.log(`${operation} completed in ${duration}ms`);
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    console.error(`${operation} failed after ${duration}ms:`, error);
    throw error;
  }
};
```

### 3. Usage Analytics

```typescript
// Track user interactions
const trackUserAction = (action: string, metadata?: Record<string, any>) => {
  // Analytics tracking
  console.log(`User action: ${action}`, metadata);
};
```

## Deployment Considerations

### 1. Database Migration

```bash
# Apply enhanced function
psql -d production -f database/patches/user-settings-analytics/01-enhance-user-profile-function.sql

# Verify function works correctly
psql -d production -c "SELECT get_user_complete_profile('sample-user-id');"
```

### 2. Feature Flags

```typescript
// Gradual rollout capability
const useRealAnalytics = useFeatureFlag("real-analytics-enabled");

if (useRealAnalytics) {
  // Use new implementation
} else {
  // Fall back to previous implementation
}
```

### 3. Backward Compatibility

```typescript
// Ensure API maintains backward compatibility
const legacyResponse = (data: UserDataResponse) => ({
  // Legacy format for older clients
  messages_today: data.today.messages_sent,
  tokens_today: data.today.total_tokens,
  // ... other legacy fields
});
```

## Troubleshooting Guide

### Common Issues

1. **Authentication Errors**

   - Check JWT token validity
   - Verify Supabase client configuration
   - Ensure proper authentication headers

2. **Database Connection Issues**

   - Verify database function exists
   - Check RLS policies
   - Confirm user has proper permissions

3. **Data Loading Issues**

   - Check network connectivity
   - Verify API endpoint availability
   - Review error logs for specific failures

4. **Performance Issues**
   - Monitor API response times
   - Check for excessive re-renders
   - Verify conditional fetching is working

### Debug Tools

```typescript
// Enable debug logging
const DEBUG = process.env.NODE_ENV === "development";

const debugLog = (message: string, data?: any) => {
  if (DEBUG) {
    console.log(`[UserData Debug] ${message}`, data);
  }
};
```

This technical guide provides comprehensive documentation for the user data integration implementation, covering all aspects from frontend components to database functions.
