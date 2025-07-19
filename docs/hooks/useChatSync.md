# useChatSync

## Purpose / high-level description
- Synchronizes local chat history with the server when a user authenticates.
- Provides periodic auto-sync and a manual sync function.

## Parameters
| Name | Type | Required? | Description |
| ---- | ---- | --------- | ----------- |
| – | – | – | This hook takes no parameters. |

## Returned values
| Name | Type | Description |
| ---- | ---- | ----------- |
| `manualSync` | `() => Promise<void>` | Triggers an immediate sync. |
| `syncStatus` | `{ isSyncing: boolean; lastSyncTime: Date \| null; syncError: any; canSync: boolean }` | Status information. |

## State variables
- Derived from `useChatStore` and `useAuthStore`.

## Side effects
- Runs effects to migrate conversations and auto-sync every 5 minutes.
- Listens to authentication changes to kick off syncing.

## Persistence mechanisms
- Relies on chat store persistence for conversation data.

## Example usage
```tsx
useChatSync(); // usually inside AuthProvider
```

## Notes for juniors
- Ensure `useChatStore` and `useAuthStore` are initialized before calling manual sync.
