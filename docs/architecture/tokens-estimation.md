# Token estimation and allocation – current state and recommendations (2025-08-26)

This document verifies how token estimation and allocation work today across the frontend and backend, clarifies a few misconceptions, and calls out gaps introduced by newer features (web search, reasoning, image attachments) and subscription tier limits. It closes with concrete recommendations to make the system consistent end‑to‑end.

## Verified behavior (tl;dr)

- Frontend

  - Uses model context length to pick how much conversation history to send.
  - Budget = 60% input / 40% output with 150-token reserve by default (overridable via CONTEXT_RATIO, OUTPUT_RATIO, RESERVE_TOKENS).
  - Algorithm: select recent user↔assistant pairs within token budget, then fill with older singles; fallback reductions at 80/60/40/20% if the first pass exceeds budget.
  - Token estimation uses a simple ~4 chars/token approximation + ~4 structural tokens/message.
  - Feature signals (webSearch, reasoning, image attachments) are forwarded to the backend but do not change the local input budget.

### Frontend: how much conversation is sent (with examples)

The client determines a per-request input budget from the selected model’s context window, then selects the largest possible slice of recent conversation that fits.

Step-by-step

- Get model-aware token strategy: maxInputTokens and maxOutputTokens from `getModelTokenLimits(model)`.
- Exclude the in-progress user message from “history” (it’s always included later).
- Walk messages from newest to oldest and try to include complete user→assistant pairs first.
  - For each candidate message, estimate tokens as: contentTokens (≈ ceil(chars/4)) + 4 structure tokens.
  - Keep a running total; don’t add a message (or pair) if it would exceed maxInputTokens.
- If there’s an unpaired newest user message, try to include it (still within budget).
- If budget remains and fewer than CONTEXT_MESSAGE_PAIRS pairs are included, backfill with older single messages until full.
- Build final payload as [selected history] + [current user message]. If the assembled set still exceeds budget, apply progressive fallbacks: retry selection against 80%, 60%, 40%, then 20% of maxInputTokens.

Important details

- Pair-first selection preserves dialogue coherence and reduces orphaned answers.
- CONTEXT_MESSAGE_PAIRS (default 5) caps the number of user↔assistant pairs to include even if there’s token headroom.
- Messages marked with error are excluded (and assistant messages whose linked user failed are also excluded).
- Images, web search, and reasoning flags do not change the frontend budget (they’re forwarded to the backend for access checks and processing).

Worked examples

1. 8K-context model (conservative default)

- Context length: 8,000; reserve: 150 → available = 7,850
- Ratios: 60% input, 40% output →
  - maxInputTokens ≈ 4,710
  - maxOutputTokens ≈ 3,140
- Suppose the last 4 user↔assistant pairs have estimated token costs:
  - Pair 1 (newest): user 180, assistant 420 → 600
  - Pair 2: user 250, assistant 500 → 750
  - Pair 3: user 600, assistant 900 → 1,500
  - Pair 4: user 700, assistant 1,000 → 1,700
    Running total when walking backwards:
  - Add Pair 1: 600 (<= 4,710)
  - Add Pair 2: 1,350 (<= 4,710)
  - Add Pair 3: 2,850 (<= 4,710)
  - Add Pair 4 would be 4,550; still fits (<= 4,710)
  - Add current user message: e.g., 220 → 4,770 (> 4,710) would exceed budget.
    Action: keep the 4 pairs but drop the oldest single message or, if needed, re-run fallback at 80% budget to find a fit. Typically the client removes least-recent content until total ≤ 4,710.

2. 128K-context model (e.g., GPT‑4o/4o‑mini)

- Context length: 128,000; reserve: 150 → available = 127,850
- Ratios 60/40 →
  - maxInputTokens ≈ 76,710
  - maxOutputTokens ≈ 51,140
- With such headroom, CONTEXT_MESSAGE_PAIRS often becomes the limiting factor. The client will include up to 5 pairs (by default), then, if space remains, add older singles. The assembled history plus the current user message must still be ≤ 76,710.

3. Progressive fallback in action

- Assume maxInputTokens = 10,000 and the first pass (history + current message) estimates to 12,000.
- The client retries selection against scaled budgets in order: 8,000 (80%), 6,000, 4,000, 2,000.
- At each step, it rebuilds the selection (pairs-first, then singles) and stops once the total fits. If none fit, it will send just the current message with a small safety buffer.

- Backend (both /api/chat and /api/chat/stream)
  - Derives dynamic max_tokens from the same model-aware strategy: max_tokens = strategy.maxOutputTokens (≈ 40% of model context minus reserve).
  - Validates request against subscription tier using an estimated prompt token count before calling OpenRouter.
  - Reasoning and web search are gate-checked by subscription tier; images are additionally validated for ownership and modality.
  - If no dynamic value is provided, the OpenRouter client falls back to OPENROUTER_MAX_TOKENS (currently 5000 in code; .env.example and local files may differ).

Your understanding was mostly correct: the frontend does context selection from the model’s context, and the backend chooses max_tokens from the same model-aware strategy and performs tier-based request validation. The details below clarify subtle differences and the areas that need attention.

---

## Where this logic lives

- Core utilities: `lib/utils/tokens.ts`

  - estimateTokenCount(text): ~4 chars/token (rounded up)
  - estimateMessagesTokens(messages): content tokens + 4 tokens per message overhead
  - calculateTokenStrategy(contextLength): returns { maxInputTokens, maxOutputTokens, ... } using env ratios and reserve
  - getModelTokenLimits(modelId): looks up model context length (store cache → API → fallback) and returns the strategy

- Frontend selection: `stores/useChatStore.ts`

  - On send: getModelTokenLimits(model) → getContextMessages(strategy.maxInputTokens) → estimateMessagesTokens([...context, newMessage]) → progressive reduction if over budget
  - CONTEXT_MESSAGE_PAIRS sets a cap for pair selection (default 5 if env unset)

- Backend allocation + validation:
  - `src/app/api/chat/route.ts` and `src/app/api/chat/stream/route.ts`
    - tokenStrategy = getModelTokenLimits(model)
    - dynamicMaxTokens = tokenStrategy.maxOutputTokens
    - Tier validation: estimateTokenCount of message content (text only) and compare to features.maxTokensPerRequest
  - OpenRouter client: `lib/utils/openrouter.ts`
    - Appends a root “system” prompt (and optional user system prompt) server-side before sending to OpenRouter
    - Sends max_tokens to OpenRouter (dynamic or fallback)

---

## Important nuances and mismatches

1. Tier limit checks only estimate prompt tokens and ignore several contributors

- System prompts are appended server-side in `openrouter.ts`, but the preflight tier validation computes tokens using only the provided user/assistant content. Result: under-count of tokens vs. what’s actually sent to OpenRouter.
- Structural overhead is ignored in tier checks. Frontend uses estimateMessagesTokens (+4/message), but backend tier checks mostly call estimateTokenCount(text) only.
- Image attachments become content blocks; backend tier checks only count text parts, not images, so prompt tokens are under-estimated.
- Web search adds provider-side work and sometimes extra instruction tokens; current check can’t account for it.

Impact: Requests can pass our “tokens/request” validation while actually creating larger prompts at the provider. Conversely, we may set an output max_tokens that, when added to real prompt tokens, exceeds a tier’s intended total budget.

2. dynamic max_tokens isn’t clamped by subscription tier

- dynamicMaxTokens = strategy.maxOutputTokens (≈ 40% of model context), regardless of features.maxTokensPerRequest.
- If a tier has a small per-request token allowance, the app can still ask the model for a very large output. OpenRouter will honor max_tokens, potentially exceeding “tokens/request” as we define it.

3. Feature-aware budgeting is not (yet) implemented

- Reasoning, webSearch, and images are gate-checked for access but do not alter input/output allocation. Reasoning-heavy models and multimodal prompts typically need larger budgets and/or different ratios.

4. Frontend and backend use slightly different estimators

- Frontend uses estimateMessagesTokens (content + 4/message overhead) for context selection.
- Backend tier checks mostly use estimateTokenCount over combined text (skips structure and blocks like images). This creates drift between what the frontend thinks will fit and what the backend considers acceptable.

5. Model context overrun risk is mitigated but not guaranteed

- ReserveTokens (default 150) helps, but when system prompts, images, and feature-specific overhead are added on the backend, a prompt built from a frontend-safe selection can still approach or exceed a model’s true context window.

---

## Edge cases observed

- Unknown model context length → strategy falls back to 8K (conservative), which is good; however, that can dramatically shrink budgets compared to the actual model.
- Large system prompts set in profile can push prompts over budget without being seen by the frontend.
- Attachments: up to 3 images per request are allowed and inlined as content blocks; token estimation for these is currently zero on the validation path.
- Streaming vs. non-streaming: both compute dynamic max_tokens similarly; streaming also emits metadata chunks and reasoning markers, but allocation remains the same.

---

## Recommendations (end-to-end policy)

1. Single source of truth for prompt estimation

- Add a backend utility that mirrors the frontend’s estimateMessagesTokens but supports:
  - System prompt inclusion (root + user-defined)
  - Structured message overhead (+4/message)
  - Content blocks: count text tokens; add configurable estimates per image
- Use that utility in:
  - validateChatRequestWithAuth/validateMessageContent
  - /api/chat and /api/chat/stream tier checks
  - Optional: expose a small endpoint for the frontend to retrieve the server’s computed prompt estimate prior to send (for more accurate UI messaging).

2. Tier-aware clamping of max_tokens

- Compute: promptEstimate = server-side estimate of the full prompt (including system, structure, images)
- Compute: tierBudget = features.maxTokensPerRequest (per user tier)
- Compute: allowableOutput = tierBudget - promptEstimate - reserveTokensForProviderOverhead
- Final: max_tokens = min(strategy.maxOutputTokens, max(0, allowableOutput))
- If max_tokens <= 0: reduce context on server (same progressive strategy as frontend) or respond with a clear TOKEN_LIMIT_EXCEEDED error and guidance.

3. Feature-aware adjustments

- Reasoning enabled: decrease outputRatio (e.g., from 0.4 → 0.3) or increase reserveTokens. Consider an env override: REASONING_OUTPUT_RATIO, REASONING_RESERVE.
- Images attached: add IMAGE_TOKENS_ESTIMATE per image (env driven, default e.g., 300 tokens). This accounts for multimodal encoders.
- Web search: provider plugin overhead is vague; conservatively increase reserveTokens (e.g., +200) when webSearch=true.

4. Consistent estimator across FE/BE

- Change backend tier validation to use the same “messages + structure + system + blocks” estimator as the frontend, then add image estimates and system prompts on top. This aligns accept/reject decisions with what the frontend sees and reduces surprise errors.

5. Guardrails for model context

- On the server, after computing promptEstimate, ensure: promptEstimate + max_tokens ≤ modelContextLength - safetyBuffer. If not, reduce max_tokens first; if still not feasible, progressively trim context (server-side) to guarantee compliance.

---

## Suggested implementation sketch (incremental)

- New utils in `lib/utils/tokens.ts`:
  - estimateContentBlocksTokens(blocks): counts text; adds IMAGE_TOKENS_ESTIMATE per image block
  - estimateFullPromptTokens({ messages, systemRoot, systemUser, includeStructure=true }): returns a number used server-side
- Update validation and routes:
  - Replace current estimateTokenCount-only checks with estimateFullPromptTokens
  - Compute tier-aware max_tokens per request
  - If insufficient budget, progressively trim context on the server (mirroring FE fallbacks) before calling OpenRouter
- Env configuration (document in README and .env.example):
  - CONTEXT_RATIO, OUTPUT_RATIO, RESERVE_TOKENS (existing)
  - IMAGE_TOKENS_ESTIMATE (default 300)
  - WEBSEARCH_EXTRA_RESERVE (default 200)
  - REASONING_OUTPUT_RATIO and/or REASONING_EXTRA_RESERVE

Testing focus:

- Unit tests in tests/utils/tokens.test.ts to cover feature-aware calculations and clamping
- Route tests to verify validation and clamping under tier limits for: plain, webSearch=true, reasoning on, 1–3 images

---

## Contract and success criteria

- Inputs: messages (user+assistant), system prompts, modelId, tier features (maxTokensPerRequest), feature flags (webSearch, reasoning, attachments)
- Outputs: { promptEstimate, max_tokens } that satisfy both model context window and tier limits
- Error modes: TOKEN_LIMIT_EXCEEDED when no feasible context/output combo fits tier/model; BAD_REQUEST when attachments invalid; FORBIDDEN when features gated
- Success: For any allowed request, promptEstimate + max_tokens never exceeds model context, and total tokens stay within the tier’s maxTokensPerRequest

---

## Current coverage vs. above policy

- Frontend: DONE for basic model-aware context selection; lacks feature-aware adjustments.
- Backend: PARTIAL – dynamic max_tokens from model; tier check is input-only and underestimates prompt; max_tokens not clamped by tier; no feature-aware buffers.

---

## Next steps (proposed)

1. Implement server-side full prompt estimator and tier-aware clamping of max_tokens
2. Align backend tier validation with the full estimator (system + structure + blocks)
3. Add feature-aware reserves and ratios for reasoning/webSearch/images
4. Optionally expose server-estimated prompt tokens to the UI for preflight display
5. Update docs and .env.example; add tests for new paths

Notes

- These changes are backward-compatible and can roll out behind flags.
- Start by adding estimation and clamping in /api/chat only; then port to /api/chat/stream.

---

## Appendix – references in codebase

- Frontend selection and estimates: `stores/useChatStore.ts`
- Token utilities and model strategy: `lib/utils/tokens.ts`
- Tier limits and feature flags: `lib/utils/auth.ts`, `lib/constants/tiers.ts`
- Validation: `lib/utils/validation.ts`
- Non-streaming and streaming handlers: `src/app/api/chat/route.ts`, `src/app/api/chat/stream/route.ts`
- OpenRouter client (system prompts, max_tokens, streaming): `lib/utils/openrouter.ts`

---

## Current architecture alignment (DB-backed) – 2025-08-26

- Source of truth

  - Model metadata is stored in `model_access` and accessed via `lib/server/models.ts` with a 2h in-memory TTL cache and tier-aware filters (status='active', is_free/is_pro/is_enterprise).
  - Client/UI hydrates model options from `/api/models` into Zustand; no direct OpenRouter calls in the browser.

- Token utilities split

  - Server-only: `lib/utils/tokens.server.ts` resolves token limits by reading DB model configs (via `lib/server/models.ts`) and computing the strategy from the model’s context length. Chat API routes pass the user’s subscription tier.
  - Client-safe: `lib/utils/tokens.ts` estimates using the store and hydrates via `/api/models` on cache-miss; falls back conservatively (8K) if needed.

- Security and middleware

  - API endpoints must use standardized auth middleware (protected/tiered/ownership) and tiered Redis rate limiting as documented in the repo’s security standards.

- Tests
  - Added focused unit tests:
    - `tests/lib/server/models.test.ts` – tier filters, status='active' filtering, list/item cache behaviors, error path.
    - `tests/lib/utils/tokens.server.test.ts` – DB-backed resolution, tier fallback, conservative defaults.

This section reflects the implementation currently deployed in code and complements the recommendations above for future server-side prompt estimation and tier clamping.
