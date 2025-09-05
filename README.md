# OpenRouter Chatbot

A modern, full-stack AI chat application providing secure, scalable, and feature-rich conversational AI services. Built with Next.js 15, TypeScript, Tailwind CSS, and integrated with Supabase for user management and data persistence.

## Features

### 🎨 **Modern UI & Experience**

- Clean, responsive design with dark mode support
- Real-time streaming chat with progressive response rendering
- Interactive sidebar with conversation history and management
- Mobile-first design optimized for all devices

### 💬 **Advanced Chat Capabilities**

- **Streaming Chat**: Real-time response rendering with ~90% faster perceived response time
- **Multiple AI Models**: Support for 12+ models (Anthropic Claude, OpenAI GPT-4, Google Gemini, etc.)
- **Multimodal Support**: Image attachments and analysis with vision-capable models
- **Web Search Integration**: Real-time web search with citations (Pro+ feature)
- **AI Reasoning**: Transparent AI thinking process display (Enterprise feature)
- **Image Generation**: AI-powered image creation (Enterprise feature)

### 🔐 **Authentication & Subscription Tiers**

- **Anonymous Access**: Limited chat functionality without signup
- **Free Tier**: Enhanced features with account creation
- **Pro Tier**: Advanced capabilities including web search and image attachments
- **Enterprise Tier**: Full feature access including reasoning and image generation

### ⚡ **Performance & Scalability**

- Built with Next.js 15 for optimal performance
- Redis-based caching and rate limiting
- Comprehensive test coverage (380+ tests)
- Production-ready error handling and logging
- Sentry integration for real-time error monitoring and performance tracking
- Serverless architecture optimized for Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- OpenRouter API key
- Supabase account (for user authentication and data storage)
- Upstash Redis account (for caching and rate limiting)

### Quick Setup

1. **Clone the repository:**

```bash
git clone <repository-url>
cd openrouter-chatbot
```

2. **Install dependencies:**

```bash
npm install
```

3. **Set up environment variables:**

```bash
cp .env.example .env.local
```

4. **Configure your `.env.local` file:**

```bash
# Core API Configuration
OPENROUTER_API_KEY=your_openrouter_api_key_here
BRAND_NAME=OpenRouter Chat

# Database & Authentication (Supabase)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Caching & Rate Limiting (Upstash Redis)
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token

# Security Secrets
ANON_USAGE_HMAC_SECRET=your_strong_secret_key
CRON_SECRET=your_cron_secret_key
INTERNAL_SYNC_TOKEN=your_sync_token
INTERNAL_CLEANUP_TOKEN=your_cleanup_token
```

5. **Set up Supabase database:**

   - Follow the comprehensive setup guide: [`docs/ops/supabase-setup.md`](docs/ops/supabase-setup.md)
   - Includes Google OAuth configuration, database schemas, and storage setup

6. **Run the development server:**

```bash
npm run dev
```

7. **Open [http://localhost:3000](http://localhost:3000) in your browser**

### Admin Dashboard

Access the admin dashboard at `/admin` with enterprise-level accounts for:

- User analytics and management
- Usage cost tracking and reporting
- Model performance monitoring
- System health and maintenance

### Documentation

- **Setup Guide**: `docs/ops/supabase-setup.md` - Complete Supabase configuration with Google OAuth
- **Admin Usage**: `docs/admin/dashboard-usage.md`
- **API Reference**: `docs/api/` directory
- **Architecture**: `docs/architecture/` directory
- **Deployment**: `docs/ops/` directory

## Project Structure

```
├── __mocks__/              # Test mocks and fixtures
├── components/
│   ├── analytics/          # Usage analytics and reporting
│   ├── auth/               # Authentication components
│   ├── chat/               # Core chat functionality
│   │   ├── ChatInterface.tsx
│   │   ├── MessageInput.tsx
│   │   ├── MessageList.tsx
│   │   └── AttachmentTile.tsx
│   ├── layout/             # Layout and navigation
│   ├── system/             # System-level components
│   └── ui/                 # Reusable UI components
│       ├── TierBadge.tsx
│       ├── UserSettings.tsx
│       ├── ModelDropdown.tsx
│       └── Tooltip.tsx
├── contexts/               # React contexts
├── database/               # Database schemas and policies
│   ├── schema/             # SQL table definitions
│   ├── policies/           # Supabase RLS policies
│   ├── patches/            # Database migration patches
│   └── samples/            # Sample data
├── docs/                   # Comprehensive documentation
│   ├── api/                # API endpoint documentation
│   ├── architecture/       # System architecture docs
│   ├── admin/              # Admin dashboard guides
│   ├── database/           # Database schema docs
│   └── ops/                # Deployment and operations
├── hooks/                  # Custom React hooks
├── lib/                    # Core utilities and business logic
│   ├── constants/          # Application constants
│   ├── middleware/         # API middleware (auth, rate limiting)
│   ├── supabase/           # Database client and helpers
│   ├── types/              # TypeScript type definitions
│   └── utils/              # Utility functions
├── src/app/                # Next.js App Router
│   ├── admin/              # Admin dashboard routes
│   ├── api/                # API endpoints
│   │   ├── chat/           # Chat API (streaming/non-streaming)
│   │   ├── auth/           # Authentication endpoints
│   │   ├── admin/          # Admin API endpoints
│   │   ├── analytics/      # Usage analytics API
│   │   └── usage/          # Cost tracking API
│   ├── auth/               # Authentication pages
│   ├── chat/               # Main chat interface
│   └── usage/              # Usage analytics pages
├── stores/                 # Zustand state management
├── tests/                  # Comprehensive test suite (380+ tests)
│   ├── api/                # API endpoint tests
│   ├── components/         # Component unit tests
│   ├── hooks/              # Custom hook tests
│   ├── integration/        # Integration tests
│   └── stores/             # State management tests
└── types/                  # Global TypeScript definitions
```

## Available Scripts

### Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint with strict rules

### Testing

- `npm test` - Run complete test suite (380+ tests)
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate test coverage report

### Database & Maintenance

- `npm run sync:internal` - Sync model data from OpenRouter
- `npm run cleanup:internal` - Clean up orphaned attachments
- `npm run retention:internal` - Apply data retention policies

### Security & Authentication

All internal scripts support HMAC authentication with `USE_HMAC=1` flag for production environments.

## Testing

The project maintains comprehensive test coverage with **380+ tests** using Jest and React Testing Library:

### Test Categories

- **API Tests**: Complete coverage of all endpoints including authentication, rate limiting, and tier validation
- **Component Tests**: All UI components with mock dependencies and user interaction testing
- **Hook Tests**: Custom hooks for chat streaming, authentication, and data management
- **Integration Tests**: End-to-end chat workflows, model configuration, and context management
- **Store Tests**: Zustand state management logic and persistence

### Key Test Features

- **Mocking Strategy**: Standardized mocks for Next.js, Supabase, and external dependencies
- **Authentication Testing**: Multi-tier user scenarios and permission validation
- **Streaming Tests**: Real-time chat functionality and progressive rendering
- **Rate Limiting**: Tiered rate limit enforcement and error handling
- **Error Scenarios**: Comprehensive error boundary and fallback testing

Run tests:

```bash
# Full test suite
npm test

# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage
```

## Development

### Architecture Principles

- **Security First**: Comprehensive authentication, authorization, and input validation
- **Performance Optimized**: Streaming responses, Redis caching, and serverless architecture
- **Type Safe**: Full TypeScript coverage with strict checking
- **Test Driven**: 380+ tests ensuring reliability and preventing regressions

### Code Quality Standards

- **ESLint**: Strict linting with custom rules (no console.log in app code, enforced via CI)
- **TypeScript**: Strict mode with comprehensive type definitions
- **Logging Standards**: Structured logging with privacy-safe data handling
- **Error Handling**: Comprehensive error boundaries and graceful degradation

### State Management

- **Zustand Stores**: Type-safe state management for chat, user settings, and UI state
- **Supabase Integration**: Real-time data synchronization and persistence
- **Redis Caching**: Performance optimization and rate limiting
- **Context Providers**: Theme management and authentication state

### Security Implementation

- **Multi-Tier Authentication**: Supabase Auth with tier-based access control
- **Rate Limiting**: Redis-based tiered rate limiting (10-500 requests/hour based on tier)
- **Input Validation**: Comprehensive server-side validation and sanitization
- **CORS & CSP**: Properly configured security headers and policies

## Subscription Tiers & Features

### Tier Comparison

| Feature               | Anonymous | Free    | Pro      | Enterprise |
| --------------------- | --------- | ------- | -------- | ---------- |
| **Rate Limits**       | 10/hour   | 20/hour | 200/hour | 500/hour\* |
| **Tokens/Request**    | 5,000     | 10,000  | 20,000   | 50,000     |
| **Usage Analytics**   | ❌        | ✅      | ✅       | ✅         |
| **Web Search**        | ❌        | ❌      | ✅       | ✅         |
| **Image Attachments** | ❌        | ❌      | ✅       | ✅         |
| **Image Generation**  | ❌        | ❌      | ❌       | ✅         |
| **Reasoning Mode**    | ❌        | ❌      | ❌       | ✅         |

\*Enterprise admins bypass rate limits entirely

### Supported AI Models

#### Text Generation

- **Anthropic**: Claude 3 Haiku, Claude 3.5 Sonnet
- **OpenAI**: GPT-4, GPT-4 Turbo, GPT-3.5 Turbo
- **Google**: Gemini 2.5 Flash, Gemini Pro
- **DeepSeek**: R1 series models
- **Mistral**: Small and Large variants

#### Multimodal (Vision)

- **Claude 3.5 Sonnet**: Advanced image analysis
- **GPT-4 Vision**: Image understanding and description
- **Gemini Pro Vision**: Google's multimodal capabilities

#### Reasoning Capable

- **OpenAI o1 Models**: Advanced reasoning and problem-solving
- **Claude Models**: Transparent thinking processes
- **Gemini Pro**: Reasoning effort control

## API Architecture

### Core Endpoints

- **`/api/chat`** - Non-streaming chat completions
- **`/api/chat/stream`** - Real-time streaming responses
- **`/api/auth/callback`** - Supabase authentication
- **`/api/admin/*`** - Administrative functions
- **`/api/analytics/*`** - Usage analytics and reporting
- **`/api/usage/costs`** - Cost tracking and billing data

### Security Features

- **Tiered Rate Limiting**: Redis-based with automatic tier detection
- **Request Validation**: Comprehensive input sanitization
- **Authentication Middleware**: Standardized auth patterns across all endpoints
- **Error Handling**: Structured error responses with proper HTTP codes

### Commit Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

## Deployment

### Vercel (Recommended)

1. **Connect Repository**: Link your GitHub repository to Vercel
2. **Environment Variables**: Configure all required environment variables in Vercel dashboard
3. **Database Setup**:
   - Follow [`docs/ops/supabase-setup.md`](docs/ops/supabase-setup.md) for complete setup
   - Includes Google OAuth, database schemas, and storage configuration
4. **Redis Setup**: Configure Upstash Redis for caching and rate limiting
5. **Deploy**: Automatic deployment on push to main branch

### Production Checklist

- [ ] Configure all required environment variables
- [ ] Complete Supabase setup following [`docs/ops/supabase-setup.md`](docs/ops/supabase-setup.md)
- [ ] Configure Upstash Redis for caching and rate limiting
- [ ] Set strong secrets for HMAC and authentication
- [ ] Configure Sentry for error tracking (optional)
- [ ] Set up cron jobs for maintenance tasks
- [ ] Configure custom domain and SSL
- [ ] Test all subscription tiers and features

### Performance Considerations

- **Streaming Responses**: Ensure platform supports streaming HTTP responses
- **Redis Connectivity**: Verify Redis connection for rate limiting
- **Database Connection**: Configure connection pooling for Supabase
- **Edge Functions**: Utilize edge computing for optimal latency

## Environment Variables

### Core Configuration

| Variable             | Description                         | Required |
| -------------------- | ----------------------------------- | -------- |
| `OPENROUTER_API_KEY` | OpenRouter API key for model access | ✅       |
| `BRAND_NAME`         | Application branding                | ✅       |
| `BASE_URL`           | Application base URL                | ✅       |

### Database & Authentication

| Variable                        | Description               | Required |
| ------------------------------- | ------------------------- | -------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL      | ✅       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key    | ✅       |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase service role key | ✅       |

### Caching & Rate Limiting

| Variable                   | Description                | Required |
| -------------------------- | -------------------------- | -------- |
| `UPSTASH_REDIS_REST_URL`   | Redis database URL         | ✅       |
| `UPSTASH_REDIS_REST_TOKEN` | Redis authentication token | ✅       |

### Security & Authentication

| Variable                 | Description                         | Required |
| ------------------------ | ----------------------------------- | -------- |
| `ANON_USAGE_HMAC_SECRET` | HMAC secret for anonymous analytics | ✅       |
| `CRON_SECRET`            | Vercel cron job authentication      | ✅       |
| `INTERNAL_SYNC_TOKEN`    | Internal API authentication         | ✅       |
| `INTERNAL_CLEANUP_TOKEN` | Cleanup job authentication          | ✅       |

### Feature Flags & Limits

| Variable                        | Description             | Default |
| ------------------------------- | ----------------------- | ------- |
| `CONTEXT_MESSAGE_PAIRS`         | Message context window  | `5`     |
| `NEXT_PUBLIC_MAX_MESSAGE_CHARS` | Max message length      | `20000` |
| `NEXT_PUBLIC_DEBUG_STREAMING`   | Enable streaming debug  | `0`     |
| `STREAM_MARKERS_ENABLED`        | Enable response markers | `1`     |

### Optional Integrations

| Variable             | Description                | Required |
| -------------------- | -------------------------- | -------- |
| `SENTRY_DSN`         | Error tracking integration | Optional |
| `LOG_HTTP_DRAIN_URL` | Log forwarding endpoint    | Optional |

## License

This project is open source and available under the [MIT License](LICENSE).

## Key Features Implemented

### ✅ Complete Features

- **User Authentication**: Full Supabase integration with tier-based access
- **Chat History Persistence**: Complete conversation management and sync
- **Model Selection**: 12+ AI models with dynamic configuration
- **File Upload Support**: Image attachments with vision model integration
- **Export Conversations**: Full chat history export capabilities
- **Custom System Prompts**: User-configurable AI behavior
- **Usage Analytics**: Comprehensive cost tracking and reporting
- **Admin Dashboard**: Enterprise management and monitoring tools

### 🚀 Advanced Capabilities

- **Real-time Streaming**: Progressive response rendering with 90% faster perceived response time
- **Web Search Integration**: Real-time search with citations (Pro+ feature)
- **AI Reasoning**: Transparent thinking process display (Enterprise feature)
- **Image Generation**: AI-powered image creation (Enterprise feature)
- **Multi-tier Architecture**: Anonymous, Free, Pro, and Enterprise access levels
- **Redis Rate Limiting**: Sophisticated tiered rate limiting system
- **Comprehensive Testing**: 380+ tests with full coverage

## Documentation

### Core Documentation

- **API Reference**: `docs/api/` - Complete API endpoint documentation
- **Architecture**: `docs/architecture/` - System design and technical architecture
- **Database**: `docs/database/` - Schema definitions and data models
- **Admin Guide**: `docs/admin/` - Dashboard usage and management

### Feature Documentation

- **Subscription Tiers**: `docs/subscription-tier-access.md`
- **Feature Matrix**: `docs/feature-matrix.md`
- **Streaming Chat**: `docs/streaming-implementation-summary.md`
- **Security Review**: `docs/security-review.md`

### Development Guides

- **Testing Standards**: `docs/testing/` - Test patterns and best practices
- **Deployment**: `docs/ops/` - Production deployment guides
- **JWT Integration**: `docs/jwt/` - Authentication architecture

Built with ❤️ using Next.js, TypeScript, and Tailwind CSS.

### Documentation Highlights

- Web Search (UX): `docs/components/chat/web-search.md`
- Chat API (Web Search): `docs/api/chat.md`
- Chat Sync API (citations): `docs/api/chat-sync.md`
- Database (Web Search schema): `docs/database/web-search.md`
- Cost Tracking (includes websearch): `docs/database/token-cost-tracking.md`

## Recent Updates

- Account Banning: see `docs/updates/account-banning-completion-summary.md` for implementation details and links.

---
