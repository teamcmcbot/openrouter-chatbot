# OpenRouter Chatbot Documentation

This directory contains comprehensive documentation for the OpenRouter Chatbot application, including architecture, APIs, operations, and guides.

## 📁 Directory Structure

### Architecture Documentation (`/architecture/`)

- **[redis-rate-limiting.md](./architecture/redis-rate-limiting.md)** - Redis-based rate limiting system architecture
- Technical design documents and system architecture guides

### API Documentation (`/api/`)

- **[rate-limiting.md](./api/rate-limiting.md)** - API rate limiting behavior, headers, and client integration

### Operations Documentation (`/ops/`)

- **[redis-rate-limiting-setup.md](./ops/redis-rate-limiting-setup.md)** - Redis setup guide for development and production
- **[redis-rate-limiting-troubleshooting.md](./ops/redis-rate-limiting-troubleshooting.md)** - Troubleshooting guide for Redis rate limiting
- Deployment guides and operational procedures

### Component Documentation (`/components/`)

- React component usage guides and examples

### Database Documentation (`/database/`)

- Database schema, migrations, and query guides

### Other Guides

- **[security-review.md](./security-review.md)** - Security implementation review including rate limiting
- **[user-settings-guide.md](./user-settings-guide.md)** - User settings and preferences
- **[subscription-tier-access.md](./subscription-tier-access.md)** - Subscription tiers and access control

## 🚀 Quick Start

### For Developers

1. **Set up Rate Limiting**: Follow [redis-rate-limiting-setup.md](./ops/redis-rate-limiting-setup.md)
2. **Understand Security**: Review [security-review.md](./security-review.md)
3. **Architecture Overview**: Read [redis-rate-limiting.md](./architecture/redis-rate-limiting.md)

### For API Consumers

1. **Rate Limiting**: Understand limits and headers in [rate-limiting.md](./api/rate-limiting.md)
2. **Troubleshooting**: Common issues in [redis-rate-limiting-troubleshooting.md](./ops/redis-rate-limiting-troubleshooting.md)

### For Operations

1. **Deployment**: Setup instructions in [redis-rate-limiting-setup.md](./ops/redis-rate-limiting-setup.md)
2. **Monitoring**: Troubleshooting guide in [redis-rate-limiting-troubleshooting.md](./ops/redis-rate-limiting-troubleshooting.md)
3. **Security**: Review [security-review.md](./security-review.md)

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
