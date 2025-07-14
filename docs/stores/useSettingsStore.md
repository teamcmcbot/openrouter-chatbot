# useSettingsStore

## Purpose / Overview
A generic key/value settings store used by the app. Values are
persisted to `localStorage` and can be accessed via the
`useLocalStorage` helper.

## State Shape
| State Variable | Type | Description |
| -------------- | ---- | ----------- |
| `settings` | `Record<string, unknown>` | Stored settings by key. |
| `isHydrated` | `boolean` | `true` once values are loaded from storage. |
| `error` | `string \| null` | Last operation error. |
| `lastUpdated` | `Date \| null` | Timestamp of the most recent change. |

## Actions / Methods
| Action | Parameters | Description |
| ------ | ---------- | ----------- |
| `setSetting` | `(key, value)` | Save a value under a key. |
| `getSetting` | `(key, default?)` | Retrieve a stored value. |
| `removeSetting` | `(key)` | Delete a single key. |
| `clearAllSettings` | `()` | Remove all stored keys. |
| `importSettings` | `(newSettings)` | Merge a set of key/value pairs. |
| `exportSettings` | `()` | Return the entire settings object. |
| `_hasHydrated` | `()` | Internal: mark the store as hydrated. |
| `clearError` | `()` | Reset the error value. |
| `reset` | `()` | Restore defaults. |

## Selectors / Computed State
None. Consumers read settings directly by key.

## Persistence Behavior
- Uses `persist` with a custom storage wrapper to handle SSR safely.
- Only the `settings` object is saved to `localStorage`.
- The `onRehydrateStorage` callback sets `isHydrated` after loading.

## SSR Considerations
`safeLocalStorage` from `storeUtils.ts` ensures storage access happens
only on the client. Until hydration completes, `useLocalStorage` returns
its `initialValue`.

## Wrapper Hooks
`useLocalStorage(key, initialValue)` is a backward-compatible helper
built on top of the store. It mirrors the API of React's `useState`.

## Developer Tips
- Devtools are enabled via `createDevtoolsOptions('settings-store')`.
- Inspect `localStorage` under `openrouter-settings-storage` when debugging.
