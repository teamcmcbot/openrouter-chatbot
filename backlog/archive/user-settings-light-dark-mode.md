# User Settings: Light/Dark Mode

## Overview

You can select light/dark/system mode themes in user settings, this saved to DB but does not do anything or trigger a theme change in the UI.

On User Settings when the theme is changed, it should update the UI immediately without requiring a page refresh.

On Sign-in, the user's theme preference should be fetched from the DB and applied to the UI.

## useUIStore & localStorage

Please check the current implementation and usage of useUIStore.

The key used to store the user's theme preference in localStorage is `openrouter-ui-preferences`. Please check current implementation and how is it used.

---

## Initial Analysis & Implementation Context (2025-08-14)

### Current State in Codebase

- No global theme context/provider in `/contexts/`.
- Theme preference is saved in localStorage (`openrouter-ui-preferences`) via `/stores/useUIStore`, but not applied to UI dynamically.
- No theme toggle in user settings UI (preference is saved, but does not trigger UI change).
- No API endpoint for persisting theme preference to Supabase.
- On sign-in, theme preference is not fetched/applied from DB.

### Existing Related Code

- `useLocalStorage.ts` in `/hooks/` can be reused for local theme persistence.
- `useUserData.ts` in `/hooks/` manages user profile data, could be extended for theme preference.
- `/stores/useUIStore` manages UI state, including theme preference in localStorage.
- Supabase integration for user profile exists, but theme field not present in schema.

### Dependencies & Patterns

- Modular React/Next.js structure.
- Supabase for user data, hooks and stores for state.
- No third-party theme libraries detected; custom implementation likely required.

---

## Next Steps

- Add global theme context/provider.
- Add theme preference to user profile schema in Supabase.
- Implement UI toggle for light/dark mode in settings.
- Persist preference locally and remotely.
- Update UI components to support dynamic theming.

---

## Theme Preference Update & Sign-In Flow Context (2025-08-14)

### 1. UserSettings Edit Preference: Theme Update

- In `components/ui/UserSettings.tsx`, theme is edited via a dropdown in Preferences.
- On save, `updatePreferences` from `useUserData` is called:
  ```typescript
  await updatePreferences({
    ui: { theme: editedPreferences.theme },
    // ...other preferences
  });
  ```
- This triggers a PUT to `/api/user/data` via `lib/services/user-data.ts:updateUserPreferences`.
- Backend updates `ui_preferences` JSONB field in `profiles` table (Supabase), specifically the `"theme"` key.
- API endpoint `/api/user/data` (protected by auth middleware) persists changes.

### 2. Sign-In Flow: Theme Retrieval

- On sign-in, `useUserData` calls `fetchUserData()` (GET `/api/user/data`).
- Response includes preferences, e.g. `userData.preferences.ui.theme`.
- Theme is available after sign-in, but not auto-applied to UI (needs implementation).

#### Summary Table

| Action                 | API Endpoint         | DB Field Updated/Retrieved      | Notes                                |
| ---------------------- | -------------------- | ------------------------------- | ------------------------------------ |
| Update theme           | PUT `/api/user/data` | `profiles.ui_preferences.theme` | Called from UserSettings on save     |
| Retrieve theme (login) | GET `/api/user/data` | `profiles.ui_preferences.theme` | Fetched on sign-in, not auto-applied |
