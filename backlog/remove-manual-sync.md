# Remove manual sync and auto-sync feature

## Overview

The /api/chat/sync endpoint is now only used on initial sign in for the purpose of syncing unauthenticated chat messages back to db + fetching the user's chat history back to frontend.
Each messages thereafter are sync to backend via /api/chat/messages endpoint.
As such there is no longer a use-case for manual sync and auto-sync features.
To carefully analyze the code, we need to remove all references to manual sync and auto-sync and make sure to clean up any unused functions, variables etc.

We should remove the Sync button in ChatSidebar, but we can explore keeping the Sync Status indicator and maybe refactor to update it after successful /api/chat/messages calls.
