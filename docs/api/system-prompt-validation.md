# System Prompt Validation

This document describes the validation rules applied to the `model.system_prompt` field when updating user preferences via `PUT /api/user/data`.

## Summary

- Maximum length: 2000 characters (after trimming)
- Minimum length: 1 character (cannot be empty after trimming)
- Trimming applied before validation and persistence
- Security filters for HTML/script content
- Control character rejection
- Whitespace abuse prevention

## Rules

1. Length

   - 1–2000 characters after trimming
   - Requests exceeding 2000 characters are rejected with 400

2. Security Filters (rejected if any match)

   - HTML/script tags: `<script>`, `<iframe>`, `<object>`, `<embed>`
   - Inline event handlers: attributes starting with `on` (e.g., `onclick=`)
   - Protocols: `javascript:`, `data:text/html`

3. Control Characters

   - ASCII ranges: 0–8, 11–12, 14–31, and 127 are not allowed

4. Excessive Whitespace
   - More than 50 consecutive spaces is not allowed
   - More than 10 consecutive newlines is not allowed

## Error Responses

The API returns `400 Bad Request` with a specific message:

- `System prompt cannot be empty`
- `System prompt must be 2000 characters or less`
- `System prompt contains unsafe content`
- `System prompt contains invalid characters`
- `Too many consecutive line breaks`
- `Too many consecutive spaces`

## Examples

### Valid

```
"You are a helpful AI assistant. Answer concisely and cite sources when possible."
```

### Invalid (too long)

- 2500 characters of text

### Invalid (unsafe content)

```
"<script>alert('xss')</script>"
```

### Invalid (control chars)

- Contains ASCII 0x07 (bell)

## Client-Side Behavior

- The editor prevents typing beyond 2000 characters
- Real-time validation mirrors server rules
- On paste, content is truncated to the maximum and a warning toast is shown
- Save button is disabled when invalid or empty

## Server-Side Behavior

- Server is authoritative; client validation is for UX only
- Input is trimmed and revalidated server-side
- On failure, returns 400 with specific message, and no DB changes are made

## Related

- API: `/docs/api/user-data-endpoint.md` (PUT /api/user/data)
- UI: `/docs/components/ui/UserSettings.md` (Preferences > System Prompt)
- Shared validation: `lib/utils/validation/systemPrompt.ts`
