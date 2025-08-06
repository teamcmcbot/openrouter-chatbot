# User Data Analytics Architecture

## Overview

This document outlines the architecture for the user data analytics system that powers the UserSettings component. The system provides real-time usage statistics, profile management, and preference persistence through a unified API and enhanced database functions.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Frontend Layer                         │
├─────────────────────────────────────────────────────────────────┤
│  UserSettings Component                                         │
│  ├── useUserData Hook                                           │
│  ├── UserData Service                                           │
│  └── TypeScript Interfaces                                      │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP/JSON
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                          API Layer                              │
├─────────────────────────────────────────────────────────────────┤
│  /api/user/data (GET/PUT)                                       │
│  ├── JWT Authentication                                         │
│  ├── Request Validation                                         │
│  ├── Error Handling                                             │
│  └── Data Transformation                                        │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Supabase RPC
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Database Layer                           │
├─────────────────────────────────────────────────────────────────┤
│  get_user_complete_profile() Function                           │
│  ├── profiles table                                             │
│  ├── user_usage_daily table                                     │
│  ├── model_access table                                         │
│  └── get_user_allowed_models() function                         │
└─────────────────────────────────────────────────────────────────┘
```

## Component Architecture

### Frontend Components

#### UserSettings Component

**Location**: `/components/ui/UserSettings.tsx`

**Responsibilities**:

- Renders modal dialog with user data
- Manages UI state and user interactions
- Handles loading and error states
- Provides preference editing interface

**Key Features**:

- Conditional data fetching (only when modal is open)
- Optimistic updates for better UX
- Real-time error handling
- Responsive design for mobile/desktop

#### useUserData Hook

**Location**: `/hooks/useUserData.ts`

**Responsibilities**:

- Manages data fetching lifecycle
- Provides loading/error states
- Handles data caching and refresh
- Exposes preference update functionality

**State Management**:

```typescript
interface UseUserDataReturn {
  data: UserDataResponse | null;
  loading: boolean;
  error: string | null;
  refetch: (forceRefresh?: boolean) => Promise<void>;
  updatePreferences: (prefs: UserPreferencesUpdate) => Promise<void>;
}
```

#### UserData Service

**Location**: `/lib/services/user-data.ts`

**Responsibilities**:

- Abstracts API communication
- Handles request/response transformation
- Provides client-side validation
- Manages error processing

**Key Functions**:

- `fetchUserData()`: Retrieves complete user data
- `updateUserPreferences()`: Updates user preferences
- `validatePreferences()`: Client-side validation

### API Layer

#### Unified User Data Endpoint

**Location**: `/src/app/api/user/data/route.ts`

**GET /api/user/data**:

- Authenticates user via JWT token
- Calls enhanced database function
- Transforms data to frontend format
- Returns structured JSON response

**PUT /api/user/data**:

- Validates preference update data
- Updates database preference fields
- Returns updated user data
- Handles validation errors

**Authentication Flow**:

```typescript
const {
  data: { user },
  error,
} = await supabase.auth.getUser();
if (error || !user) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

### Database Layer

#### Enhanced Database Function

**Location**: `/database/patches/user-settings-analytics/01-enhance-user-profile-function.sql`

**get_user_complete_profile(user_uuid)**:

- Aggregates data from multiple tables
- Provides clean "today" analytics
- Maintains backwards compatibility
- Optimizes query performance

**Data Sources**:

- `profiles`: Core user information and preferences
- `user_usage_daily`: Daily usage metrics
- `model_access`: Available models by tier
- `usage_stats`: All-time cumulative statistics

## Data Flow

### 1. Component Initialization

```typescript
// UserSettings component mounts
const { data, loading, error, refetch } = useUserData(isOpen);

// Hook triggers data fetch when modal opens
useEffect(() => {
  if (isOpen && !data) {
    fetchData();
  }
}, [isOpen, data]);
```

### 2. Data Fetching Process

```typescript
// Service layer makes API call
const response = await fetch('/api/user/data');

// API layer authenticates and queries database
const { data: profileData } = await supabase
  .rpc('get_user_complete_profile', { user_uuid: user.id });

// Database function aggregates data
SELECT
  profiles.*,
  today_usage,
  allowed_models
FROM profiles
LEFT JOIN user_usage_daily ON ...
```

### 3. Data Transformation

```typescript
// API transforms database response to frontend format
const response: UserDataResponse = {
  today: profileData.usage_stats?.today || {},
  allTime: profileData.usage_stats?.all_time || {},
  profile: { email: profileData.email, ... },
  preferences: { ui: profileData.ui_preferences, ... }
};
```

### 4. Preference Updates

```typescript
// User modifies preferences in UI
const updatePreferences = async (newPrefs) => {
  // Optimistic update
  setData((prev) => ({
    ...prev,
    preferences: { ...prev.preferences, ...newPrefs },
  }));

  try {
    // API call to persist changes
    const updated = await updateUserPreferences(newPrefs);
    setData(updated);
  } catch (error) {
    // Revert on error
    setData(originalData);
    throw error;
  }
};
```

## Type System

### Core Data Types

**Location**: `/lib/types/user-data.ts`

```typescript
interface UserDataResponse {
  today: TodayUsage; // Current day analytics
  allTime: AllTimeUsage; // Cumulative statistics
  profile: UserProfileData; // Basic profile info
  preferences: UserPreferences; // User settings
  availableModels: AvailableModel[]; // Tier-based model access
  timestamps: UserTimestamps; // Account dates
}
```

### Type Safety Features

- **Strict TypeScript**: All interfaces properly typed
- **Runtime Validation**: Server-side data validation
- **Error Types**: Structured error response types
- **Optional Fields**: Proper handling of optional data

## Security Architecture

### Authentication

- **JWT Tokens**: Supabase-managed authentication
- **Row Level Security**: Database-enforced access control
- **Session Management**: Automatic token refresh

### Authorization

- **User Isolation**: Users can only access their own data
- **Tier-based Access**: Model access based on subscription
- **API Rate Limiting**: Prevents abuse and overuse

### Data Protection

- **Input Validation**: Both client and server-side validation
- **SQL Injection Prevention**: Parameterized queries
- **XSS Protection**: Proper data sanitization

## Performance Optimizations

### Frontend Optimizations

1. **Conditional Loading**: Only fetch data when needed
2. **Request Deduplication**: Prevent multiple simultaneous requests
3. **Optimistic Updates**: Immediate UI feedback
4. **Component Memoization**: Prevent unnecessary re-renders

### Backend Optimizations

1. **Database Function**: Single query for all data
2. **Indexed Queries**: Optimized database indexes
3. **Caching Strategy**: Appropriate cache headers
4. **Connection Pooling**: Efficient database connections

### Database Optimizations

1. **JSONB Storage**: Efficient preference storage
2. **Materialized Views**: Pre-computed analytics
3. **Proper Indexing**: Fast query execution
4. **Query Optimization**: Efficient JOIN operations

## Error Handling Strategy

### Frontend Error Handling

```typescript
interface ErrorState {
  message: string;
  type: "network" | "validation" | "server" | "auth";
  retryable: boolean;
  details?: any;
}
```

### API Error Responses

- **401 Unauthorized**: Authentication required
- **403 Forbidden**: Access denied
- **404 Not Found**: User profile missing
- **422 Validation Error**: Invalid input data
- **500 Server Error**: Internal server issue

### Recovery Mechanisms

1. **Automatic Retry**: For transient network errors
2. **Graceful Degradation**: Show cached data when possible
3. **User Feedback**: Clear error messages and actions
4. **Fallback States**: Default values for missing data

## Monitoring and Observability

### Metrics to Track

1. **API Performance**: Response times and success rates
2. **User Engagement**: Settings usage patterns
3. **Error Rates**: Frequency and types of errors
4. **Data Accuracy**: Validation of analytics data

### Logging Strategy

1. **Structured Logging**: JSON format for easy parsing
2. **Error Tracking**: Comprehensive error capture
3. **Performance Monitoring**: Response time tracking
4. **User Actions**: Audit trail for preference changes

## Scalability Considerations

### Current Limitations

- Single database instance
- Synchronous API calls
- No real-time updates

### Future Scalability

1. **Database Scaling**: Read replicas and sharding
2. **API Scaling**: Load balancing and caching
3. **Real-time Features**: WebSocket integration
4. **Microservices**: Separate analytics service

## Deployment Architecture

### Environment Setup

1. **Development**: Local Supabase instance
2. **Staging**: Shared staging environment
3. **Production**: Fully managed Supabase

### Deployment Process

1. **Database Migration**: Apply schema changes
2. **API Deployment**: Deploy Next.js application
3. **Frontend Build**: Static asset generation
4. **Testing**: Comprehensive integration tests

### Configuration Management

- **Environment Variables**: Database connections and API keys
- **Feature Flags**: Gradual feature rollout
- **Monitoring Setup**: Error tracking and analytics

This architecture provides a robust, scalable foundation for user data analytics while maintaining security, performance, and maintainability standards.
