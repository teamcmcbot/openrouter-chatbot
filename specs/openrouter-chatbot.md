# OpenRouter Chatbot - Project Specification

## 📋 Project Overview

**Project Name**: OpenRouter Chatbot  
**Version**: 1.0.0  
**Tech Stack**: Next.js 14 (App Router), TypeScript, Tailwind CSS, OpenRouter API  
**Architecture**: Full-stack web application with modern React frontend and API backend

### Purpose

A modern, responsive chatbot web application that provides users with AI-powered conversations through OpenRouter's API. The application features a clean, intuitive interface with real-time messaging capabilities.

### Key Features

- ✅ Modern landing page with call-to-action
- ✅ Real-time chat interface
- ✅ Responsive design (mobile-first)
- ✅ Dark/light theme support
- ✅ Smooth scrolling chat history
- ✅ Loading states and error handling
- ✅ Persistent navigation across pages

---

## 🏗️ Project Structure

```
openrouter-chatbot/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── layout.tsx             # Root layout with nav & footer
│   │   ├── page.tsx               # Landing page
│   │   ├── chat/
│   │   │   └── page.tsx           # Chat interface page
│   │   ├── api/
│   │   │   └── chat/
│   │   │       └── route.ts       # Chat API endpoint
│   │   └── globals.css            # Global styles
│   │
│   └── components/                 # React components
│       ├── chat/
│       │   ├── ChatInterface.tsx  # Main chat container
│       │   ├── MessageInput.tsx   # Message input component
│       │   └── MessageList.tsx    # Message display component
│       └── ui/                    # Reusable UI components
│           ├── Button.tsx         # Button component
│           ├── Input.tsx          # Input component
│           ├── Loading.tsx        # Loading indicators
│           ├── ErrorBoundary.tsx  # Error boundary wrapper
│           └── ErrorDisplay.tsx   # Error message component
│
├── hooks/                         # Custom React hooks
│   ├── useChat.ts                # Chat state management
│   ├── useLocalStorage.ts        # Local storage utilities
│   └── useDebounce.ts            # Input debouncing
│
├── lib/                          # Utilities and types
│   ├── types/
│   │   ├── chat.ts              # Chat-related types
│   │   ├── api.ts               # API response types
│   │   ├── openrouter.ts        # OpenRouter API types
│   │   └── index.ts             # Type exports
│   └── utils/
│       ├── openrouter.ts        # OpenRouter API client
│       ├── validation.ts        # Input validation
│       ├── errors.ts            # Error handling utilities
│       ├── logger.ts            # Logging utilities
│       ├── response.ts          # API response helpers
│       └── env.ts               # Environment validation
│
├── tests/                        # Test files
│   ├── components/              # Component tests
│   ├── hooks/                   # Hook tests
│   ├── api/                     # API tests
│   └── integration/             # Integration tests
│
├── public/                       # Static assets
│   ├── next.svg
│   ├── vercel.svg
│   └── [other-icons].svg
│
├── specs/                        # Project documentation
│   └── openrouter-chatbot.md   # This file
│
├── package.json                  # Dependencies and scripts
├── next.config.ts               # Next.js configuration
├── tailwind.config.ts           # Tailwind CSS configuration
├── tsconfig.json                # TypeScript configuration
├── eslint.config.mjs            # ESLint configuration
├── jest.config.js               # Jest testing configuration
├── jest.setup.js                # Jest setup file
├── postcss.config.mjs           # PostCSS configuration
├── .env.local                   # Environment variables (local)
├── .env.example                 # Environment template
└── README.md                    # Project README
```

---

## 🔌 API Endpoints

### Chat API

**Endpoint**: `POST /api/chat`  
**Description**: Send a message to the AI and receive a response

#### Request Format

```typescript
interface ChatRequest {
  message: string; // User's message (required)
  model?: string; // AI model selection (optional)
  temperature?: number; // Response creativity (0-1)
  max_tokens?: number; // Maximum response length
}
```

#### Response Format

```typescript
interface ChatResponse {
  response: string; // AI's response message
  model?: string; // Model used for response
  usage?: {
    // Token usage information
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: string; // Error message if request failed
}
```

#### HTTP Status Codes

- **200 OK**: Successful chat response
- **400 Bad Request**: Invalid request format or missing message
- **401 Unauthorized**: Invalid or missing API key
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server or OpenRouter API error

#### Example Request

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, how are you today?",
    "model": "anthropic/claude-3-haiku",
    "temperature": 0.7
  }'
```

#### Example Response

```json
{
  "response": "Hello! I'm doing well, thank you for asking. How can I help you today?",
  "model": "anthropic/claude-3-haiku",
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 18,
    "total_tokens": 30
  }
}
```

#### Error Response

```json
{
  "error": "Invalid message format. Message cannot be empty.",
  "code": "INVALID_MESSAGE"
}
```

---

## 📊 Data Models

### Chat Message

```typescript
interface ChatMessage {
  id: string; // Unique message identifier
  content: string; // Message text content
  role: "user" | "assistant"; // Message sender
  timestamp: Date; // When message was sent
  model?: string; // AI model used (for assistant messages)
  tokens?: number; // Token count (for assistant messages)
}
```

### Chat Session

```typescript
interface ChatSession {
  id: string; // Session identifier
  messages: ChatMessage[]; // Array of messages
  createdAt: Date; // Session start time
  lastActivity: Date; // Last message time
  totalTokens: number; // Total tokens used
}
```

### OpenRouter API Configuration

```typescript
interface OpenRouterConfig {
  apiKey: string; // OpenRouter API key
  baseUrl: string; // API base URL
  defaultModel: string; // Default AI model
  maxTokens: number; // Default max tokens
  temperature: number; // Default temperature
  timeout: number; // Request timeout (ms)
}
```

---

## 🌐 Frontend Components

### Page Components

#### Landing Page (`/`)

- **File**: `src/app/page.tsx`
- **Features**: Hero section, feature cards, call-to-action buttons
- **Navigation**: Links to chat page
- **Responsive**: Mobile-first design

#### Chat Page (`/chat`)

- **File**: `src/app/chat/page.tsx`
- **Features**: Full-height chat interface
- **Components**: ChatInterface wrapper
- **State**: Manages chat session

### Core Chat Components

#### ChatInterface

- **File**: `components/chat/ChatInterface.tsx`
- **Purpose**: Main chat container and state management
- **Features**: Message list, input area, error handling
- **Hooks**: useChat for state management

#### MessageList

- **File**: `components/chat/MessageList.tsx`
- **Purpose**: Display chat messages with auto-scroll
- **Features**: Message bubbles, timestamps, loading indicators
- **Accessibility**: Proper ARIA labels

#### MessageInput

- **File**: `components/chat/MessageInput.tsx`
- **Purpose**: Message composition and sending
- **Features**: Text input, send button, enter key support
- **Validation**: Message length and content validation

### UI Components

#### Button

```typescript
interface ButtonProps {
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}
```

#### Input

```typescript
interface InputProps {
  type?: "text" | "email" | "password";
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  required?: boolean;
}
```

---

## 🔧 Configuration

### Environment Variables

```bash
# OpenRouter API Configuration
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# Application Configuration
NEXT_PUBLIC_APP_NAME=OpenRouter Chatbot
NEXT_PUBLIC_APP_VERSION=1.0.0

# Development
NODE_ENV=development
NEXT_PUBLIC_DEBUG=false

# Optional: Analytics and Monitoring
NEXT_PUBLIC_ANALYTICS_ID=your_analytics_id
SENTRY_DSN=your_sentry_dsn
```

### OpenRouter Models

Available AI models for selection:

- `anthropic/claude-3-haiku` (Fast, economical)
- `anthropic/claude-3-sonnet` (Balanced performance)
- `anthropic/claude-3-opus` (Most capable)
- `openai/gpt-4o` (Latest OpenAI model)
- `openai/gpt-3.5-turbo` (Fast and affordable)

---

## 🧪 Testing Strategy

### Component Testing

- **Framework**: React Testing Library + Jest
- **Coverage**: All UI components and user interactions
- **Location**: `tests/components/`

### API Testing

- **Framework**: Jest + Supertest
- **Coverage**: All API endpoints and error scenarios
- **Location**: `tests/api/`

### Integration Testing

- **Framework**: Playwright or Cypress
- **Coverage**: End-to-end user flows
- **Location**: `tests/integration/`

### Test Commands

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
npm run test:e2e      # End-to-end tests
```

---

## 🚀 Deployment

### Development

```bash
npm install
npm run dev           # Start development server on localhost:3000
```

### Production Build

```bash
npm run build         # Build for production
npm start            # Start production server
```

### Environment Setup

1. Copy `.env.example` to `.env.local`
2. Add your OpenRouter API key
3. Configure other environment variables as needed

### Deployment Platforms

- **Vercel**: Recommended (native Next.js support)
- **Netlify**: Alternative with edge functions
- **Railway**: Docker-based deployment
- **AWS/GCP/Azure**: Cloud platform deployment

---

## 📈 Performance Considerations

### Frontend Optimization

- Image optimization with Next.js Image component
- Code splitting with dynamic imports
- CSS optimization with Tailwind purging
- Bundle analysis and size monitoring

### API Optimization

- Request debouncing for user input
- Response caching for repeated queries
- Error retry logic with exponential backoff
- Rate limiting and quota management

### Monitoring

- Error tracking with Sentry
- Performance monitoring with Web Vitals
- API response time tracking
- User analytics with privacy compliance

---

## 🔒 Security Considerations

### API Security

- Environment variable protection
- Input validation and sanitization
- Rate limiting implementation
- CORS configuration

### Frontend Security

- XSS prevention
- Content Security Policy (CSP)
- Secure cookie handling
- User input validation

### OpenRouter Integration

- API key rotation strategy
- Request signing (if required)
- Error message sanitization
- Usage monitoring and alerts

---

## 🛠️ Development Workflow

### Git Workflow

1. Feature branches from `main`
2. Pull request reviews required
3. Automated testing on PR
4. Merge to `main` triggers deployment

### Code Quality

- ESLint configuration for code standards
- Prettier for code formatting
- TypeScript for type safety
- Pre-commit hooks for quality checks

### Documentation

- Inline code comments for complex logic
- Component documentation with examples
- API documentation with OpenAPI/Swagger
- README updates for new features

This specification serves as the single source of truth for the OpenRouter Chatbot project architecture, implementation details, and development guidelines.
