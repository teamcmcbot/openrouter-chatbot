# OpenRouter User Tracking

This app can send a stable user identifier to OpenRouter on chat completion requests to improve routing, personalization, and analytics.

- Scope: Only applies to OpenRouter chat/completions requests made via `lib/utils/openrouter.ts`.
- Identifier: Supabase `user.id` for authenticated users only. Anonymous users are never identified.
- Default: Enabled. You can disable via an env flag.

## Configuration

Set the feature flag via environment variable:

- OPENROUTER_USER_TRACKING
  - on | true | 1 | yes → enabled
  - off | false | 0 | no → disabled
  - unset → enabled by default

Example (disable in development):

```
OPENROUTER_USER_TRACKING=false
```

## Behavior

When enabled and the request is made by an authenticated user, we attach the identifier:

- Request body payload to OpenRouter includes: `user: "<supabase_user_id>"`
- If unauthenticated or the flag is disabled, the `user` field is omitted.

This logic lives in `getOpenRouterCompletion` inside `lib/utils/openrouter.ts` and is guarded so it never breaks a request if the flag or context is missing.

## Security & Privacy

- We only send the Supabase `user.id` (opaque UUID) and nothing else.
- Anonymous sessions never include a user identifier.
- You can disable at any time using `OPENROUTER_USER_TRACKING=false`.

See `docs/security-review.md` if your deployment requires stricter controls.

## Testing

Unit tests verify include/omit behavior under various conditions:

- File: `tests/lib/openrouterUserTracking.test.ts`
- Scenarios: enabled + authenticated (included), disabled (omitted), anonymous (omitted)

To run tests:

```
npm test -- tests/lib/openrouterUserTracking.test.ts
```

## Related

- `lib/utils/env.ts` → `isUserTrackingEnabled()` parsing and default behavior
- `lib/utils/openrouter.ts` → OpenRouter request builder
- `docs/api/models.md` → general model API info
