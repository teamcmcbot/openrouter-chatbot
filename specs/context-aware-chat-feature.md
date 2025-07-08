# Context-Aware Chat Feature Specification (Draft)

## Overview

Currently, each API call to OpenRouter is stateless and does not include chat history, resulting in responses that lack conversational context. This feature will enable context-aware conversations by including up to the last 5 messages in each API request. Additional strategies such as summarization will be considered to optimize context length and token usage.

---

## Goals

- Provide the LLM with recent conversation history for more coherent, context-aware responses
- Limit the number of messages sent (e.g., last 5) to stay within token limits
- Optionally summarize older messages to preserve important context while reducing token usage
- Maintain efficient API usage and fast response times

---

## User Stories

1. **Contextual Responses**

   - As a user, I want the chatbot to remember the recent conversation so replies are relevant and coherent.

2. **Efficient Context Management**
   - As a developer, I want to avoid exceeding token limits and keep API calls efficient by limiting or summarizing context.

---

## Implementation Plan

### 1. Message Selection

- For each API call, include up to the last 5 messages (user and assistant) from the current chat session.
- If fewer than 5 messages exist, include all.

### 2. Summarization (Optional/Advanced)

- If the conversation exceeds 5 messages, summarize earlier messages into a concise system prompt or summary message.
- Use a local summarization function or leverage the LLM for summarization.
- Prepend the summary to the message list sent to the API.

### 3. API Payload Structure

- Construct the API request payload as an array of messages, e.g.:
  ```typescript
  [
    { role: "system", content: "Summary of earlier conversation..." }, // optional
    { role: "user", content: "..." },
    { role: "assistant", content: "..." },
    // ...up to last 5 messages
  ];
  ```
- Ensure the payload fits within the model's context window (token limit).

### 4. Token Management

- Estimate token usage for the selected messages.
- If approaching the model's token limit, further truncate or summarize context.
- Optionally, allow user-configurable context window size.

---

## Database/State Changes

- No schema changes required; chat history is already stored per session.
- Update chat API logic to retrieve and package recent messages for each request.

---

## UI/UX Considerations

- No direct UI changes required; feature is backend/API-focused.
- Optionally, display a note if context is being summarized or truncated.

---

## Efficiency & Optimization Strategies

- Use lightweight, local summarization for older messages to reduce API calls and latency.
- Cache summaries for long sessions to avoid repeated summarization.
- Allow users to opt-in/out of summarization or adjust context window size in settings.

---

## Security & Privacy

- Only include messages from the current user's session.
- Do not leak context between users or sessions.

---

## Implementation Steps (MVP)

1. Update chat API to include last 5 messages in each request.
2. Add logic to summarize earlier messages if chat exceeds 5 messages (optional for MVP).
3. Test with various conversation lengths and verify context is preserved.
4. Monitor token usage and adjust logic as needed.

---

## Future Enhancements

- Advanced summarization using LLM or external service
- Dynamic context window based on token usage/model
- User-configurable context settings
- Visual indicators for context/summarization in UI

---

This draft outlines the requirements and strategies for implementing context-aware chat in the OpenRouter Chatbot. The approach balances conversational quality with efficiency and token constraints.
