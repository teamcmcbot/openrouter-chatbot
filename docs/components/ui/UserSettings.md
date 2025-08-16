# UserSettings Component

## Overview

The UserSettings component is a modal dialog that displays comprehensive user information including profile data, usage analytics, preferences, and subscription details. This component has been enhanced to integrate with real database analytics, replacing previous dummy data with actual user statistics.

## Purpose

- **Profile Display**: Shows authenticated user's email, name, avatar, and subscription tier
- **Usage Analytics**: Displays real-time usage statistics including today's activity and all-time totals
- **Preferences Management**: Allows users to view and edit UI, session, and model preferences
- **Settings Configuration**: Provides interface for model selection, temperature adjustment, and system prompts

## Props

| Prop      | Type         | Required? | Description                          |
| --------- | ------------ | --------- | ------------------------------------ |
| `isOpen`  | `boolean`    | Yes       | Whether the modal is visible.        |
| `onClose` | `() => void` | Yes       | Callback invoked to close the modal. |

## Data Sources

### Real-time Integration ✅

The component now integrates with actual database analytics through:

- **API Integration**: Uses `/api/user/data` unified endpoint
- **Authentication**: Authenticated via Zustand auth store (`useAuth`)
- **Data Hook**: Implements `useUserData` custom hook for data management
- **Service Layer**: Uses `fetchUserData()` and `updateUserPreferences()` services

### Analytics Data Sources

- **Today's Usage**: Real data from `user_usage_daily` table for current date
- **All-time Statistics**: Cumulative data from `profiles.usage_stats`
- **Profile Information**: Live data from `profiles` table via enhanced database function
- **User Preferences**: Real preferences from database JSONB fields

## Component Sections

### 1. Profile Section

- **Email**: User's authenticated email address
- **Full Name**: Display name from Google OAuth or manual profile
- **Avatar**: Profile picture from OAuth provider
- **Subscription Tier**: Current subscription level (free, pro, enterprise)
- **Credits**: Available credits for premium features

### 2. Analytics Section ✅ ENHANCED

- **Messages Sent Today**: Real count from current day's activity
- **Tokens Used Today**: Actual token consumption for current date
- **Total Messages (All-time)**: Cumulative message count across all sessions
- **Total Tokens (All-time)**: Cumulative token usage since account creation
- **Session Analytics**: Sessions created today and total
- **Model Usage**: Breakdown of models used with counts
- **Refresh Capability**: Manual refresh of analytics data

### 3. Preferences Section ✅ ENHANCED

- **UI Preferences**: Theme selection, language settings
- **Session Preferences**: Auto-save, history limits, session management
- **Model Settings**:
  - Default model selection with "None" option for automatic selection
  - Availability indicators for unavailable models (shows "(Not available)")
  - Temperature slider for response creativity control
  - System prompt configuration
- **Persistence**: Real-time saving to database with validation including null default model support
- **Error Handling**: User-friendly error messages for failed updates

#### System Prompt Editor UX

- Inline textarea appears under Temperature when Edit mode is active
- Real-time validation mirrors server rules (authoritative on server)
- Character counter and word count with color-coded warnings at 80%/90%
- Prevents typing beyond 2000 characters; smart paste truncates and warns via toast
  - See Toaster behavior and positioning: `docs/components/ui/Toaster.md`
- Save disabled when invalid or empty; input is trimmed before save
- Success: green toast + preview update + exit edit mode
  - Toasts are centered in the chat header when on `/chat`; details in `docs/components/ui/Toaster.md`
- Failure: red toast + revert to last known good + stay in edit mode
  - Positioning follows global Toaster rules; see `docs/components/ui/Toaster.md`
- Accessibility: `aria-invalid` and `aria-describedby` for error/help text

#### System Prompt Preview

- Read-only preview uses word-boundary truncation at ~200 characters for readability

### 4. Available Models Section

- **Model List**: Dynamic list based on subscription tier
- **Access Control**: Tier-based model availability
- **Rate Limits**: Daily and monthly usage limits per model
- **Model Information**: Descriptions, tags, and capabilities

## State Management

### Data Loading States

- **Loading**: Shows loading spinner while fetching user data
- **Error State**: Displays error message with retry option
- **Success State**: Shows populated data with all sections
- **Refresh State**: Handles manual data refresh requests

### Preference Update States

- **Editing**: Form controls for preference modification
- **Saving**: Loading state during preference updates
- **Success**: Confirmation of successful saves
- **Validation Errors**: Field-specific error messages

## Event Handlers

### Modal Controls

- `onClose` — Closes the modal when background or Close button is clicked
- `onRefresh` — Manually refreshes analytics data from database

### Preference Updates

- `onPreferenceChange` — Handles form input changes for preferences
- `onSave` — Persists preference changes to database
- `onCancel` — Reverts unsaved preference changes

## Usage Locations

- **Chat Sidebar**: Triggered via the settings/profile icon
- **Navigation**: Accessible from main navigation menu
- **Keyboard Shortcut**: Can be opened via keyboard shortcuts (if implemented)

## Implementation Status

### ✅ COMPLETED Features

- **Real User Data Integration**: Pulls actual user profile from authentication session
- **Live Analytics**: Displays real usage statistics from database
- **Database Preferences**: Reads and writes user preferences to/from database
- **Null Default Model Support**: Handles null/empty default models with "None" option
- **Model Availability Indicators**: Shows "(Not available)" for inaccessible default models
- **API Integration**: Uses unified `/api/user/data` endpoint with null value support
- **Error Handling**: Comprehensive error states and retry mechanisms
- **Loading States**: Proper loading indicators during data fetch/update
- **Type Safety**: Full TypeScript integration with proper interfaces including string | null support
- **Authentication**: Secure access via JWT token validation

### 🔄 ENHANCEMENT OPPORTUNITIES

- **Data Visualization**: Charts and graphs for usage trends
- **Export Functionality**: Download usage data and settings backup
- **Advanced Preferences**: More granular preference controls
- **Real-time Updates**: Live updates when preferences change in other sessions

## Technical Implementation

### Dependencies

```typescript
import { useAuth } from "../../stores/useAuthStore";
import { useUserData } from "../../hooks/useUserData";
import { UserDataResponse } from "../../lib/types/user-data";
```

### Key Hooks Used

- **`useAuth()`**: Authentication state from Zustand store
- **`useUserData()`**: Custom hook for user data fetching and updates
- **`useState()`**: Local state for form controls and UI state
- **`useCallback()`**: Optimized event handlers

### API Integration

```typescript
// Data fetching
const { data, loading, error, refetch, updatePreferences } = useUserData();

// Preference updates
await updatePreferences({
  ui: { theme: "dark" },
  model: { temperature: 0.8 },
});
```

## Technical Notes

- Uses Zustand auth store (`stores/useAuthStore`) for session data
- Handles loading states during auth initialization
- Compatible with SSR (no hydration issues)
- All tests passing after recent fixes
- Implements optimized state management to prevent multiple API calls
- Uses conditional fetching to only load data when modal is open

## Related

- API: `/docs/api/user-data-endpoint.md` (includes system prompt validation and examples)
- Validation: `lib/utils/validation/systemPrompt.ts`
