# Theme Toggle Implementation Plan

Date: 2025-08-14
Owner: Frontend Platform

## Goals & Success Criteria

- Immediate theme application when saving in UserSettings (no page refresh).
- On sign-in, fetch user preference and apply theme automatically.
- Persist preference locally and in DB; respect “system” mode (auto-switch on OS change).
- Avoid flash of incorrect theme (FOUC) on first paint.

Success is measured by:

- Theme switches instantly after clicking Save in settings.
- After signing in, UI reflects server-stored theme before the first user interaction.
- No visible flash when reloading pages; Toaster and Tailwind dark: styles match the chosen theme.

---

## Current Implementation Inventory

### Frontend

- Store: `stores/useUIStore.ts`

  - State: `theme: 'light' | 'dark' | 'system'` (default `system`)
  - Persistence: `localStorage` via key `STORAGE_KEYS.UI_PREFERENCES` → `openrouter-ui-preferences`
  - Exposes `useTheme()` with `{ theme, setTheme }`
  - Note: Changing store theme doesn’t currently update `<html>` class.

- Settings UI: `components/ui/UserSettings.tsx`

  - Edit flow uses `useUserData()` and on save calls `updatePreferences({ ui: { theme: editedPreferences.theme }, ... })`
  - No call to `useUIStore.setTheme` on save; hence no immediate UI toggle.

- Global Layout: `src/app/layout.tsx`

  - Uses Tailwind dark classes (`dark:bg-gray-900`) but doesn’t manage `<html>` `classList` dynamically.
  - No theme provider; no pre-hydration script.

- Toaster: `components/ui/Toaster.tsx`
  - Reads `document.documentElement.classList.contains('dark')` to style toasts.
  - Works if the `dark` class is present.

### Services/API

- Client services: `lib/services/user-data.ts`

  - `fetchUserData()` → GET `/api/user/data`
  - `updateUserPreferences()` → PUT `/api/user/data`

- API route: `src/app/api/user/data/route.ts`
  - GET: returns `preferences.ui.theme` as part of `UserDataResponse`.
  - PUT: updates `profiles.ui_preferences` (JSONB), accepts `{ ui: { theme } }` and maps to `ui_preferences` column.

### Database

- `database/schema/01-users.sql`
  - `profiles.ui_preferences` JSONB with default includes `"theme": "dark"`.

### Gaps

- No DOM-level theme application (missing ThemeProvider/effect on `<html>` tag).
- No automatic theme application on sign-in.
- No pre-hydration theme script to avoid FOUC.

---

## Phased Implementation Plan

### Phase 1 — Immediate Client-Side Theme Toggle (UI only)

- Add `contexts/ThemeProvider.tsx`:

  - Subscribes to `useUIStore().theme` and applies/removes `dark` class on `document.documentElement`.
  - Handles `system` mode using `window.matchMedia('(prefers-color-scheme: dark)')` and listens for changes.
  - Expose a small hook `useApplyTheme()` internally to compute effective mode.

- Wire provider in `src/app/layout.tsx`:

  - Wrap app content with `<ThemeProvider>` so theme is applied globally.

- Optimistic update in UserSettings save flow:

  - On Save click, immediately call `useUIStore.getState().setTheme(editedPreferences.theme)` before/after calling `updatePreferences()`.
  - If PUT fails, revert theme to last known store value (rollback) and show error.

- Minimal tests:

  - Unit test for `ThemeProvider` (JSDOM) that toggles `classList` when store theme changes.
  - Unit test for optimistic/rollback behavior in `UserSettings` (mock service to fail).

- User Test Steps

  - Open Settings → Preferences → change theme to Light/Dark/System.
  - Click Save → observe entire UI toggles immediately (navbar, background, toasts).
  - Toggle between modes; verify persistence across navigation.

- Exit Criteria
  - Theme class updates without reload; failure restores previous theme.

### Phase 2 — Apply Theme on Sign-In

- Create `components/system/ThemeInitializer.tsx`:

  - Uses auth state; when authenticated and once per session, call `fetchUserData()` to get `preferences.ui.theme`.
  - Compare with current `useUIStore.theme`; if different, update store → effect applies theme.
  - Guard with a small in-memory flag to avoid duplicate fetches.

- Mount `ThemeInitializer` high in the tree (inside `AuthProvider` / `RootLayout`).

- Sign-out behavior

  - Keep persisted local theme (from `useUIStore`), or optionally reset to `system` (document decision below).

- Tests

  - Simulate sign-in in JSDOM, mock `fetchUserData()` to return `dark` and assert `classList` contains `dark`.

- User Test Steps

  - Set theme to Light while logged in; sign out; set OS to dark; sign in again with server theme Dark → UI should be dark.

- Exit Criteria
  - After sign-in, UI reflects server theme within a second and stays consistent.

### Phase 3 — Pre-hydration No-Flash Theme

- Add inline script in `RootLayout` before app renders (head or first in body):

  - Read `localStorage['openrouter-ui-preferences']` (from `STORAGE_KEYS.UI_PREFERENCES`).
  - Parse and get `theme`; if `dark` → add `class="dark"` to `<html>`.
  - If `system` or missing → check `matchMedia('(prefers-color-scheme: dark)')` and add/remove accordingly.
  - Keep script tiny and synchronous to avoid hydration mismatch.

- Optional: set `data-theme="light|dark"` if needed later; Tailwind only needs `dark` class.

- Tests

  - Snapshot/DOM test to ensure script applies class with various stored values.

- Exit Criteria
  - No visible flash when reloading pages.

### Phase 4 — Documentation & Polishing

- Update docs:

  - `docs/stores/useUIStore.md` with ThemeProvider behavior.
  - New `docs/architecture/theme.md` explaining lifecycle: localStorage → pre-hydration → store → provider → DOM.

- Observability
  - Add lightweight console logs in dev only (existing logger covers store changes).

---

## File Changes (planned)

- Add: `contexts/ThemeProvider.tsx` (DOM effect + system listener)
- Add: `components/system/ThemeInitializer.tsx` (sign-in sync)
- Update: `src/app/layout.tsx` (wrap provider + inline script)
- Update: `components/ui/UserSettings.tsx` (optimistic `setTheme` + rollback)
- Tests: `tests/contexts/ThemeProvider.test.tsx`, `tests/system/ThemeInitializer.test.tsx`, minor updates to `tests/components/ui/UserSettings.test.tsx`
- Docs: `docs/architecture/theme.md`, refresh `docs/stores/useUIStore.md`

---

## Edge Cases & Considerations

- System theme changes while in `system` mode → listen to `matchMedia` and update class live.
- SSR environments without `window` → ThemeProvider guards all DOM usage behind `useEffect`.
- First load without any persisted value → default to `system` (use OS preference).
- Accessibility: respect user’s OS-level preference when `system` is selected.
- Toaster relies on `documentElement.classList` → already compatible.

---

## Clarifying Questions (please confirm before implementation)

1. Desired default when user is signed out and no local preference exists — use `system`?
   -> Yes, default to `system` theme.
2. On sign-out, should we reset theme to `system` or keep last chosen local value?
   -> Keep last chosen local value, unless explicitly requested to reset to `system`.
3. Is there any server-driven forced theme (e.g., enterprise branding) we should honor over local?
   -> No, local preference should take precedence unless explicitly overridden by a future requirement.
4. Any preference for storing `data-theme` attribute in addition to `dark` class for future design tokens?
   -> No immediate need, but can be added later if design tokens require it.
5. Should theme changes be broadcast across tabs (BroadcastChannel) to sync multiple windows?
   -> Yes, implementing BroadcastChannel would help keep theme changes in sync across tabs.

---

## Phase Checklists

### Phase 1 — Immediate Toggle

- [ ] Add ThemeProvider and wire to layout
- [ ] Optimistic `setTheme` in UserSettings save flow with rollback
- [ ] Unit tests for DOM class toggle and rollback
- [ ] User verification: Change theme and confirm instant UI update

### Phase 2 — Sign-In Apply

- [ ] Add ThemeInitializer and mount globally
- [ ] Fetch and apply theme post sign-in
- [ ] Unit tests for sign-in sync
- [ ] User verification: Sign in and confirm theme is applied automatically

### Phase 3 — No-Flash

- [ ] Inline pre-hydration script in layout
- [ ] Snapshot tests for script behavior
- [ ] User verification: Reload page, no flash observed

### Phase 4 — Docs

- [ ] Update docs and add architecture note
- [ ] Final user verification & sign-off

---

## User Test Steps (condensed)

1. Open Settings → switch theme to Dark → Save → UI turns dark immediately.
2. Reload the app → stays dark with no flash.
3. Change OS theme to Light while app theme is `system` → UI switches to light automatically.
4. Sign out → sign in again → UI matches server-stored theme.
