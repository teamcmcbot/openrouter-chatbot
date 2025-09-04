# GitHub Copilot Custom Instructions

## Project Overview

**OpenRouter Chatbot** is a full-stack web application designed to provide secure, scalable, and user-friendly conversational AI services. It integrates with Supabase for user management and chat history, supports multiple agents and models, and offers modular components for authentication, chat UI, and context management. The app is built for extensibility, allowing rapid prototyping and deployment of new features, with a strong focus on database integrity, workflow automation, and developer collaboration.

## Current Project Structure

```
openrouter-chatbot/
├── .github/
│   └── copilot-instructions.md
├── AGENTS.md
├── coordinator-guide.md
├── copilot-mission.md
├── database/
│   ├── schema/
│   ├── patches/
│   ├── policies/
│   ├── samples/
│   └── README.md
├── docs/
├── issues/
├── specs/
├── backlog/
├── components/
│   ├── auth/
│   ├── chat/
│   └── ui/
├── contexts/
├── coverage/
├── hooks/
├── images/
├── lib/
├── logs/
├── public/
├── scripts/
├── src/
│   └── app/
├── stores/
├── tests/
├── package.json
├── README.md
└── ...
```

## 1. Project Layout – quick map

- `/database/schema/`  → **canonical Supabase DDL** (CREATE TABLE … scripts)
- `/database/patches/<issue_or_feature>/`  → **incremental patch SQL**
- `/issues/`, `/specs/`, `/backlog/`  → user-written problem statements & feature ideas
- `/docs/`  → end-user & developer documentation

## 2. Database workflow rules

1. **Always read existing schema** in `/database/schema/` _before_ proposing changes.
2. Identify **all dependents** (tables ↔ functions ↔ triggers ↔ views) of any object you touch.
3. Create a patch script in `/database/patches/<issue_or_feature>/` that:
   - Drops / alters objects safely.
   - Is idempotent where practical.
4. **After the user signs off** (see § 5), merge the patch into the original DDL so a fresh clone gets the latest schema in one pass.

---

## 3. Planning-phase behaviour (☑ Analyse → Plan)

When the user drops a file in `/issues`, `/specs`, or `/backlog`:

1. _Phases_ → high-level milestones.
2. _Sub-tasks_ under each phase as **Markdown checkboxes**.
3. At the end of each phase, include a user verification step as a checkbox. Before this step, provide a summary of what was implemented and clear manual-testing instructions for the user (e.g., what to check in the UI or console logs).
4. A final task to update `/docs/`.
5. **Before proceeding with the implementation plan, ask up to 5 clarifying questions to ensure requirements and constraints are fully understood.**

**Do NOT** mark any phase “complete” until the user has ticked its checkbox.

---

## 4. Coding-phase behaviour (🔨 Implement)

- Tick the checkbox in the plan.
- If reality diverges from the plan, **immediately** update the plan with new tasks and note _why_.
- Provide a **“User Test Steps”** list for that sub-task.
- Ensure `npm run build` and `npm test` passes before the user tests.

**Note:** The agent should not use `git add` or `git commit` at any stage. All code commits will be performed manually by the user after the manual testing and verification step.

---

## 5. Verification gate (✅)

- Wait for the user to confirm each _testing_ checklist.
- Only then proceed to the next sub-task or phase.
- After final user approval:
  1. Merge patch SQL back into `/database/schema/`.
  2. Add / update docs in `/docs/`.
  3. Close the issue/feature.

---

## 6. Style & etiquette

- Prefer clear, modular code; match existing language/tooling choices.
- Ask clarifying questions rather than guessing.
- Never expose secrets in code or chat.
- Always check if similar functionality has already been implemented and reuse existing code or patterns where possible (e.g., database read/write, API calls, error handling, etc.).

---

## 7. API Endpoint Security Standards

When creating new API endpoints, **ALWAYS** follow these standardized authentication patterns. **DO NOT** manually implement authentication checks.

### Required Authentication Middleware Patterns

Choose the appropriate middleware pattern based on endpoint requirements:

#### 🔒 **PROTECTED** - Requires Authentication

```typescript
import { withProtectedAuth } from "../../../../lib/middleware/auth";
import { AuthContext } from "../../../../lib/types/auth";

async function myHandler(request: NextRequest, authContext: AuthContext) {
  // User guaranteed to be authenticated with profile
  const { user, profile, features } = authContext;
  // Handler implementation...
}

export const GET = withProtectedAuth(myHandler);
```

#### 🔓 **ENHANCED** - Optional Authentication with Feature Flags

```typescript
import { withEnhancedAuth } from "../../../../lib/middleware/auth";

async function myHandler(request: NextRequest, authContext: AuthContext) {
  // Anonymous users get limited access, authenticated users get tier-based features
  if (authContext.isAuthenticated) {
    // Enhanced functionality for authenticated users
  } else {
    // Limited functionality for anonymous users
  }
}

export const GET = withEnhancedAuth(myHandler);
```

#### 🎯 **TIER-SPECIFIC** - Requires Specific Subscription Tier

```typescript
import { withTierAuth } from "../../../../lib/middleware/auth";

async function myHandler(request: NextRequest, authContext: AuthContext) {
  // Only users with 'pro' tier or higher can access
}

export const GET = withTierAuth(myHandler, "pro");
```

#### 🛡️ **CONVERSATION-PROTECTED** - Authentication + Ownership Validation

```typescript
import { withConversationOwnership } from "../../../../lib/middleware/auth";

async function myHandler(request: NextRequest, authContext: AuthContext) {
  // User authentication and conversation ownership automatically validated
}

export const POST = withConversationOwnership(myHandler);
```

#### 🌐 **PUBLIC** - Rate Limiting Only (Use Sparingly)

```typescript
import { withRedisRateLimit } from "../../../../lib/middleware/redisRateLimitMiddleware";

async function myHandler(request: NextRequest) {
  // Public endpoint with rate limiting - document security implications
}

export const GET = withRedisRateLimit(myHandler);
```

### AuthContext Interface

All protected handlers receive an `AuthContext` object:

```typescript
interface AuthContext {
  isAuthenticated: boolean; // Whether user is authenticated
  user: User | null; // Supabase user object
  profile: UserProfile | null; // User profile from database
  accessLevel: "anonymous" | "authenticated";
  features: FeatureFlags; // Tier-based permissions and limits
}
```

### Authentication Method

- **Primary**: Supabase cookies (automatic, handles web browsers)
- **Fallback**: Authorization Bearer headers (for API clients)
- **Implementation**: Handled automatically by middleware - no manual parsing required

### ❌ **NEVER DO THIS** - Manual Authentication

```typescript
// DON'T: Manual authentication checks
const {
  data: { user },
} = await supabase.auth.getUser();
if (!user) {
  return NextResponse.json({ error: "Auth required" }, { status: 401 });
}
```

### ✅ **ALWAYS DO THIS** - Use Middleware

```typescript
// DO: Use standardized middleware
export const GET = withProtectedAuth(myHandler);
// OR for rate limiting only:
export const GET = withRedisRateLimit(myHandler);
```

### Security Benefits of Middleware

- **Consistent Authentication** across all endpoints
- **Redis-Based Rate Limiting** that works in serverless environments
- **Tier-based Feature Flags** for subscription control
- **Standardized Error Handling** with proper error codes
- **Audit Logging** for security monitoring
- **Type Safety** with TypeScript interfaces

### Rate Limiting Implementation

**IMPORTANT**: Use tiered rate limiting with `withTieredRateLimit` for proper endpoint classification:

```typescript
// ✅ CORRECT: Tiered rate limiting (current system)
import { withTieredRateLimit } from "../../../../lib/middleware/redisRateLimitMiddleware";
export const POST = withProtectedAuth(
  withTieredRateLimit(myHandler, { tier: "tierA" }) // Chat endpoints
);
export const GET = withProtectedAuth(
  withTieredRateLimit(myHandler, { tier: "tierB" }) // Storage/DB endpoints
);
export const GET = withEnhancedAuth(
  withTieredRateLimit(myHandler, { tier: "tierC" }) // CRUD endpoints
);

// ❌ DEPRECATED: Single-pool rate limiting
import { withRedisRateLimit } from "../../../../lib/middleware/redisRateLimitMiddleware"; // OLD
```

**Tiered Rate Limiting System:**

- **Tier A (Chat)**: 10/20/200/500 requests/hour (most restrictive - LLM inference)
- **Tier B (Storage)**: 20/50/500/1000 requests/hour (medium - storage/DB operations)
- **Tier C (CRUD)**: 50/200/1000/2000 requests/hour (most generous - metadata/CRUD)
- **Tier D (Admin)**: 0/100/100/100 requests/hour (admin testing access, enterprise admins unlimited)

**Current Implementation:**

```typescript
const limits = {
  anonymous: { tierA: 10, tierB: 20, tierC: 50, tierD: 0 },
  free: { tierA: 20, tierB: 50, tierC: 200, tierD: 100 },
  pro: { tierA: 200, tierB: 500, tierC: 1000, tierD: 100 },
  enterprise: { tierA: 500, tierB: 1000, tierC: 2000, tierD: 100 },
  // Enterprise admins get unlimited access via bypass
};
```

**Key Features:**

- **Independent Pools**: Each tier has separate Redis keys (rate_limit:tierA:user:123)
- **Cost-Based Logic**: Higher cost operations = more restrictive limits
- **Enterprise Admin Bypass**: Unlimited for subscription_tier='enterprise' + account_type='admin'
- **Testing Support**: TierD provides admin access for testing across all subscription levels

### Reference Documentation

- See `/docs/architecture/redis-rate-limiting.md` for implementation details
- See `/docs/ops/redis-rate-limiting-setup.md` for deployment guide
- See `/specs/endpoint-protection.md` for comprehensive security analysis
- See `/lib/middleware/redisRateLimitMiddleware.ts` for middleware implementation
- See `/lib/types/auth.ts` for type definitions

---

## 8. Testing & Mocking Standards

When creating or fixing tests, **ALWAYS** follow these standardized testing patterns to ensure tests are reliable, fast, and maintainable.

### Required Test Structure

#### Test File Organization

```typescript
// tests/components/ui/ComponentName.test.tsx
import { render, screen } from "@testing-library/react";

// 1. Mock external dependencies FIRST (before component import)
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    /* router methods */
  }),
}));

jest.mock("../../../hooks/useCustomHook", () => ({
  useCustomHook: () => ({
    /* minimal mock data */
  }),
}));

// 2. Import component AFTER mocks are defined
import ComponentName from "../../../components/ui/ComponentName";

describe("ComponentName", () => {
  // Tests here
});
```

### Essential Mock Patterns

#### 🔧 **Next.js Navigation** - Always Required for Components Using useRouter

```typescript
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
```

#### 🔐 **Authentication Store** - Minimal Mock for Components Using Auth

```typescript
jest.mock("../../../stores/useAuthStore", () => ({
  useAuth: () => ({
    user: null, // or basic user object when needed
    isLoading: false,
  }),
}));
```

#### 📊 **Custom Hooks** - Use Minimal Data to Prevent Test Hangs

```typescript
jest.mock("../../../hooks/useUserData", () => ({
  useUserData: () => ({
    data: null, // Start with null, add data only when test needs it
    loading: false,
    error: null,
    updatePreferences: jest.fn(),
    forceRefresh: jest.fn(),
  }),
}));
```

#### 🍞 **Toast Notifications** - Simple Mock to Prevent Side Effects

```typescript
jest.mock("react-hot-toast", () => ({
  __esModule: true,
  default: jest.fn(),
}));
```

#### ✅ **Validation Utilities** - Mock with Expected Return Values

```typescript
jest.mock("../../../lib/utils/validation/systemPrompt", () => ({
  validateSystemPrompt: () => ({
    isValid: true,
    trimmedValue: "You are a helpful AI assistant.",
  }),
  truncateAtWordBoundary: (text: string) => text,
  SYSTEM_PROMPT_LIMITS: { MIN_LENGTH: 10, MAX_LENGTH: 1000 },
}));
```

### Testing Guidelines

#### ✅ **DO**

- **Mock external dependencies first**, before importing the component
- **Use minimal mock data** to prevent tests from hanging or being overly complex
- **Mock at the module level** using `jest.mock()` for consistency
- **Test core functionality** (rendering, basic interactions, prop handling)
- **Keep tests focused** on one specific behavior per test case
- **Use descriptive test names** that explain what is being tested

#### ❌ **DON'T**

- **Over-mock** with complex data structures unless specifically needed
- **Test implementation details** - focus on user-visible behavior
- **Create brittle tests** that break with minor UI changes
- **Use real API calls** or external dependencies in unit tests
- **Skip mocking Next.js hooks** - this will cause `invariant expected app router to be mounted` errors

### Common Test Patterns

#### Basic Component Rendering

```typescript
describe("ComponentName", () => {
  it("renders when open", () => {
    render(<ComponentName isOpen={true} onClose={() => {}} />);
    expect(screen.getByText("Expected Text")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    const { container } = render(
      <ComponentName isOpen={false} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });
});
```

#### Testing User Interactions

```typescript
import { fireEvent } from "@testing-library/react";

it("calls onClose when close button is clicked", () => {
  const mockOnClose = jest.fn();
  render(<ComponentName isOpen={true} onClose={mockOnClose} />);

  fireEvent.click(screen.getByLabelText("Close"));
  expect(mockOnClose).toHaveBeenCalled();
});
```

### Debugging Test Issues

#### Test Hangs or Runs Indefinitely

- **Cause**: Usually complex mock objects with circular references or unresolved promises
- **Solution**: Simplify mocks to return primitive values or `null`

#### "invariant expected app router to be mounted"

- **Cause**: Missing Next.js router mock
- **Solution**: Add the standardized `next/navigation` mock shown above

#### "Cannot read property of undefined"

- **Cause**: Missing mock for a hook or external dependency
- **Solution**: Add minimal mock returning expected shape

### Test Execution

Run tests with appropriate timeouts to catch hanging tests early:

```bash
# Single test file
npm test -- path/to/test.tsx

# All tests with timeout
npm test -- --testTimeout=10000

# Watch mode for development
npm test -- --watch
```

### Mock File Organization

Global mocks can be placed in `__mocks__/` directory:

- `__mocks__/next/navigation.js` - Next.js navigation mocks
- `__mocks__/@supabase/` - Supabase client mocks
- `__mocks__/react-markdown.js` - Markdown rendering mocks

Inline mocks should be used for component-specific dependencies.

---

_End of Copilot custom instructions._

## 9. Logging & Observability Standards

These rules keep production logs quiet, safe, and useful. Follow them for all new and changed code.

### Core rules

- Use the shared logger only

  - Always use `lib/utils/logger.ts` for server/API logs. Do not call `console.*` in app code.
  - Default levels: production → `warn` (WARN/ERROR only), development → `debug`.
  - Respect `LOG_LEVEL=error|warn|info|debug`.

- No `console.*` in app code

  - UI/components/hooks/stores/lib/src/app: `console.*` is disallowed.
  - Tests and scripts may use `console.*` freely.
  - ESLint and CI should fail on new `console.*` usages outside `tests/**` and `scripts/**`.

- Structured, minimal, privacy-safe

  - Emit single-line JSON with: `ts`, `level`, `msg`, `requestId`, `route`, and a small `ctx` object.
  - Do not log PII or sensitive data (no prompts, responses, headers, tokens, raw user IDs). Redact or omit.
  - Cap context sizes; prefer booleans, enums, counts, and durations over payloads.

- Request correlation

  - Generate a `requestId` per request in API handlers and include it in all related logs.
  - If practical, add `requestId` to response headers for cross-correlation during incident review.

- Keep noise down; keep signal strong
  - UI/stores: remove render-time and interaction breadcrumbs (“rendered”, “clicked”, etc.).
  - Server/API: keep WARN/ERROR; INFO/DEBUG only when necessary and controllable via level or sampling.
  - Delete commented-out debug prints instead of keeping them in code.

### Streaming and token logs

- Streaming traces

  - Use `lib/utils/streamDebug.ts` for step-by-step streaming traces.
  - Gate with `NEXT_PUBLIC_DEBUG_STREAMING` (or localStorage flag). Default off in production.

- Token usage
  - Collapse to a single INFO summary per request when helpful: `{ model, durationMs, inputTokens, outputTokens }`.
  - Use sampling for hot paths in production (1–5% typical). Keep full details at `debug` level only.

### Errors and operational events

- Errors

  - Log exactly one structured `logger.error` per failure with minimal context and `requestId`.
  - Convert any `console.error` to `logger.error`. Avoid duplicate logs for the same error.

- Operational warnings
  - Use `logger.warn` for recoverable conditions (e.g., missing optional envs at cold start, transient rate-limit backoffs) with small context.

### Optional integrations

- Sentry (errors only)

  - Use `@sentry/nextjs` for exception capture in production environments.
  - Disable performance tracing by default; set `tracesSampleRate: 0` to control costs.
  - Scrub sensitive data in `beforeSend`; do not attach prompts/responses/headers/tokens.
  - In catch blocks, do both: `Sentry.captureException(err)` and `logger.error('event', err, { requestId, route, eventId })`.

- HTTP log drain (server-only, optional)
  - Support `LOG_HTTP_DRAIN_URL` and `LOG_HTTP_DRAIN_TOKEN` to forward sampled JSON logs from the server.
  - Never forward from the browser. Always sample aggressively (e.g., ≤1% for INFO; ERROR can be unsampled).

### Do / Don’t

- Do

  - Use levels consistently: ERROR for failures, WARN for recoverable, INFO for concise summaries, DEBUG for deep details.
  - Include `requestId`, `route`, and small, redacted `ctx`.
  - Prefer counts, durations, and flags over raw payloads.
  - Use `streamDebug()` for chat streaming traces instead of ad-hoc logs.

- Don’t
  - Don’t log prompts, responses, headers, tokens, or full user identifiers.
  - Don’t add `console.log` in components, stores, or server code.
  - Don’t leave commented-out debug logs in the codebase.

### Example patterns

Server/API summary (sampled INFO):

```ts
// inside an API handler
const t0 = Date.now();
const requestId = crypto.randomUUID();
// ... handler work ...
logger.info("chat.request.end", {
  requestId,
  route: "/api/chat",
  ctx: { model, durationMs: Date.now() - t0, inputTokens, outputTokens },
});
```

Error with Sentry and logger:

```ts
try {
  // ...
} catch (err) {
  const eventId = Sentry.captureException(err);
  logger.error("chat.request.fail", err, {
    requestId,
    route: "/api/chat",
    ctx: { eventId },
  });
  // ... return 500 ...
}
```

Streaming debug (client or server):

```ts
import { streamDebug } from "@/lib/utils/streamDebug";
streamDebug("delta", { chunkBytes: 128 }); // only prints when flag enabled
```

### PR checklist for logging

- No new `console.*` in app code; tests/scripts only.
- All server/API logs use `lib/utils/logger.ts` with structured JSON.
- No sensitive data in logs; context is small and redacted.
- Errors produce one `logger.error` with `requestId` (and Sentry event if enabled).
- Streaming/token verbosity is gated behind flags and/or level. INFO summaries are sampled in prod.
- ESLint passes `no-console` rule for app code; CI is green.
