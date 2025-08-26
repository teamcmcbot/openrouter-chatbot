# Migrate getModelConfig to DB-backed source of truth

## Problem overview

The token estimation utility (`lib/utils/tokens.ts`) currently resolves model configuration (context length, description) using a server-side cached fetch of the OpenRouter public models endpoint, filtered by the environment variable `OPENROUTER_MODELS_LIST`, with a fallback to a hard-coded map.

However, the application has shifted to using the database table `model_access` as the source of truth for available models per user and tier. The `/api/models` endpoint already reads from `model_access` with tier-based filtering via `withEnhancedAuth` and returns models appropriate for the current user/tier.

Result: `getModelTokenLimits(modelId)` -> `getModelConfig(modelId)` bypasses the database and may accept models not available to the user, or out-of-date metadata (e.g., context_length), and duplicates model discovery logic. It also performs a client-side network fetch to OpenRouter from browsers in fallback paths, which is not aligned with our backend policy and can leak information.

## Desired behavior

- `getModelConfig(modelId)` should resolve model metadata exclusively from the database (`model_access`) as the canonical source.
- Server code should use a server-side helper that reads `model_access` directly (via Supabase server client), with optional caching.
- Client code should continue to prefer the Zustand model store (populated from `/api/models`), and if missing, call our own `/api/models` (not OpenRouter) to hydrate.
- No direct client/browser calls to `openrouter.ai`.
- Tier- and auth-aware behavior is preserved by reusing auth middleware on `/api/models` or by passing/inferring user context on server side.

## Impact analysis

Areas impacted:

1. `lib/utils/tokens.ts`

   - `fetchModelConfigs()` (calls OpenRouter API) — replace with DB-backed loaders.
   - `getModelConfigs()` cache layer — adapt to query DB and support auth-aware scoping.
   - `getModelConfig(modelId)` — return row from DB (or cached row) rather than OpenRouter.
   - `FALLBACK_MODEL_CONFIGS` — retain as last-resort only.
   - Client fallback path in `getModelTokenLimits()` — must hydrate from Zustand or via `/api/models`, not OpenRouter.

2. Server initialization

   - `lib/server-init.ts` uses `preloadModelConfigs()`; that should preload from DB based on a safe "union of tiers" or an admin view (or skip preload and lazy-load per request).

3. API routes using token estimation

   - `src/app/api/chat/route.ts` and `src/app/api/chat/stream/route.ts` call `getModelTokenLimits()`. These run server-side with authenticated context. We must ensure the DB-backed `getModelConfig` can access the user tier. Options:
     - A) Extend `getModelTokenLimits(modelId, authContext?)` or a new server-only helper to supply tier/user to the DB query.
     - B) Use a tier-agnostic DB lookup for the specific `modelId`, verifying it’s accessible for the user (ownership/feature middleware pattern).

4. Client hook

   - `hooks/useChatStreaming.ts` — continues to rely on Zustand cached models. If missing, it should fetch `/api/models` instead of falling back to OpenRouter (indirectly via tokens.ts). Ensure no behavioral regression.

5. Tests and docs
   - Update unit/integration tests: tokens estimation, caching behavior, client/server flows.
   - Update docs under `docs/architecture/` to reflect DB-backed source of truth.

Risk/Complexity:

- Moderate. Changes span a core utility used by both client and server. Auth context propagation to utilities must be designed carefully to avoid violating middleware standards.

## Recommended design

- Split model config fetching into two paths:

  1. Client-side: read from Zustand store; if empty, fetch `/api/models` and cache in Zustand; then resolve `modelId` config from the store.
  2. Server-side: query Supabase directly (server client) against `model_access` with constraints:
     - If user is authenticated: enforce tier rules (`is_free`, `is_pro`, `is_enterprise`) and `status='active'`.
     - If anonymous: only `is_free` and `status='active'`.

- Provide a small server-only utility (e.g., `lib/server/models.ts`) with:

  - `getServerModelConfig({ modelId, tier })` returning `{ context_length, description } | null` from `model_access`.
  - Optional in-memory cache keyed by `modelId|tier` with TTL.

- Adjust `lib/utils/tokens.ts`:

  - Remove direct `openrouter.ai` calls and `OPENROUTER_MODELS_LIST` filtering from runtime paths.
  - In `getModelTokenLimits()`, branch:
    - Client: Zustand (or fetch `/api/models` → Zustand) → resolve config.
    - Server: call `getServerModelConfig()` with inferred/accessed tier (from calling context) or conservative anonymous behavior if context not provided.
  - Keep `FALLBACK_MODEL_CONFIGS` as last resort only when DB unavailable.

- Auth context propagation:
  - Do NOT manually parse auth in utilities. For server API routes, the caller has an `AuthContext` via middleware; pass down only what’s needed (e.g., `accessLevel`/`features`/`profile.subscription_tier`) into an overload like `getModelTokenLimits(modelId, { tier: 'free'|'pro'|'enterprise' | 'anonymous' })`.

## Implementation plan (phased)

### Phase 1 — Planning and scaffolding

- [ ] Add server helper `lib/server/models.ts` with `getServerModelConfig({ modelId, tier })` query to `model_access` (status='active', tier filter), typed return.
- [ ] Add minimal in-memory cache with TTL to reduce DB round-trips.
- [ ] Add unit tests for the server helper with mocked Supabase.
- [ ] User verify: confirm query fields and tier logic match `/api/models`.

### Phase 2 — Wire server-side token estimation

- [ ] Update `getModelTokenLimits()` signature to accept optional `opts?: { tier?: 'anonymous'|'free'|'pro'|'enterprise' }` without breaking existing callers.
- [ ] On server (typeof window === 'undefined'), call `getServerModelConfig({ modelId, tier })`. If null, fallback to conservative strategy (8K) with a warning.
- [ ] Keep fallback constants for resilience only.
- [ ] Update API routes (`/api/chat` and `/api/chat/stream`) to pass the tier from injected `AuthContext` to `getModelTokenLimits()`.
- [ ] Tests: ensure server path respects tier access and returns expected context lengths.
- [ ] User verify: token estimation in API routes honors DB model_access.

### Phase 3 — Strengthen client path

- [ ] Ensure client path only uses Zustand. If cache miss, fetch `/api/models` and populate Zustand (reuse existing store fetch if available; otherwise add a fetch utility in store).
- [ ] Remove any accidental client fallback to `openrouter.ai`.
- [ ] Tests: client hook path with/without preloaded models.
- [ ] User verify: no network to openrouter.ai from browser; `/api/models` only.

### Phase 4 — Cleanup and docs

- [ ] Remove/retire `fetchModelConfigs()` OpenRouter calls from tokens util or guard them behind server-only admin tooling if still needed.
- [ ] Update `lib/server-init.ts` preload to use DB-backed preloader or remove it if not necessary.
- [ ] Update docs: `docs/architecture/tokens-estimation.md` and add a note about DB source of truth.
- [ ] User verify: sign off on docs and behavior.

## Test plan

- Unit tests
  - Server helper queries model_access and applies tier filters correctly.
  - tokens strategy computation unchanged given a context_length.
- Integration tests
  - API chat routes pass tier; server resolves context from DB.
  - Anonymous vs free vs pro vs enterprise tiers select different model availability.
  - Client fetches `/api/models` on cache miss, populates store, and uses it.
- Regression
  - Fallbacks (8K and constants) only engage when DB unavailable, not during normal runs.

## Open questions

- Should `getModelConfig` deny unknown `modelId` early (error) vs fallback to 8K? Proposed: conservative strategy with warning to avoid breaking UX; API layer may still validate model access separately.
- Cache scope for server helper: per-tier or global? Proposed: key by `modelId|tier`.
- Preloading strategy: preload a union set by tier, or lazy-load per model request? Proposed: lazy with TTL cache.
