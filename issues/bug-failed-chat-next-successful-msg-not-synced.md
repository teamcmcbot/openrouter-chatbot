# Bug: Failed chat next successful message not synced

## Description

The next successful message in the chat is not being synced properly after a failure occurs. This can lead to a poor user experience as users may not see the expected messages in the chat interface.

## Steps to Reproduce

1. Start a chat session.
2. Trigger a failure in the chat (e.g., using free models).
3. Switch to a different model (e.g., a paid model) and send a message.
4. Message is successful, but the message is not synced to the database.

## Expected Behavior

After a failure, the next successful message should be synced and displayed in the chat interface.

## Actual Behavior

The next successful message is not synced and does not appear in the chat interface.

## Impact

This bug can lead to confusion for users as they may not see the expected messages in the chat. It can also affect the overall reliability of the chat system.

## Suggested Fix

---

## Analysis (Root Cause & Proposed Changes)

### Summary of Symptoms Observed

1. After a 429 failure for a user message (saved with `error: true`), the next successful retry using a different model returns a response whose `request_id` matches the _failed_ user message ID instead of the new retry message ID.
2. The message sequence included in the subsequent `/api/chat` request body is out of chronological/logical order (two consecutive user messages appear before the prior assistant response). This breaks the intended alternating user→assistant pattern: actual array becomes `user, user, assistant, user(error), assistant, user(retry)` rather than the expected `user, assistant, user, assistant, user(error), user(retry)`.
3. Because the `request_id` is wrong, the frontend pairs the assistant answer with the earlier failed user message. When later attempting to persist both messages via `/api/chat/messages`, a 500 error with `duplicate key value violates unique constraint "chat_messages_pkey"` (code 23505) occurs—triggered when the same failed user message (already inserted earlier) is attempted again inside a multi-message insert batch.

### Primary Root Causes

1. `request_id` Derivation Logic in `/api/chat` (backend):

```ts
const currentUserMessage = body.messages?.find(
  (m) => m.role === "user" && m.content.trim() === body.message.trim()
);
request_id: currentUserMessage?.id;
```

This matches purely on message content, not on recency or a deterministic positional rule. When the retry uses IDENTICAL content ("what is amazon bedrock?") the `.find` returns the _first_ matching user message in the array—the failed one—producing the stale `request_id`.

2. Frontend message ordering before retry request:

- In `useChatStore.sendMessage` and `retryMessage`, context selection builds `messages` by taking prior conversation context plus the new user message. If a failed user message remains (with `error: true`) and a subsequent user message was sent before an assistant reply arrived, ordering can become misaligned due to how context reconstruction walks the history and pairs messages.
- Specifically, the context selection algorithm (`getContextMessages`) attempts to collect pairs from the end backward but treats orphaned assistant messages and failed user messages in ways that can reassemble a non-alternating order. When the final array is concatenated with the new user message, the final ordering may no longer reflect strict chronological order.

3. Duplicate insert attempt:

- On first failure, the failed user message is stored individually via `/api/chat/messages` (single insert path), establishing its primary key.
- On the next success, because the backend returns the stale `request_id`, the frontend logic bundles the (already stored) failed user message together again with the new assistant message in the multi-message save payload. The second insertion of the same `id` triggers the 23505 error.

### Secondary / Contributing Factors

- Lack of explicit disambiguation (e.g., using the _last_ matching user message, or sending an explicit `current_message_id` field) exacerbates collision when identical content is reused (common for retries).
- The backend does not validate or normalize chronological ordering of `body.messages` before scanning for the triggering user message.
- The chat store does not filter out failed user messages from the context set when preparing a _new_ retry request with identical content, nor does it tag the fresh retry distinctly for backend disambiguation beyond reusing the same text.

### Proposed Fixes

#### Backend (`/src/app/api/chat/route.ts`)

1. Replace content-based `.find` with a deterministic selection strategy:

- Accept a new optional field in the request: `current_message_id` (frontend sends the ID of the user message being sent/retried). If present, trust it directly.
- Fallback: choose the **last** user message whose trimmed content equals `body.message.trim()` (use `.reverse().find(...)` or iterate from end) to bias toward the most recent occurrence.

2. (Optional hardening) If multiple matches exist and none marked explicitly, log a warning with all candidate IDs for observability.
3. Add validation to ensure `messages` array is strictly non-decreasing by timestamp; if not, optionally sort a copy for matching logic (without mutating the original array passed to OpenRouter to preserve user intent) or at least log a diagnostic.

#### Frontend (`stores/useChatStore.ts`)

1. When building the request body in `sendMessage` / `retryMessage`, include `current_message_id: userMessage.id` (or reused message ID during retry) so the backend can set `request_id` unambiguously.
2. Ensure the `messages` array is strictly chronological before send:

- Sort by `timestamp` ascending just before `JSON.stringify` OR maintain invariant when constructing `contextMessages` (currently assembled from backward traversal and then unshifting; verify no reordering anomalies when adding the final user message).

3. Exclude prior failed user message duplicates with identical content unless needed for context (or, if included, rely on explicit `current_message_id` to avoid confusion).
4. After a failure and before a retry with the same content, consider updating the failed message's ID if you intend the retry to be a _new_ logical attempt; alternatively, reuse the ID intentionally and mark `error: false` once success occurs (simplifies DB dedupe) but then skip inserting the failed version twice.
5. Prevent duplicate insertion by filtering messages before payload construction for `/api/chat/messages`: only include messages not previously persisted OR rely on backend upsert (see DB option below).

#### Database Layer (Optional Enhancement)

- Convert `chat_messages` insertion in `messages/route.ts` to use an UPSERT (`.upsert` with `onConflict: 'id'`) for idempotency. This would mitigate (not eliminate) issues arising from resend attempts.

### Minimal Patch Outline

Backend:

```diff
// In chatHandler after parsing body
const explicitCurrentId = body.current_message_id;
let triggeringUserId: string | undefined;
if (explicitCurrentId) {
  triggeringUserId = explicitCurrentId;
} else if (Array.isArray(body.messages)) {
  for (let i = body.messages.length - 1; i >= 0; i--) {
   const m = body.messages[i];
   if (m.role === 'user' && typeof m.content === 'string' && m.content.trim() === body.message.trim()) {
    triggeringUserId = m.id;
    break;
   }
  }
}
// set request_id: triggeringUserId
```

Frontend:

```diff
// When constructing requestBody before fetch('/api/chat')
requestBody.current_message_id = userMessage.id; // or retry message id
// Ensure requestBody.messages is sorted chronologically
requestBody.messages = [...requestBody.messages].sort((a,b)=>new Date(a.timestamp).getTime()-new Date(b.timestamp).getTime());
```

### Testing Plan

1. Unit test backend matching: identical content with two user messages returns last one or explicit ID.
2. Simulate failure → retry with same content; assert `request_id` equals retry message ID.
3. Verify chronological ordering log (or sort) prevents misordered arrays.
4. Attempt duplicate save: confirm no 23505 when using UPSERT or when filtering duplicates client-side.

### Risk & Mitigation

- Changing selection logic could affect existing sessions relying on first-match semantics—mitigate by feature flag (`USE_LAST_USER_MATCH`) defaulting to true after validation.
- Sorting messages might alter model behavior if order was intentionally crafted; therefore, only sort a _copy_ for internal matching.

### Next Steps

1. Implement backend change for deterministic `request_id` selection with optional explicit ID.
2. Add frontend field `current_message_id` + chronological ordering before send.
3. (Optional) Add UPSERT or client duplicate filter to `/api/chat/messages` saving logic.
4. Add regression tests covering retry flow.

---

End of analysis.

Investigate the message syncing logic in the chat system and ensure that successful messages are properly synced even after a failure occurs.

## Reproduced error

1. POST /api/chat
   Request Payload:

```json
{
  "message": "what is amazon bedrock?",
  "messages": [
    {
      "id": "msg_1755009248861_y1k1o9hyk",
      "content": "List some LLM providers",
      "role": "user",
      "timestamp": "2025-08-12T14:34:08.861Z",
      "originalModel": "google/gemini-2.0-flash-exp:free",
      "input_tokens": 278
    },
    {
      "id": "msg_1755009298667_s3mp33zjc",
      "content": "alternatives to OpenRouter?",
      "role": "user",
      "timestamp": "2025-08-12T14:34:58.667Z",
      "originalModel": "google/gemini-2.0-flash-exp:free",
      "input_tokens": 514
    },
    {
      "id": "msg_1755009254314_zh2xa9tuu",
      "content": "Here are some LLM (Large Language Model) providers:\n\n*   **OpenAI:** Offers a range of models like GPT-3.5, GPT-4, and others, accessible through their API.\n*   **Google AI:** Provides models like Gemini (formerly Bard) and others through the Vertex AI platform.\n*   **Anthropic:** Known for their Claude models, focusing on safety and helpfulness.\n*   **Cohere:** Provides models designed for enterprise use cases, focusing on generation, search, and understanding.\n*   **AI21 Labs:** Offers models like Jurassic-2, emphasizing text generation and understanding.\n*   **Hugging Face:** A community and platform with a wide variety of open-source models and tools.\n*   **Microsoft Azure AI:** Offers access to various models, including those from OpenAI, through the Azure platform.\n*   **Meta AI:** Develops and releases open-source models like LLaMA.\n*   **OpenRouter:** A platform that provides access to multiple LLMs from different providers through a single API.\n\nFrom: LLM Model\n",
      "role": "assistant",
      "timestamp": "2025-08-12T14:34:14.314Z",
      "elapsed_time": 3,
      "total_tokens": 510,
      "input_tokens": 278,
      "output_tokens": 232,
      "user_message_id": "msg_1755009248861_y1k1o9hyk",
      "model": "google/gemini-2.0-flash-exp:free",
      "contentType": "markdown",
      "completion_id": "gen-1755009250-Pw5c94FpGloE3H8OGU0k"
    },
    {
      "id": "msg_1755009304864_gm11ezryb",
      "content": "Alternatives to OpenRouter include:\n\n*   **Direct Provider APIs:** Using the APIs directly from providers like OpenAI, Google AI, Anthropic, Cohere, AI21 Labs, and others. This gives you the most control but requires managing multiple integrations.\n*   **Hugging Face Inference Endpoints:** Provides a way to deploy and serve models from the Hugging Face Hub.\n*   **Amazon Bedrock:** A fully managed service that offers a choice of high-performing foundation models from leading AI companies.\n*   **Microsoft Azure AI:** Offers access to various models, including those from OpenAI, through the Azure platform.\n*   **Vertex AI Model Garden:** Google Cloud's platform for discovering and deploying a wide variety of ML models.\n*   **Banana:** A serverless platform for deploying and scaling machine learning models.\n*   **Modal:** A platform for deploying and running Python code in the cloud, suitable for serving ML models.\n\nKeep in mind that the best alternative depends on your specific needs, such as the models you want to use, your budget, and the level of control you require.\n\nFrom: LLM Model\n",
      "role": "assistant",
      "timestamp": "2025-08-12T14:35:04.864Z",
      "elapsed_time": 3,
      "total_tokens": 752,
      "input_tokens": 514,
      "output_tokens": 238,
      "user_message_id": "msg_1755009298667_s3mp33zjc",
      "model": "google/gemini-2.0-flash-exp:free",
      "contentType": "markdown",
      "completion_id": "gen-1755009301-QmhzgeGMpKApe452ltUC"
    },
    {
      "id": "msg_1755009345281_o2lvrl3ej",
      "content": "what is amazon bedrock?",
      "role": "user",
      "timestamp": "2025-08-12T14:35:45.281Z",
      "originalModel": "google/gemini-2.0-flash-exp:free"
    }
  ],
  "model": "google/gemini-2.0-flash-exp:free"
}
```

Response 429: Too Many Requests:

```json
{
  "error": "The Google model is temporarily rate-limited. Please try again in a few moments or switch to a different model.",
  "code": "too_many_requests",
  "details": "google/gemini-2.0-flash-exp:free is temporarily rate-limited upstream. Please retry shortly, or add your own key to accumulate your rate limits: https://openrouter.ai/settings/integrations",
  "timestamp": "2025-08-12T14:35:48.074Z",
  "retryAfter": 60,
  "suggestions": [
    "Try again in a few minutes",
    "Try one of these alternative models: google/gemma-3-27b-it:free, deepseek/deepseek-r1-0528:free, deepseek/deepseek-r1-0528-qwen3-8b:free"
  ]
}
```

2. Failed message sync to DB via
   POST /api/chat/messages:
   Request Payload:

```json
{
  "message": {
    "id": "msg_1755009345281_o2lvrl3ej",
    "content": "what is amazon bedrock?",
    "role": "user",
    "timestamp": "2025-08-12T14:35:45.281Z",
    "originalModel": "google/gemini-2.0-flash-exp:free",
    "error": true,
    "input_tokens": 0,
    "error_message": "The Google model is temporarily rate-limited. Please try again in a few moments or switch to a different model."
  },
  "sessionId": "conv_1755009248860_gy5e5xlyt"
}
```

Response:

```json
{
  "messages": [
    {
      "id": "msg_1755009345281_o2lvrl3ej",
      "session_id": "conv_1755009248860_gy5e5xlyt",
      "role": "user",
      "content": "what is amazon bedrock?",
      "model": null,
      "total_tokens": 0,
      "message_timestamp": "2025-08-12T14:35:45.281+00:00",
      "error_message": "The Google model is temporarily rate-limited. Please try again in a few moments or switch to a different model.",
      "is_streaming": false,
      "metadata": {},
      "content_type": "text",
      "elapsed_time": 0,
      "completion_id": null,
      "input_tokens": 0,
      "output_tokens": 0,
      "user_message_id": null
    }
  ],
  "count": 1,
  "success": true
}
```

3. Switch to another model and resend the same message

POST /api/chat
Request Payload:

```json
{
  "message": "what is amazon bedrock?",
  "messages": [
    {
      "id": "msg_1755009248861_y1k1o9hyk",
      "content": "List some LLM providers",
      "role": "user",
      "timestamp": "2025-08-12T14:34:08.861Z",
      "originalModel": "google/gemini-2.0-flash-exp:free",
      "input_tokens": 278
    },
    {
      "id": "msg_1755009298667_s3mp33zjc",
      "content": "alternatives to OpenRouter?",
      "role": "user",
      "timestamp": "2025-08-12T14:34:58.667Z",
      "originalModel": "google/gemini-2.0-flash-exp:free",
      "input_tokens": 514
    },
    {
      "id": "msg_1755009254314_zh2xa9tuu",
      "content": "Here are some LLM (Large Language Model) providers:\n\n*   **OpenAI:** Offers a range of models like GPT-3.5, GPT-4, and others, accessible through their API.\n*   **Google AI:** Provides models like Gemini (formerly Bard) and others through the Vertex AI platform.\n*   **Anthropic:** Known for their Claude models, focusing on safety and helpfulness.\n*   **Cohere:** Provides models designed for enterprise use cases, focusing on generation, search, and understanding.\n*   **AI21 Labs:** Offers models like Jurassic-2, emphasizing text generation and understanding.\n*   **Hugging Face:** A community and platform with a wide variety of open-source models and tools.\n*   **Microsoft Azure AI:** Offers access to various models, including those from OpenAI, through the Azure platform.\n*   **Meta AI:** Develops and releases open-source models like LLaMA.\n*   **OpenRouter:** A platform that provides access to multiple LLMs from different providers through a single API.\n\nFrom: LLM Model\n",
      "role": "assistant",
      "timestamp": "2025-08-12T14:34:14.314Z",
      "elapsed_time": 3,
      "total_tokens": 510,
      "input_tokens": 278,
      "output_tokens": 232,
      "user_message_id": "msg_1755009248861_y1k1o9hyk",
      "model": "google/gemini-2.0-flash-exp:free",
      "contentType": "markdown",
      "completion_id": "gen-1755009250-Pw5c94FpGloE3H8OGU0k"
    },
    {
      "id": "msg_1755009345281_o2lvrl3ej",
      "content": "what is amazon bedrock?",
      "role": "user",
      "timestamp": "2025-08-12T14:35:45.281Z",
      "originalModel": "google/gemini-2.0-flash-exp:free",
      "error": true,
      "input_tokens": 0,
      "error_message": "The Google model is temporarily rate-limited. Please try again in a few moments or switch to a different model."
    },
    {
      "id": "msg_1755009304864_gm11ezryb",
      "content": "Alternatives to OpenRouter include:\n\n*   **Direct Provider APIs:** Using the APIs directly from providers like OpenAI, Google AI, Anthropic, Cohere, AI21 Labs, and others. This gives you the most control but requires managing multiple integrations.\n*   **Hugging Face Inference Endpoints:** Provides a way to deploy and serve models from the Hugging Face Hub.\n*   **Amazon Bedrock:** A fully managed service that offers a choice of high-performing foundation models from leading AI companies.\n*   **Microsoft Azure AI:** Offers access to various models, including those from OpenAI, through the Azure platform.\n*   **Vertex AI Model Garden:** Google Cloud's platform for discovering and deploying a wide variety of ML models.\n*   **Banana:** A serverless platform for deploying and scaling machine learning models.\n*   **Modal:** A platform for deploying and running Python code in the cloud, suitable for serving ML models.\n\nKeep in mind that the best alternative depends on your specific needs, such as the models you want to use, your budget, and the level of control you require.\n\nFrom: LLM Model\n",
      "role": "assistant",
      "timestamp": "2025-08-12T14:35:04.864Z",
      "elapsed_time": 3,
      "total_tokens": 752,
      "input_tokens": 514,
      "output_tokens": 238,
      "user_message_id": "msg_1755009298667_s3mp33zjc",
      "model": "google/gemini-2.0-flash-exp:free",
      "contentType": "markdown",
      "completion_id": "gen-1755009301-QmhzgeGMpKApe452ltUC"
    },
    {
      "id": "msg_1755009408209_56vecnout",
      "content": "what is amazon bedrock?",
      "role": "user",
      "timestamp": "2025-08-12T14:36:48.209Z",
      "originalModel": "google/gemini-2.5-flash-lite"
    }
  ],
  "model": "google/gemini-2.5-flash-lite"
}
```

NOTE: The sequence of messages here is wrong.
user,user,assistant,user,assistant,user
instead of
user,assistant,user,assistant,user(The one that hit 429 error),user

Successful response:

```json
{
  "data": {
    "response": "Amazon Bedrock is a fully managed service from Amazon Web Services (AWS) that provides access to a range of high-performing foundation models (FMs) from leading AI companies like AI21 Labs, Anthropic, Cohere, Meta, Stability AI, and Amazon itself.\n\nEssentially, it acts as a unified API gateway to these diverse models. Instead of integrating with each provider separately, you can use Bedrock to access and experiment with different models for various tasks such as text generation, summarization, chatbots, image generation, and more.\n\nKey features of Amazon Bedrock include:\n\n*   **Choice of Models:** Access to a variety of FMs, allowing you to select the best model for your specific use case.\n*   **Managed Service:** AWS handles the underlying infrastructure, scaling, and maintenance, so you don't have to.\n*   **Customization:** Options to fine-tune models with your own data to improve performance for specific tasks.\n*   **Security and Compliance:** Leverages AWS's robust security features and compliance standards.\n*   **Integration with AWS Services:** Seamless integration with other AWS services for building comprehensive AI-powered applications.\n\nIn short, Amazon Bedrock aims to simplify the process of building and scaling generative AI applications by providing a single point of access to a curated selection of powerful foundation models.\n\nFrom: LLM Model",
    "usage": {
      "prompt_tokens": 762,
      "completion_tokens": 278,
      "total_tokens": 1040
    },
    "request_id": "msg_1755009345281_o2lvrl3ej",
    "timestamp": "2025-08-12T14:36:51.778Z",
    "elapsed_time": 1,
    "contentType": "markdown",
    "id": "gen-1755009410-hFMDaPnnltmlFw4gyCEz"
  },
  "timestamp": "2025-08-12T14:36:51.778Z"
}
```

NOTE: request_id returned here is WRONG.
it is giving "msg_1755009345281_o2lvrl3ej" for the failed message
instead of "msg_1755009408209_56vecnout" which was the successful one using a different model "google/gemini-2.5-flash-lite"

4. Error 500 when syncing messages to DB via messages endpoint:

POST /api/chat/messages
Request Payload:

```json
{
  "messages": [
    {
      "id": "msg_1755009345281_o2lvrl3ej",
      "content": "what is amazon bedrock?",
      "role": "user",
      "timestamp": "2025-08-12T14:35:45.281Z",
      "originalModel": "google/gemini-2.0-flash-exp:free",
      "error": true,
      "input_tokens": 762,
      "error_message": "The Google model is temporarily rate-limited. Please try again in a few moments or switch to a different model."
    },
    {
      "id": "msg_1755009411783_o9xfvh6nt",
      "content": "Amazon Bedrock is a fully managed service from Amazon Web Services (AWS) that provides access to a range of high-performing foundation models (FMs) from leading AI companies like AI21 Labs, Anthropic, Cohere, Meta, Stability AI, and Amazon itself.\n\nEssentially, it acts as a unified API gateway to these diverse models. Instead of integrating with each provider separately, you can use Bedrock to access and experiment with different models for various tasks such as text generation, summarization, chatbots, image generation, and more.\n\nKey features of Amazon Bedrock include:\n\n*   **Choice of Models:** Access to a variety of FMs, allowing you to select the best model for your specific use case.\n*   **Managed Service:** AWS handles the underlying infrastructure, scaling, and maintenance, so you don't have to.\n*   **Customization:** Options to fine-tune models with your own data to improve performance for specific tasks.\n*   **Security and Compliance:** Leverages AWS's robust security features and compliance standards.\n*   **Integration with AWS Services:** Seamless integration with other AWS services for building comprehensive AI-powered applications.\n\nIn short, Amazon Bedrock aims to simplify the process of building and scaling generative AI applications by providing a single point of access to a curated selection of powerful foundation models.\n\nFrom: LLM Model",
      "role": "assistant",
      "timestamp": "2025-08-12T14:36:51.783Z",
      "elapsed_time": 1,
      "total_tokens": 1040,
      "input_tokens": 762,
      "output_tokens": 278,
      "user_message_id": "msg_1755009345281_o2lvrl3ej",
      "model": "google/gemini-2.5-flash-lite",
      "contentType": "markdown",
      "completion_id": "gen-1755009410-hFMDaPnnltmlFw4gyCEz"
    }
  ],
  "sessionId": "conv_1755009248860_gy5e5xlyt"
}
```

NOTE: This payload as a result of the wrong response from the previous call is not giving the correct user/assistant message pairing and returns error 500.

Response: 500

```json
{
  "error": "An internal error occurred.",
  "code": "internal_server_error",
  "details": "An unexpected error occurred.",
  "timestamp": "2025-08-12T14:36:52.107Z"
}
```

```log
[2025-08-12T14:36:52.028Z] [INFO] Create messages request { userId: 'f319ca56-4197-477c-92e7-e6e2d95884be' }
[2025-08-12T14:36:52.107Z] [ERROR] Create message error: {
  code: '23505',
  details: null,
  hint: null,
  message: 'duplicate key value violates unique constraint "chat_messages_pkey"'
}
[API_ERROR] {
  code: '23505',
  details: null,
  hint: null,
  message: 'duplicate key value violates unique constraint "chat_messages_pkey"'
}
 POST /api/chat/messages 500 in 224ms
```

## Possible areas to look at

- Check frontend token estimation logic and how they formed the payload for /api/chat with the messages array. Is there any reason why the ordering sequence is wrong?
- Check the backend logic for /api/chat in returning the request_id in the response message. Is the message array containing a broken user/assistant pairing messing up the response for request_id?
