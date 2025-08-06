# Increase Rate Limits and Token Limits

## Problem

Current rate limits and token limits (e.g., `maxTokensPerRequest` = 1000) are too restrictive for many users and use cases. This results in frequent errors such as "Request exceeds token limit of 1000" and hinders user experience, especially for longer conversations or advanced users.

## Proposed Solution

- Review and increase the default values for:
  - `maxTokensPerRequest` (e.g., raise to 2000, 4000, or higher as appropriate)
  - Any related rate limits (e.g., `maxRequestsPerHour`)
- Update environment variables, configuration files, and documentation to reflect new limits.
- Ensure frontend and backend validation logic is updated accordingly (see `lib/utils/validation.ts`).
- Monitor system performance and error rates after rollout.
- **Update rate limit and token limit error messages on the UI to mention that users can sign in or upgrade to a higher tier for higher limits.**

## Acceptance Criteria

- Users can send longer messages and conversations without hitting token limit errors as frequently.
- Rate limiting errors are less common for normal usage patterns.
- All relevant code and documentation is updated.

## References

- `lib/utils/validation.ts` (token and rate limit logic)
- Error logs: "Request exceeds token limit of 1000"
- Environment/config: `OPENROUTER_MAX_TOKENS`, `maxTokensPerRequest`, etc.
