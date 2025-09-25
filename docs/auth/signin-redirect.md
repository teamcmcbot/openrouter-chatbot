# Sign-in Redirect Behavior

This guide documents the post-sign-in redirect mechanism used across the app, with special attention to the subscription upgrade flow.

## Goals

- Return users to the page that initiated authentication (e.g., `/account/subscription`)
- Work for OAuth, email OTP/magic links, and direct sign-in
- Enforce safety constraints on redirect targets

## Canonical flows

- Entry point: `/auth/signin`
- OAuth callback: `/auth/callback`
- Query parameter: `returnTo` (relative path only)
- Fallback cookie: `post_sign_in_redirect` (Secure, HttpOnly, SameSite=Lax, TTL≈10 minutes)

## Safety rules (`getSafeReturnTo`)

- Allow only internal paths that start with `/`
- Reject values containing `://`, `\\`, or control characters
- Cap length to 512 characters and trim whitespace
- Preserve query and hash if present

## Behavior on successful auth

1. Read `returnTo` from the current URL. If absent, read `post_sign_in_redirect` cookie.
2. Validate with `getSafeReturnTo()`.
3. If valid, `router.replace(target)`; otherwise, fallback to `/chat`.
4. Clear the cookie after use.

## OAuth specifics

- Before calling `supabase.auth.signInWithOAuth`, set `post_sign_in_redirect` to the intended target so it survives the round-trip.
- Pass `options.redirectTo = ${origin}/auth/callback?returnTo=<encoded target>` so the app can restore the destination via query when returning from the provider.

## UI integration

- Header "Sign In" links to `/auth/signin?returnTo=<current pathname+search+hash>` when a current route is available.
- Anonymous visitors on `/account/subscription` see a prompt to sign in and are routed through the same mechanism; after sign-in they land back on the subscription page.

## Testing steps (manual)

1. Visit `/account/subscription` while signed out → click Sign In → complete auth → land back on `/account/subscription` with no flicker to `/chat`.
2. Start from `/` with no `returnTo` → after auth you land on `/chat`.
3. Attempt `/auth/signin?returnTo=https://evil.com` → ignored and fallback to `/chat`.
4. Try a deep link like `/settings#billing` → after auth, you land at `/settings#billing`.

## Notes

- The legacy `contexts/AuthContext` is not required; the redirect logic lives in the current auth initializer/success flow.
- Server middleware changes are not required; the redirect happens on the client after successful sign-in.
