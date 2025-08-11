# Security Review for Markdown Implementation

## XSS Prevention

### ✅ Built-in Protections

1. **React-Markdown Sanitization**: React-markdown sanitizes HTML by default and prevents script injection
2. **Custom Components**: All custom components avoid `dangerouslySetInnerHTML`
3. **External Links**: Links properly use `rel="noopener noreferrer"` to prevent window.opener attacks

### ✅ Security Features Implemented

- **Target="\_blank" with Security**: External links open in new tabs with proper rel attributes
- **Content Validation**: Only renders markdown through safe React components
- **No Direct HTML**: No use of `dangerouslySetInnerHTML` anywhere in the implementation

### ✅ Additional Security Considerations

- **Input Validation**: Content comes from trusted LLM APIs
- **Size Limits**: Message content has practical size limits from API responses
- **No User HTML Input**: Users cannot directly input HTML, only plain text

## Conclusion

The markdown implementation follows security best practices and is safe for production use.

---

## Internal Job Endpoint Security (New)

- Internal endpoints (e.g., `/api/internal/sync-models`) are not user-facing and must not depend on cookies.
- Authentication is enforced via:
  - Authorization: `Bearer INTERNAL_SYNC_TOKEN`, or
  - `X-Signature` HMAC-SHA256 over the raw request body using `INTERNAL_SYNC_SECRET`.
- Benefits:
  - Consistent authorization independent of browser context
  - Tamper detection with HMAC where used
  - Standardized error handling and timing-safe comparisons
- Recommendations:
  - Rotate secrets periodically and store them only in server-side env.
  - Use a scheduler (Vercel Cron or Supabase Edge Function) that injects the secret header.
  - Keep rate limiting enabled at the middleware or platform edge where possible.

---

## Database Hardening (Phase 4)

- FORCE RLS enabled on `public.model_access` and `public.model_sync_log` to enforce policy checks even for default roles.
- RPCs that modify data continue to use SECURITY DEFINER with narrow scope.

## Auditability (Phase 4)

- Admin/system actions are logged to `public.admin_audit_log` via `public.write_admin_audit` (SECURITY DEFINER).
- `actor_user_id` is nullable to allow system/scheduled entries; RLS allows SELECT only to admins and denies direct INSERTs.
