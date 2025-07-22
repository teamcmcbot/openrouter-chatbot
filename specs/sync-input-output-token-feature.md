# Sync Input/Output token on successful assistance response

## Overview

On successful message, Usage details (input, output, total tokens) are returned.
But currently only total_tokens are used and sync to db (for signed in users).
To use all 3 usage values and display on the frontend, as well as sync back to db for signed in users.

## User Message

### Request

User's message id (e.g. "msg_1753195195759_ei5l6ns9o") is sent

```json
{
  "message": "How many international airport in Japan?",
  "messages": [
    {
      "id": "msg_1753195195759_ei5l6ns9o",
      "content": "How many international airport in Japan?",
      "role": "user",
      "timestamp": "2025-07-22T14:39:55.759Z",
      "originalModel": "moonshotai/kimi-k2:free"
    }
  ],
  "model": "moonshotai/kimi-k2:free"
}
```

### Response

The response contains the usage, including prompt_tokens, completion_tokens and total_tokens.
Currently, we are only using total_tokens, displayed in the assistance response tokens in frontend and updated in db chat_messages.total_tokens for role=assistance

```json
{
  "data": {
    "response": "Japan has **28 international airports** as officially designated by the Ministry of Land, Infrastructure, Transport and Tourism (MLIT). These airports handle regular international passenger flights. Some of the major ones include:\n\n- **Narita International Airport (Tokyo)**\n- **Haneda Airport (Tokyo)**\n- **Kansai International Airport (Osaka)**\n- **Chubu Centrair International Airport (Nagoya)**\n- **Fukuoka Airport**\n- **New Chitose Airport (Sapporo)**\n\nThe rest serve regional international routes, often with limited destinations.",
    "usage": {
      "prompt_tokens": 32,
      "completion_tokens": 120,
      "total_tokens": 152
    },
    "timestamp": "2025-07-22T14:40:08.777Z",
    "elapsed_time": 11,
    "contentType": "markdown",
    "id": "gen-1753195196-gXqznKSCpyxp9cwouA8v"
  },
  "timestamp": "2025-07-22T14:40:08.777Z"
}
```

#### TODO

- Add user's message id in the response. e.g. data.request_id
- Frontend to read this request_id to identify user's green bubble, then update the input token cost from data.usage.prompt_tokens into the coresponding green bubble, similar to how assistance response is currently appending the token cost at the bottom of the chat bubble.

## Sync API

#### Request

```json
{
  "conversations": [
    {
      "id": "conv_1753195195759_a209edwxv",
      "title": "How many international airport in Japan?",
      "messages": [
        {
          "id": "msg_1753195195759_ei5l6ns9o",
          "content": "How many international airport in Japan?",
          "role": "user",
          "timestamp": "2025-07-22T14:39:55.759Z",
          "originalModel": "moonshotai/kimi-k2:free"
        },
        {
          "id": "msg_1753195208782_3x4ohd989",
          "content": "Japan has **28 international airports** as officially designated by the Ministry of Land, Infrastructure, Transport and Tourism (MLIT). These airports handle regular international passenger flights. Some of the major ones include:\n\n- **Narita International Airport (Tokyo)**\n- **Haneda Airport (Tokyo)**\n- **Kansai International Airport (Osaka)**\n- **Chubu Centrair International Airport (Nagoya)**\n- **Fukuoka Airport**\n- **New Chitose Airport (Sapporo)**\n\nThe rest serve regional international routes, often with limited destinations.",
          "role": "assistant",
          "timestamp": "2025-07-22T14:40:08.782Z",
          "elapsed_time": 11,
          "total_tokens": 152,
          "model": "moonshotai/kimi-k2:free",
          "contentType": "markdown",
          "completion_id": "gen-1753195196-gXqznKSCpyxp9cwouA8v"
        }
      ],
      "userId": "f319ca56-4197-477c-92e7-e6e2d95884be",
      "createdAt": "2025-07-22T14:39:55.759Z",
      "updatedAt": "2025-07-22T14:40:08.783Z",
      "messageCount": 2,
      "totalTokens": 152,
      "isActive": true,
      "lastMessagePreview": "Japan has **28 international airports** as officially designated by the Ministry of Land, Infrastruc...",
      "lastMessageTimestamp": "2025-07-22T14:40:08.782Z",
      "lastModel": "moonshotai/kimi-k2:free"
    }
  ]
}
```

### DB

- chat_messages table contains only `total_tokens` column which is only updated for role="assistant" while it is 0 when role="user"
- To add input_token (updated for role=user)
- To add output_token (updated for role=assistant)
- To add user_message_id (updated for role=assistant)

### TODO

- add prompt_tokens in the user's message
- add completion_tokens in assistance's message
- add user_message_id in assistance's message

## Food for thought for AGENT

- Syncing is 2 ways, when new message/response is received and updated back to db, as well as on initial sign in syncing chat histories to the ChatSidebar. The newly added columns must be able sync back front db to frontend and display properly.
- Currently the User's message chat bubble do not have any tokens details tied to it. Think about how they will be displayed when assistance response returns.
- Feel free to make suggestions on the database design for chat_messages, chat_sessions, think about how the data can be used for probably user's analytics / dashboard in the future.
