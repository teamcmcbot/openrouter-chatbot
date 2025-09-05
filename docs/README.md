# OpenRouter Chatbot Documentation

This directory contains comprehensive documentation for the OpenRouter Chatbot application, including architecture, APIs, operations, and guides.

## 📁 Directory Structure

### Architecture Documentation (`/architecture/`)

- **[streaming-chat-architecture.md](./architecture/streaming-chat-architecture.md)** - Comprehensive streaming chat implementation architecture
- **[redis-rate-limiting.md](./architecture/redis-rate-limiting.md)** - Redis-based rate limiting system architecture
- **[chat-history-pagination-and-lazy-loading.md](./architecture/chat-history-pagination-and-lazy-loading.md)** - Conversation pagination and lazy message loading design
- Technical design documents and system architecture guides

### API Documentation (`/api/`)

- **[streaming-chat-api.md](./api/streaming-chat-api.md)** - Streaming chat API endpoint documentation and integration guide
- **[rate-limiting.md](./api/rate-limiting.md)** - API rate limiting behavior, headers, and client integration
- **[chat-sync.md](./api/chat-sync.md)** - Conversation sync and paginated listing API
- **[chat-messages.md](./api/chat-messages.md)** - Messages fetch/persist API for a conversation

### Operations Documentation (`/ops/`)

- **[redis-rate-limiting-setup.md](./ops/redis-rate-limiting-setup.md)** - Redis setup guide for development and production
- **[redis-rate-limiting-troubleshooting.md](./ops/redis-rate-limiting-troubleshooting.md)** - Troubleshooting guide for Redis rate limiting
- **[supabase-setup.md](./ops/supabase-setup.md)** - Supabase setup: apply schema, create bucket, expose `storage` schema
- **[sentry-setup.md](./ops/sentry-setup.md)** - Server-only errors with tags (`route`, `requestId`, `model` for chat)
- **[sentry-troubleshooting.md](./ops/sentry-troubleshooting.md)** - Troubleshooting Sentry setup and missing events
- Deployment guides and operational procedures

### Component Documentation (`/components/`)

- React component usage guides and examples
- **[ChatSidebar.md](./components/ChatSidebar.md)** - Sidebar pagination and click-to-load behavior

### Database Documentation (`/database/`)

- Database schema, migrations, and query guides

### Other Guides

- **[feature-matrix.md](./feature-matrix.md)** - Comprehensive feature comparison and capabilities overview
- **[streaming-implementation-summary.md](./streaming-implementation-summary.md)** - Streaming feature implementation status and testing guide
- **[sentry-implementation-summary.md](./updates/sentry-implementation-summary.md)** - Server-only Sentry integration with model tagging
- **[tiered-rate-limiting-completion-summary.md](./tiered-rate-limiting-completion-summary.md)** - Tiered rate limiting rollout summary
- **[reasoning-fixes-summary.md](./reasoning-fixes-summary.md)** - Reasoning data flow fixes and validation
- **[reasoning-empty-array-fix.md](./reasoning-empty-array-fix.md)** - Fix for reasoning display with empty arrays
- **[security-review.md](./security-review.md)** - Security implementation review including rate limiting
- **[user-settings-guide.md](./user-settings-guide.md)** - User settings and preferences
- **[subscription-tier-access.md](./subscription-tier-access.md)** - Subscription tiers and access control

## 🚀 Quick Start

### For Developers

1. **Streaming Architecture**: Understand real-time chat in [streaming-chat-architecture.md](./architecture/streaming-chat-architecture.md)
2. **Streaming API**: Integration guide in [streaming-chat-api.md](./api/streaming-chat-api.md)
3. **Set up Rate Limiting**: Follow [redis-rate-limiting-setup.md](./ops/redis-rate-limiting-setup.md)
4. **Understand Security**: Review [security-review.md](./security-review.md)

### For API Consumers

1. **Streaming Chat**: Real-time responses with [streaming-chat-api.md](./api/streaming-chat-api.md)
2. **Rate Limiting**: Understand limits and headers in [rate-limiting.md](./api/rate-limiting.md)
3. **Troubleshooting**: Common issues in [redis-rate-limiting-troubleshooting.md](./ops/redis-rate-limiting-troubleshooting.md)

### For Operations

1. **Deployment**: Setup instructions in [redis-rate-limiting-setup.md](./ops/redis-rate-limiting-setup.md)
2. **Monitoring**: Troubleshooting guide in [redis-rate-limiting-troubleshooting.md](./ops/redis-rate-limiting-troubleshooting.md)
3. **Security**: Review [security-review.md](./security-review.md)
4. **Supabase**: Follow [supabase-setup.md](./ops/supabase-setup.md) and ensure `storage` is in Exposed schemas (Data API)

## 🛡️ Rate Limiting System

The application implements comprehensive Redis-based rate limiting:

### Key Features

- **Serverless Compatible**: Works on Vercel and other serverless platforms
- **Tier-Based Limits**: Different limits for anonymous, free, pro, and enterprise users
- **Sliding Window**: Fair and accurate rate limiting
- **Cost Effective**: ~$0.01-10/month for typical usage
- **Production Ready**: Handles high traffic and provides graceful degradation

### Documentation Coverage

- **Architecture**: [/architecture/redis-rate-limiting.md](./architecture/redis-rate-limiting.md)
- **Setup Guide**: [/ops/redis-rate-limiting-setup.md](./ops/redis-rate-limiting-setup.md)
- **API Reference**: [/api/rate-limiting.md](./api/rate-limiting.md)
- **Troubleshooting**: [/ops/redis-rate-limiting-troubleshooting.md](./ops/redis-rate-limiting-troubleshooting.md)
- **Security Review**: [/security-review.md](./security-review.md)

## 📋 Recently Updated

### Account Banning (Latest)

- ✅ Chat-only ban policy with centralized enforcement and admin endpoints
- 📄 Summary: [updates/account-banning-completion-summary.md](./updates/account-banning-completion-summary.md)
- 🔐 Reference: [api/auth-middleware.md](./api/auth-middleware.md), [architecture/auth-snapshot-caching.md](./architecture/auth-snapshot-caching.md)

### Redis Rate Limiting Implementation (Latest)

- ✅ **Architecture Documentation**: Complete technical overview with diagrams
- ✅ **Setup Guide**: Step-by-step development and production setup
- ✅ **API Documentation**: Client integration examples and best practices
- ✅ **Troubleshooting Guide**: Common issues and debugging steps
- ✅ **Security Review**: Updated with Redis rate limiting security analysis

### Summary Documents

- **[phase3-completion-summary.md](./phase3-completion-summary.md)** - Phase 3 implementation summary
- **[serverless-caching-completion-summary.md](./serverless-caching-completion-summary.md)** - Caching implementation
- **[session-title-optimization.md](./session-title-optimization.md)** - Session title optimization
- **[frontend-rate-limiting-fixes-completion-summary.md](./frontend-rate-limiting-fixes-completion-summary.md)** - Frontend rate limiting fixes

### Store Documentation (`/stores/`)

- **[useChatStore.md](./stores/useChatStore.md)** - Chat store state, pagination, and lazy-loading actions

## 🔍 Finding Documentation

### By Topic

- **Rate Limiting**: See Rate Limiting System section above
- **Authentication**: Check `/jwt/` and `/components/auth/`
- **Database**: See `/database/` directory
- **UI Components**: Check `/components/` directory
- **Analytics**: See `/admin/` directory

### By Use Case

- **Setting Up Development**: Start with setup guides in `/ops/`
- **Understanding Architecture**: Review files in `/architecture/`
- **Integrating with APIs**: Check `/api/` documentation
- **Troubleshooting Issues**: See troubleshooting guides in `/ops/`
- **Security Review**: Read `security-review.md`

## 📝 Contributing to Documentation

### Standards

- Use clear, actionable headings
- Include code examples where relevant
- Provide both development and production guidance
- Keep troubleshooting sections comprehensive
- Link related documentation

### Structure

- **Overview**: What the feature does
- **Quick Start**: Get up and running fast
- **Detailed Guide**: Comprehensive instructions
- **Examples**: Code samples and use cases
- **Troubleshooting**: Common issues and solutions
- **Reference**: Complete parameter/option lists

## 🏗️ Architecture Highlights

### Serverless-First Design

- Redis-based state management for rate limiting
- Stateless function design
- Environment-based configuration
- Graceful degradation strategies

### Security Implementation

- Tier-based access control
- Rate limiting abuse protection
- Authentication middleware patterns
- Secure environment variable management

### Performance Optimization

- Redis connection reuse
- Sliding window algorithms
- Atomic operations for consistency
- Efficient caching strategies

---

For the most current information, always check the specific documentation files as they are updated more frequently than this overview.
