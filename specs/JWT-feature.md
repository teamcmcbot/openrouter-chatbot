# JWT Feature: User Session, Settings, and API Security

## Overview

This document outlines the design and implementation plan for JWT-based session management, user-specific settings, and secure API access in the OpenRouter Chatbot project.

---

## 1. JWT in Supabase Auth

- Supabase Auth issues a JWT (access token) and a refresh token upon user sign-in (e.g., via Google OAuth).
- The Supabase client library manages these tokens automatically on the frontend.
- The JWT is used for authenticating requests to Supabase and custom API endpoints.

---

## 2. Session Management Enhancements

### Goals

- Implement robust JWT handling and refresh
- Secure API routes with session middleware
- Add token validation utilities
- Handle session expiry gracefully

### Implementation

- **JWT Handling:**
  - The Supabase client refreshes tokens automatically. On the backend, validate JWTs on each request.
- **Session Middleware:**
  - Create reusable middleware for API routes to extract and validate JWTs, attaching user info to the request if valid.
- **Token Validation Utilities:**
  - Utilities to extract, decode, and verify JWTs, and check expiry.
- **Session Expiry Handling:**
  - On expiry, attempt refresh; if refresh fails, sign out the user and prompt re-authentication.

---

## 3. User-Specific Settings for API Calls

### Design

- User settings (e.g., `temperature`, `system_prompt`, `default_model`) are stored in the `profiles` table in Supabase.
- On each API call (e.g., `/api/chat`), the backend:
  1. Validates the JWT and extracts the user ID (if present).
  2. Fetches user settings from Supabase (if authenticated) or uses defaults (if anonymous).
  3. Merges settings with any per-request overrides.
  4. Passes the merged settings to the OpenRouter API.

### Security

- **Do not store user settings in the JWT.** JWTs should only contain identity/claims, not dynamic preferences.
- Always fetch user settings securely on the backend using the user ID from the JWT.
- Use Supabase RLS (Row Level Security) to ensure users can only access their own settings.

---

## 4. Supabase RLS for User Settings

- RLS policies restrict access to user settings so only the authenticated user can read/update their own row.
- Example policy:
  ```sql
  CREATE POLICY "Users can read their own profile"
    ON profiles
    FOR SELECT
    USING (auth.uid() = id);
  ```

---

## 5. Performance Considerations

- Each authenticated API call involves:
  1. JWT validation (fast, local)
  2. User settings fetch from Supabase (network/db call)
- For most chat apps, this overhead is minimal compared to LLM response time.
- **Optimization:**
  - Use backend caching (e.g., Redis, in-memory) for user settings with short TTL to reduce DB hits.

---

## 6. Endpoint Flow Summary

| Step                | Authenticated User | Anonymous User |
| ------------------- | :----------------: | :------------: |
| JWT present         |        Yes         |       No       |
| Validate JWT        |        Yes         |      N/A       |
| Fetch user settings | Yes (RLS enforced) |       No       |
| Merge overrides     |        Yes         |      Yes       |
| Call OpenRouter     |        Yes         |      Yes       |

---

## 7. Best Practices

- Never trust client-supplied settings for security; always fetch from backend.
- Use JWT only for authentication/authorization, not for dynamic user data.
- Use RLS to enforce data isolation in Supabase.
- Cache user settings on the backend if performance is a concern.

---

## References

- [Supabase Auth Docs – JWT](https://supabase.com/docs/guides/auth/auth-helpers/auth-token-refresh)
- [Supabase RLS Policies](https://supabase.com/docs/guides/auth/row-level-security)
- [OpenRouter API Integration](https://openrouter.ai/docs)
