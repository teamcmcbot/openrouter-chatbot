# Retry success conversation title not updated

## Overview

After a successful retry of a conversation, the title is not updated in the frontend / ChatSidebar.

On success, /api/chat/messages is triggered which will create the chat session in backend to db. But the frontend side still displays as "New Chat".
