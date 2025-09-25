# Production Readiness Guide

Use this folder to organize everything required to take the OpenRouter Chatbot from local development to a hardened production deployment. Start with the checklist below and dive into the focused guides for deeper setup instructions.

## Documents

| File                                                                     | Purpose                                                                                                                                      |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [production-readiness-checklist.md](./production-readiness-checklist.md) | End-to-end readiness checklist with responsibilities, owners, and verification steps.                                                        |
| [vercel-deployment-guide.md](./vercel-deployment-guide.md)               | Step-by-step instructions for deploying the Next.js application to Vercel and managing environment variables, cron jobs, and build settings. |
| [supabase-production-setup.md](./supabase-production-setup.md)           | Guidance for provisioning a new Supabase project, running migrations, and configuring Google OAuth for production.                           |
| [integrations-and-secrets.md](./integrations-and-secrets.md)             | Inventory of external services (Stripe, Upstash, OpenRouter, Sentry, etc.), secrets to generate, and rotating/monitoring best practices.     |
| [stripe-production-plan.md](./stripe-production-plan.md)                 | Stripe-specific rollout plan covering account verification, API key issuance, and post-deployment tasks.                                     |

> ✅ **Recommendation:** Work through the documents in the order above. Each section calls out upstream dependencies so you know when prerequisites are satisfied.
