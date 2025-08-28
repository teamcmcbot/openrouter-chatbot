# Light/Dark Mode Header Toggle – Analysis & Plan

## Summary

Add a small theme indicator + toggle button in the Header: left of the Sign In button for unauthenticated users, or left of the avatar for authenticated users. The icon should reflect the effective theme and allow toggling light/dark. For authenticated users, toggling should sync the preference to the backend with spam protection.

---

## Current behavior (as implemented)

- State source: `useTheme()` from `stores/useUIStore.ts` with values `'light' | 'dark' | 'system'`. Default store value is `'system'`. We will change this to binary `'light' | 'dark'` with default `'dark'` going forward.
- Application: `ThemeProvider` reads `theme` and applies `.dark` class to `<html>` based on either `'dark'` or `'system' && prefers-dark`.
- Prevent FOUC: `src/app/layout.tsx` sets `<html class="dark">` and runs a beforeInteractive script reading `localStorage('openrouter-ui-preferences').state.theme || 'system'` + `matchMedia('(prefers-color-scheme: dark)')` to set/clear `.dark` before hydration.
- Post sign-in: `ThemeInitializer` fetches `/api/user/data` and applies `preferences.ui.theme` if present and different.
- Settings: `components/ui/UserSettings.tsx` uses `useTheme` and `useUserData().updatePreferences()` to change/save `ui.theme`.

Conclusion: The app already supports theme selection with SSR-safe hydration and optional server override after sign-in. There is currently no header toggle.

---

## Flow verification

1. Default theme is dark

- Going forward, yes. We will remove `system` and default to `'dark'`. First-time users will see dark until they explicitly switch to light.

2. On page load, the default theme could be overwritten at the OS/browser level.

- After removing `system`, OS/browser won’t affect the theme. Only the stored preference (`dark` default) applies.

3. After sign in, it retrieves the user's preferred theme from database and applies it.

- Accurate. `ThemeInitializer` fetches user data and applies `preferences.ui.theme`.

4. User can change the current light/dark theme via UserSettings.

- Accurate. `UserSettings` sets theme locally and persists via `updatePreferences`.

5. The new header icon can toggle light/dark mode, and for authenticated users it syncs to backend with rate limiting.

- Feasible. We’ll set local theme immediately, then throttle/debounce server updates using the existing `updateUserPreferences({ ui: { theme } })` service.

---

## Design decisions

- Iconography: `@heroicons/react/24/outline` – `SunIcon` for light, `MoonIcon` for dark.
- Placement: Within `SimpleAuthButton`:
  - Unauthenticated: button rendered to the immediate left of the primary Sign In button.
  - Authenticated: button rendered to the immediate left of the avatar button.
- Behavior:
  - Click toggles light ↔ dark (binary only).
  - Local update first: `setTheme(newTheme)` for instant UI response and persisted in local storage.
  - Authenticated sync: call `updateUserPreferences({ ui: { theme: newTheme } })` with spam protection.
- Spam protection:
  - No cooldown for UI interaction. For server, throttle writes to at most once every 10 seconds with a trailing call. Use `lastSyncAt` and `pendingTheme`. If user toggles 10 times in 2s, send only the last state after ~10s.
  - Network errors don’t revert the local theme. Silent retry on the next toggle or trailing flush (no toast).
- Hydration/SSR safety: Render a neutral button shell until mounted. With no `system` mode, icon derives directly from stored theme value.
- Unauthenticated behavior: Only local theme update and persist; no server call.

---

## Minimal contract

- Input: user click on header icon.
- Output: Local theme updated immediately; if authenticated, server preference updated at most once/10s with the latest toggled value.
- Error modes: Server update may fail; local theme remains; optional user feedback.
- Success: Icon reflects effective theme; UI updates instantly; server preference converges to user’s last choice.

---

## Implementation plan

### Phase 1 – Header toggle UI

- [ ] Add theme toggle button to `components/auth/SimpleAuthButton.tsx`:
  - [ ] Import `useTheme`, `SunIcon`, `MoonIcon`, and `useUserData` (for update function when authed).
  - [ ] No `system` handling needed; icon reflects `theme` directly.
  - [ ] Render button left of existing Sign In or avatar controls.
  - [ ] Button shows `MoonIcon` when theme is dark, `SunIcon` when light.
- [ ] User verification: Confirm icon appears in both authed and unauthed headers and switches icons between light/dark correctly.

### Phase 2 – Toggle behavior and local update

- [ ] Implement click handler: flip between `dark` and `light`.
- [ ] Call `setTheme(next)` immediately (persisted via zustand).
- [ ] User verification: Click toggles theme and icon updates instantly with no page reload.

### Phase 3 – Server sync with spam protection (authed only)

- [ ] Access `isAuthenticated` and `user` from `useAuth()` and `updatePreferences` from `useUserData({ enabled: false })` or reuse provider if already in tree.
- [ ] Throttle writes to 1/10s (trailing only, silent):
  - [ ] Keep `lastSyncAt` and `pendingTheme` refs.
  - [ ] On toggle: if authed, set `pendingTheme=next`; if now - `lastSyncAt` >= 10s, send immediately and set `lastSyncAt=now`; else schedule a setTimeout at `lastSyncAt + 10s` to send the latest `pendingTheme`, clearing any prior timer.
  - [ ] Clear timeout on unmount.
- [ ] User verification: Rapidly toggle; observe at most one server request per 10s window; final state persists to DB.

### Phase 4 – Polish & accessibility

- [ ] Add `aria-pressed`, `aria-label` with current mode; tooltip title: “Toggle dark mode”.
- [ ] Visual states: focus ring, hover colors consistent with design.
- [ ] Silent retry on server failure (no toast).
- [ ] Unit tests for toggle logic and throttling (mock `updateUserPreferences`).
- [ ] Documentation: Update user settings docs to mention header toggle.
- [ ] User verification: Accessibility checks with keyboard navigation and screen readers.

### Phase 5 – Merge & docs

- [ ] Add notes to `/docs/components/ui` about the header toggle and sync behavior.
- [ ] Record any design decisions that differ from initial assumptions.
- [ ] Await user sign-off before implementing.

---

## Manual test steps

Unauthenticated:

- [ ] Load app in a fresh browser profile (no localStorage). Verify theme defaults to dark.
- [ ] Click header icon; theme flips immediately; reload page; preference persists via localStorage.

Authenticated:

- [ ] Sign in; verify `ThemeInitializer` applies server theme.
- [ ] Toggle via header icon; UI flips immediately. Only one server request every 10s while toggling rapidly.
- [ ] Open `UserSettings`; verify dropdown reflects updated theme. Change in settings also updates header icon.
- [ ] Sign out and back in; verify server-saved theme applies.

---

## Open questions (please confirm)

1. Should the header toggle support cycling through `'system'` as a third state, or strictly binary (light/dark)?

- let's remove `system` as an option completely and default to dark mode, that way OS and browser setting does not overwrite the theme and user has to manually switch to light mode.

2. For `'system'` state, when the user clicks the toggle, do we permanently switch to the opposite explicit state (light/dark) or keep `'system'` and temporarily invert?

- No more system state, we support only dark (default) or light mode.

3. Do we want a visible cooldown indicator or tooltip note when throttling is in effect, or keep it silent?

- there is no cooldown for the toggle, I am referring to the backend api call to updateUserPreferences to not immediately trigger to the server. Like if the user spam the toggle 10 times in 2 seconds, we should only send the last one after 10 seconds.

4. Any preference for outline vs solid heroicons for consistency? Current menus use outline.

- Let's try with outline first.

5. Do we want to show a toast if the server sync fails, or silently retry on the next toggle?

- silent retry.

---

## Risks & mitigations

- Icon mismatch on first render: mitigate by hiding icon until mounted or by computing effective theme in a layout effect; pre-hydration script already prevents main UI FOUC.
- Excess server writes: throttled trailing updates at 10s window.
- Conflicts with Settings page: last-write-wins; both paths call `updateUserPreferences`; header icon uses trailing throttled write.
- Offline usage: local theme persists; server sync will fail silently or show optional toast.

---

## Implementation notes

- No new API endpoints required. Reuse `updateUserPreferences({ ui: { theme } })`.
- Keep button styles minimal: ring + hover to match existing header controls.
- Ensure the new import does not bloat bundle excessively; heroicons tree-shaken component import is fine.
