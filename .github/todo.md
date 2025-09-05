Chatbot todo:

- [x] Error banner styling
- [x] Chat history, load more
- [x] Is active handling, remove is_active in db, client side cache for conversation/messages/is_active
- [x] Chat messages is streaming db
- [ ] Conversation syncing brainstorm, multi-sessions, multi-device, account sharing.. etc
- [x] Admin analytics, models usage, users usage, chat messages errors, new users sign up
- [x] Anonymous user’s usage and analytics is not tracked.
- [x] Attachments toast error when > ATTACHMENT_CAP
- [x] Remove attachment without hover on mobile
- [x] Edit conversation title, delete conversation on mobile
- [x] User monitoring, account banning.
- [x] Logging in prod?
- [x] Console and terminal logs clean up, use logger.debug instead of console.log?
- [x] Sentry integration, server side only for now.
- [ ] Landing page
- [ ] Stripe payment? Account upgrade, billing.
- [x] Model sync not properly detecting “new” models.
- [ ] Upload images migration to UploadThings?
- [ ] Brainstorm tokens/request. Very hard to estimate and enforce especially with reasoning, attachments, web search etc
- [ ] Proper supabase setup, local + GitHub integration + supabase mcp?
- [ ] Database cleanup, unused tables, columns, functions etc..
- [ ] Production readiness check

- [ ] Gemini image model, can OpenRouter use those model to generate image?
- [x] Why is this message showing? `I'm currently not available. The backend API is being developed by Gemini CLI. Please check back later!`
