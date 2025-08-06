# UserSettings

## Purpose

- Modal panel displaying user profile, preferences, and usage metrics.
- **UPDATED**: Now pulls real user data from authentication session via auth store.
- **FIXED**: Previously used placeholder data, now shows actual signed-in user information.

## Props

| Prop      | Type         | Required? | Description                          |
| --------- | ------------ | --------- | ------------------------------------ |
| `isOpen`  | `boolean`    | Yes       | Whether the modal is visible.        |
| `onClose` | `() => void` | Yes       | Callback invoked to close the modal. |

## Current Data Sources

- **Profile**: Shows real email and name from Google OAuth session via `useAuth` hook from auth store
- **Preferences**: Shows default values (TODO: connect to user preferences from database)
- **Analytics**: Displays dummy usage numbers (TODO: connect to `user_usage_daily` table)

## Sections

- **Profile:** Shows email, display name, and subscription tier.
- **Preferences:** Shows theme and default model selections.
- **Analytics:** Displays usage numbers for messages and tokens.

## Event Handlers

- `onClose` — closes the modal when background or Close button is clicked.

## Usage Locations

- Triggered from `ChatSidebar` via the settings icon.

## Implementation Status

✅ **COMPLETED**: Real user session data integration  
🔄 **TODO**: Database profile preferences integration  
🔄 **TODO**: Real usage analytics from database  
🔄 **TODO**: Subscription tier from user profile

## Technical Notes

- Uses Zustand auth store (`stores/useAuthStore`) for session data
- Handles loading states during auth initialization
- Compatible with SSR (no hydration issues)
- All tests passing after recent fixes
