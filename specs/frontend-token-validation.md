# Feature Request: Improve Frontend Token Validation to Respect User Subscription Limits

## Background

Currently, the frontend chat logic (in `useChatStore.ts`) estimates token usage and selects message context based on the model's technical token limits (e.g., 4096 for GPT-3.5). This is done to avoid sending requests that would be rejected by the model due to exceeding its maximum input size.

However, the backend enforces additional, often stricter, limits based on the user's subscription tier (e.g., `features.maxTokensPerRequest`), which may be lower than the model's technical limit. The frontend is not aware of these user-specific limits and does not validate against them before sending requests to `/api/chat`.

## Current Implementation

- **Frontend**

  - Uses `getModelTokenLimits(model)` (from `lib/utils/tokens.ts`) to determine the model's max input tokens (e.g., 4096 for GPT-3.5).
  - Calls `getContextMessages(maxTokens)` (from `useChatStore.ts`) to select as much conversation history as possible within the model's token budget.
  - Builds the outgoing message array (`allMessages = [...contextMessages, userMessage]`).
  - Calculates total token usage with `estimateMessagesTokens(allMessages)` (from `lib/utils/tokens.ts`).
  - If the total tokens exceed the model's limit, uses fallback logic to reduce context (progressively smaller budgets) until the request fits.
  - Validates the message is not empty and not already loading.
  - Forms the request payload in either NEW (with `messages` array) or LEGACY (single message) format.
  - Sends the request to the backend via `/api/chat`.

- **Backend**
  - Receives the request in the `/api/chat` API route.
  - Calls `validateChatRequest(body)` (from `lib/utils/validation.ts`) to check the request structure and required fields.
  - If a `messages` array is present, calls `validateMessageContent(messages, features)` (from `lib/utils/validation.ts`):
    - This uses `estimateTokenCount` to estimate tokens for each message and sums them.
    - Then calls `validateRequestLimits(totalTokens, features)` to compare against the user's `features.maxTokensPerRequest`.
  - If the total tokens exceed the user's subscription tier limit, rejects the request with an error.
  - Also validates feature access (e.g., custom temperature, system prompt) and message structure.

### Example Scenario

- **User**: Free tier (maxTokensPerRequest = 2048)
- **Model**: GPT-3.5 (maxInputTokens = 4096)
- **Frontend**: Prepares a request with 3000 tokens (valid for model, invalid for user)
- **Backend**: Rejects the request due to user limit

## Problem

- Users may compose long messages or conversations that appear valid in the UI but are rejected by the backend due to stricter subscription limits.
- This results in unnecessary failed requests, wasted bandwidth, and a poor user experience.
- The frontend validation is not aligned with the backend's actual enforcement.

## Suggested Solution

**Requirement:**

- Frontend validation should be used solely for budgeting how many conversation messages to include in the request, based on the user's subscription tier configuration (e.g., `features.maxTokensPerRequest`).
- Remove the current frontend validation logic that uses OpenRouter's model input/output context size for budgeting or limiting messages.
- The frontend should not use the model's context size for limiting or fallback; it should only use the user's tier configuration.
- The backend (Phase 4) will continue to validate both the user's tier configuration and the model's configuration for security and correctness.
- This is because the user's tier configuration (`maxTokensPerRequest`) will almost always be less than the model's maximum context size.

**Backend:**

- Continues to validate both the user's tier configuration and the model's configuration for security purposes.

### Implementation Steps

1. **Expose User Token Limit to Frontend**

   - After login or on app load, fetch the user's `maxTokensPerRequest` (from `features`) and store it in the frontend state (e.g., Zustand store or React context).

2. **Budget Messages Using Only Tier Limit**

   - When preparing a message, use only the user's `maxTokensPerRequest` for context selection and validation.
   - Do not use the model's context size for limiting or fallback in the frontend.

3. **Update Validation Logic**
   - Ensure all context selection, token estimation, and fallback logic use only the user's tier configuration.
   - Prevent sending requests that would be rejected for exceeding the user's tier limit.
   - If the message/context exceeds the user's tier limit, reduce context or show an error to the user.

### Example (Pseudocode)

```ts
const userLimit = features.maxTokensPerRequest; // e.g., 2048
const contextMessages = getContextMessages(userLimit);
const allMessages = [...contextMessages, userMessage];
const totalTokens = estimateMessagesTokens(allMessages);

if (totalTokens > userLimit) {
  // Reduce context or show error to user
}
```

### User Experience Improvement

- Users will see immediate feedback if their message/context is too long for their subscription tier.
- Fewer failed requests and less frustration.
- Backend still validates for both tier and model limits for security, but most invalid requests are caught early.

## Summary Table

| Step                | Limit Used            | Where?   |
| ------------------- | --------------------- | -------- |
| Frontend validation | min(user tier, model) | Frontend |
| Backend validation  | user tier, model      | Backend  |

## Acceptance Criteria

- [ ] Frontend fetches and stores the user's token limit after login/session load
- [ ] All token budgeting and context selection use the lower of user and model limits
- [ ] User cannot send requests that would be rejected for exceeding their subscription tier
- [ ] Clear error or warning is shown in the UI if the limit is exceeded
- [ ] Backend validation remains as a final gatekeeper

## Tier Configuration Storage Plan

Currently, tier configuration (such as `maxTokensPerRequest`) is determined in `lib/utils/auth.ts` via the `createFeatureFlags` function, which uses the user's `subscription_tier` from the `profiles` table. The configuration for each tier is hardcoded in this utility function.

**Options for Future Flexibility:**

- If you anticipate frequent changes to tier limits, or want to allow dynamic configuration (e.g., via admin UI), consider creating a dedicated `subscription_tiers` table in the database. This table would store limits and features for each tier, and could be joined or queried when building the user's feature flags.
- If the current approach (hardcoded in `auth.ts`) is sufficient for now, you can continue using it, but document that changes require code deployment.
- For maximum flexibility, implement a utility class or service that retrieves tier configuration from the database, with a fallback to defaults if not found.

**Recommendation:**

- For MVP or low-change environments, continue using the current approach in `auth.ts`.
- For production or environments with frequent tier changes, plan to migrate tier configuration to a database table and update the feature flag utility to fetch from there.

**Action Item:**

- Decide if tier configuration will remain hardcoded or be migrated to a database table. If migrating, design the schema and update the feature flag logic accordingly.

---

**References:**

- See discussion in `useChatStore.ts` and related backend validation logic.
- Example scenarios and code provided above for developer clarity.
