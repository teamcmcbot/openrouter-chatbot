# Subscription tier access and feature gating

This document summarizes feature availability, rate limits, and where each rule is enforced across the app. It reflects the current implementation in both frontend and backend.

## Tiers and limits

- Anonymous (not signed in)
  - Requests/hour: 20
  - Tokens/request: 5,000
  - Rate-limit bypass: no
- Free
  - Requests/hour: 100
  - Tokens/request: 10,000
  - Rate-limit bypass: no
- Pro
  - Requests/hour: 500
  - Tokens/request: 20,000
  - Rate-limit bypass: no
- Enterprise
  - Requests/hour: 2,000
  - Tokens/request: 50,000
  - Rate-limit bypass: yes

Source of limits: `lib/utils/auth.ts` → `createFeatureFlags()`.

Rate limiting headers and enforcement: `lib/middleware/redisRateLimitMiddleware.ts`. Applied on:

- Chat: `src/app/api/chat/route.ts`
- Image uploads: `src/app/api/uploads/images/route.ts`

Per-request token validation: `lib/utils/validation.ts` → `validateRequestLimits()`; used by `src/app/api/chat/route.ts`.

## Feature gating matrix

- Web Search

  - Anonymous: Not allowed
  - Free: Not allowed
  - Pro: Allowed (max results fixed to 3)
  - Enterprise: Allowed (can configure max results)
  - Enforcement
    - Frontend: `components/chat/MessageInput.tsx` (slider disabled unless Enterprise; info tooltip explains Enterprise-only configuration)
    - Backend: `src/app/api/chat/route.ts`, `src/app/api/chat/stream/route.ts` (Pro/Enterprise only; `webMaxResults` configurable for Enterprise, forced to 3 for Pro). Error code: `FORBIDDEN` (403) for anonymous and Free users.
  - Note: `/api/chat` allows anonymous access for basic chat via enhanced auth, but the Web Search feature itself is tier-gated. Requests with `webSearch: true` from anonymous or Free users return 403.

- Reasoning mode

  - Anonymous: Not allowed
  - Free: Not allowed
  - Pro: Not allowed
  - Enterprise: Allowed (only if selected model supports reasoning)
  - Enforcement
    - Frontend: `components/chat/MessageInput.tsx`
    - Backend: `src/app/api/chat/route.ts` (Enterprise-only check and model capability re-validation). Error codes: `FORBIDDEN` (403), `BAD_REQUEST` (400)

- Image attachments (PNG, JPEG, WEBP)
  - Anonymous: Not allowed
  - Free: Not allowed
  - Pro: Allowed (≤ 10 MB each, ≤ 3 pending per message)
  - Enterprise: Allowed (≤ 10 MB each, ≤ 3 pending per message)
  - Enforcement
    - Frontend: `components/chat/MessageInput.tsx` (gates Free and Anonymous)
    - Backend: `src/app/api/uploads/images/route.ts` (Pro+ required via `withTierAuth('pro')`; MIME allowlist; size caps; pending count ≤ 3). Error codes: `AUTH_REQUIRED` (401), `FORBIDDEN` (403), `BAD_REQUEST` (400), `PAYLOAD_TOO_LARGE` (413)

Notes:

- The upload endpoint stores files in the `attachments-images` bucket and creates a row in `chat_attachments`.
- On send, the chat API validates ownership and adds signed image URLs to the last user message; see `src/app/api/chat/route.ts`.

## Where to change policies

- Tier limits (requests/hour, tokens/request, capability flags): `lib/utils/auth.ts` in `createFeatureFlags()`.
- Chat API gates (web search, reasoning, token limits): `src/app/api/chat/route.ts` (non-stream) and `src/app/api/chat/stream/route.ts` (stream).
- Image uploads gates and limits: `src/app/api/uploads/images/route.ts`.
- Authentication/tier wrappers: `lib/middleware/auth.ts` (`withEnhancedAuth`, `withProtectedAuth`, `withTierAuth`).
- Rate limiting: `lib/middleware/redisRateLimitMiddleware.ts`.
- Request validation helpers: `lib/utils/validation.ts`.

## Manual test steps

Web Search

- POST `/api/chat` with `{ webSearch: true }` while signed out → expect 403 (`FORBIDDEN`).
- POST `/api/chat` as Free with `{ webSearch: true }` → expect 403 (`FORBIDDEN`).
- POST `/api/chat` as Pro/Enterprise with `{ webSearch: true }` → expect 200 and citations when present.
- PRO only: Slider disabled in UI; backend forces `max_results = 3` even if request sends `{"webSearch": true, "webMaxResults": 5}`.
- Enterprise only: Slider enabled (1–5). Backend clamps to 1–10 and forwards `max_results = N`.

Web Search – Configurability

- In `MessageInput` settings:
  - Pro: "Max results" slider is disabled and displays 3 with an info tooltip: “Controls how many web pages are fetched. Enterprise accounts can set 1–5. Pro uses the default of 3.”
  - Enterprise: slider enabled (1–5). Value is persisted in settings and applied per message.

API behavior:

- Request body may include `webMaxResults` (number). Server behavior:
  - Enterprise: honors `webMaxResults` (default 3 if omitted); clamps to [1,10].
  - Pro: ignores provided value and forces 3.
  - Free/Anonymous: requests with `webSearch: true` are rejected (403).

Reasoning

- POST `/api/chat` as Pro with `{ reasoning: { effort: "low" } }` → expect 403 (`FORBIDDEN`).
- POST `/api/chat` as Enterprise with a model that supports reasoning → expect 200; otherwise 400 (`BAD_REQUEST`).

Image uploads

- POST multipart `/api/uploads/images` as Free → expect 403 (`FORBIDDEN`).
- POST multipart `/api/uploads/images` as Pro/Enterprise (PNG/JPEG/WEBP) ≤ 10 MB → expect 200 with `id`.
- Try ≥ 4 pending images for the same draft → expect 400 (`BAD_REQUEST`).
- Try unsupported MIME or oversize → expect 400/413 with appropriate code.

## References

- Chat API: `src/app/api/chat/route.ts`
- Image upload API: `src/app/api/uploads/images/route.ts`
- Auth middleware: `lib/middleware/auth.ts`
- Rate limit middleware: `lib/middleware/redisRateLimitMiddleware.ts`
- Feature flags and limits: `lib/utils/auth.ts`
- Validation helpers: `lib/utils/validation.ts`
- Frontend gating UI: `components/chat/MessageInput.tsx`

## Feature button UI states by tier

This section documents the expected button state and tooltip/copy for Web Search, Reasoning, and Image Attachments across all account types. It should mirror server-side enforcement: Web Search (Pro+), Reasoning (Enterprise only), Images (Pro+).

Decision order for copy and gating

1. Tier entitlement check
2. Model capability check (only relevant if tier allows the feature)
3. Auth state and CTAs (for anonymous users, surface the tier requirement and invite sign-in to upgrade)
4. Limits/validation messages (file size, pending count, rate limits)

### Anonymous (not signed in)

- Web Search button

  - State: Disabled
  - Tooltip
    - Title: Upgrade to use Web Search
    - Body: Your current plan doesn’t include web search. Available on Pro and Enterprise.
    - CTA hint: Sign in to upgrade

- Reasoning button

  - When selected model supports reasoning
    - State: Disabled
    - Tooltip: Upgrade to enable Reasoning. Reasoning is available for Enterprise accounts only.
  - When selected model does NOT support reasoning
    - State: Disabled
    - Tooltip: Selected model doesn’t support reasoning

- Image attachments button
  - When selected model supports image input
    - State: Disabled
    - Tooltip
      - Title: Upgrade to attach images
      - Body: Available on Pro and Enterprise. Sign in to upgrade.
  - When selected model does NOT support image input
    - State: Disabled
    - Tooltip: Selected model doesn’t support image input

### Free

- Web Search button

  - State: Disabled
  - Tooltip
    - Title: Upgrade to use Web Search
    - Body: Your current plan doesn’t include web search. Available on Pro and Enterprise.

- Reasoning button

  - When selected model supports reasoning
    - State: Disabled
    - Tooltip: Upgrade to enable Reasoning. Reasoning is available for Enterprise accounts only.
  - When selected model does NOT support reasoning
    - State: Disabled
    - Tooltip: Selected model doesn’t support reasoning

- Image attachments button
  - When selected model supports image input
    - State: Disabled
    - Tooltip
      - Title: Upgrade to attach images
      - Body: Available on Pro and Enterprise.
  - When selected model does NOT support image input
    - State: Disabled
    - Tooltip: Selected model doesn’t support image input

### Pro

- Web Search button

  - State: Enabled

- Reasoning button

  - When selected model supports reasoning
    - State: Disabled
    - Tooltip: Upgrade to Enterprise to enable Reasoning
  - When selected model does NOT support reasoning
    - State: Disabled
    - Tooltip: Selected model doesn’t support reasoning

- Image attachments button
  - When selected model supports image input
    - State: Enabled (limits apply: ≤ 10 MB each, ≤ 3 pending)
    - Error states: File too large (413), Too many pending (400), Unsupported MIME (400)
  - When selected model does NOT support image input
    - State: Disabled
    - Tooltip: Selected model doesn’t support image input

### Enterprise

- Web Search button

  - State: Enabled

- Reasoning button

  - When selected model supports reasoning
    - State: Enabled (model capability re-validated server-side)
  - When selected model does NOT support reasoning
    - State: Disabled
    - Tooltip: Selected model doesn’t support reasoning

- Image attachments button
  - When selected model supports image input
    - State: Enabled (limits apply: ≤ 10 MB each, ≤ 3 pending)
    - Error states: File too large (413), Too many pending (400), Unsupported MIME (400)
  - When selected model does NOT support image input
    - State: Disabled
    - Tooltip: Selected model doesn’t support image input

### Observed inconsistencies and recommended fixes

- Anonymous → Image attachments

  - Current tooltip: “Please sign in to use this feature”
  - Server reality: Uploads are Pro/Enterprise only (403 for Anonymous/Free)
  - Recommendation: Surface the tier requirement even when signed out. Example:
    - Title: Upgrade to attach images
    - Body: Available on Pro and Enterprise. Sign in to upgrade.
  - Clarifications (implemented):
    - If the selected model does NOT support images → show “Selected model doesn’t support image input.” (capability check precedes tier prompt)
    - If the selected model DOES support images → show the same “Upgrade to attach images” popover as Free (copy emphasizes Pro/Enterprise)

- Anonymous/Free → Web Search

  - Ensure copy emphasizes tier requirement (Pro/Enterprise) rather than sign-in. Example:
    - Title: Upgrade to use Web Search
    - Body: Your current plan doesn’t include web search. Available on Pro and Enterprise.

- Reasoning copy polish
  - Use a single period in messaging (avoid “Reasoning..”). Preferred:
    - Upgrade to enable Reasoning. Reasoning is available for Enterprise accounts only.
