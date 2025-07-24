# Security Report

This report summarizes a manual review of input fields, API routes and related code for potential security vulnerabilities such as XSS or SQL injection.

## Components and Input Fields Reviewed

- `components/chat/MessageInput.tsx` – user chat input
- `components/ui/ChatSidebar.tsx` – edit conversation title field
- `components/ui/ModelDropdown.tsx` – model search input
- `components/ui/ModelComparison.tsx` – model comparison search input

All of these components rely on React for rendering. Because React escapes text by default, user-provided strings are not directly interpreted as HTML. No use of `dangerouslySetInnerHTML` or similar unsafe patterns was found.

## API Routes Reviewed

- `src/app/api/chat/route.ts`
- `src/app/api/chat/messages/route.ts`
- `src/app/api/chat/sessions/route.ts`
- `src/app/api/chat/clear-all/route.ts`
- `src/app/api/chat/sync/route.ts`
- `src/app/api/generation/[id]/route.ts`
- `src/app/api/models/route.ts`
- `src/app/api/health/cache/route.ts`

These routes validate and parse request bodies using explicit checks. Database access is handled through the Supabase client with parameterized queries (e.g. `eq`, `insert`, `update`), which mitigates SQL injection risks. External requests use `fetch` with controlled URLs.

## Observations

- Markdown content is rendered with `react-markdown` without `rehypeRaw`, so HTML is escaped and scripts cannot execute.
- User supplied text like conversation titles or chat messages is stored and later rendered through React components, which escape data by default.
- No direct string concatenation is used to build SQL queries.
- Environment variables such as API keys are only referenced server side and not exposed to the client.

## Recommendations

- Continue to rely on React's escaping and avoid `dangerouslySetInnerHTML`.
- Consider additional sanitization (e.g. DOMPurify) if raw HTML ever needs to be supported in the future.
- Review rate limiting and authentication on API routes to prevent abuse.

Overall, the codebase follows common best practices for preventing XSS and SQL injection. No critical security issues were found in the reviewed areas.

## Chat Endpoint Abuse Potential

The `/api/chat` route acts as a thin wrapper around the OpenRouter completion API and forwards requests using the server's `OPENROUTER_API_KEY`. Although the request body is validated through `validateChatRequest`, the endpoint does **not** check for an authenticated user. This means any unauthenticated client could POST messages and consume the API key, effectively turning the endpoint into a free relay service.

The validation logic does restrict the model parameter if `OPENROUTER_MODELS_LIST` is defined. However, when that environment variable is left empty, any model string is accepted. Attackers could therefore use more expensive models or craft large requests.

**Recommendations**

- Require user authentication (e.g. via Supabase session) before processing chat requests.
- Implement rate limiting or per-user quotas to prevent automated abuse.
- Keep `OPENROUTER_MODELS_LIST` populated with the allowed models to avoid unexpected charges.
- Log request counts and consider abuse detection for excessive traffic.

## Sign-In Flow Review

Authentication is handled by Supabase with Google OAuth. The sign‑in modal in `components/auth/SignInModal.tsx` calls `signInWithGoogle`, which triggers the OAuth flow and exchanges the code on `/auth/callback`. Email addresses logged during auth state changes are partially masked before output. The Supabase `anon` key and project URL are exposed to the client via `NEXT_PUBLIC_` variables, which is standard and does not leak sensitive secrets.

No credentials or tokens are persisted in the client beyond what Supabase manages via cookies. The callback route redirects to `/chat` on success and `/auth/error` otherwise. There is no direct leakage of private user data in logs or responses.

**Recommendations**

- Continue masking any personal data in client or server logs.
- Ensure HTTPS is enforced in production so that Supabase session cookies are transmitted securely.
- Periodically review OAuth callback URLs in the Supabase console to prevent spoofing or malicious redirects.
