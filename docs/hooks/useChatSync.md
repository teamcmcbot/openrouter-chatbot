# useChatSync

## Purpose / high-level description

- Synchronizes local chat history with the server when a user authenticates (initial sign-in flow).
- Exposes sync status for UI display; no manual or periodic auto-sync is provided.

## Parameters

| Name | Type | Required? | Description                    |
| ---- | ---- | --------- | ------------------------------ |
| –    | –    | –         | This hook takes no parameters. |

## Returned values

| Name         | Type                                      | Description                               |
| ------------ | ----------------------------------------- | ----------------------------------------- | ------------------- |
| `syncStatus` | `{ isSyncing: boolean; lastSyncTime: Date | null; syncError: any; canSync: boolean }` | Status information. |

## State variables

- Derived from `useChatStore` and `useAuthStore`.

## Side effects

- Migrates anonymous conversations to the authenticated user and loads user conversations on authentication changes.
- Filters conversations for the current user after initial sync.

## Persistence mechanisms

- Relies on chat store persistence for conversation data.

## Example usage

```tsx
useChatSync(); // usually inside AuthProvider
```

## Notes for juniors

- The hook is side-effect-only; it doesn’t expose a manual sync function. Ensure `useAuthStore` is initialized so sign-in transitions trigger the sync.
