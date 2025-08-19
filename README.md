# OpenRouter Chatbot

A modern, responsive web application for interacting with various AI models through the OpenRouter API. Built with Next.js 15, TypeScript, and Tailwind CSS.

## Features

- 🎨 **Modern UI**: Clean, responsive design with dark mode support
- 💬 **Real-time Chat**: Interactive chat interface with message history
- 🔄 **Multiple Models**: Support for various AI models through OpenRouter
- 📱 **Mobile-First**: Fully responsive design that works on all devices
- 🧪 **Well-Tested**: Comprehensive test coverage with Jest and React Testing Library
- ⚡ **Fast & Reliable**: Built with Next.js 15 for optimal performance
- 🎯 **TypeScript**: Full type safety throughout the application
- 🎨 **Tailwind CSS**: Utility-first CSS framework for rapid UI development

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- OpenRouter API key

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd openrouter-chatbot
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
cp .env.example .env.local
```

4. Edit `.env.local` and add your OpenRouter API key:

```bash
OPENROUTER_API_KEY=your_actual_api_key_here
OPENROUTER_API_MODEL=deepseek/deepseek-r1-0528:free
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MAX_TOKENS=5000
```

`.env.local` is ignored by Git and automatically loaded by Next.js. Use it to
override any environment variables for your local setup without committing them
to the repository.

5. Run the development server:

```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Admin & Scheduler Docs

- Admin Dashboard usage: `docs/admin/dashboard-usage.md`
- Internal scheduled sync endpoint: `docs/api/internal-sync-models.md`

## Project Structure

```
├── __mocks__/         # Test mocks
├── components/
│   ├── chat/           # Chat-related components
│   │   ├── ChatInterface.tsx
│   │   ├── MarkdownRenderer.tsx
│   │   ├── MessageContent.tsx
│   │   ├── MessageInput.tsx
│   │   ├── MessageList.tsx
│   │   └── markdown/
│   │       └── MarkdownComponents.tsx
│   └── ui/             # Reusable UI components
│       ├── Button.tsx
│       ├── ChatSidebar.tsx
│       ├── ErrorBoundary.tsx
│       ├── ErrorDisplay.tsx
│       ├── Input.tsx
│       ├── Loading.tsx
│       ├── ModelComparison.tsx
│       ├── ModelDetailsSidebar.tsx
│       └── ModelDropdown.tsx
├── hooks/              # Custom React hooks
├── lib/                # Utilities and types
├── public/             # Static assets
├── src/
│   └── app/            # Next.js app directory
│       ├── (app)/      # Main routes
│       ├── api/        # Route handlers
│       ├── chat/
│       └── test-env/
├── stores/             # Zustand stores
└── tests/              # Test files
    ├── components/
    ├── hooks/
    ├── integration/
    ├── stores/
    └── utils/
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm test` - Run Jest tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report

## Testing

The project includes comprehensive test coverage using Jest and React Testing Library:

- **Component Tests**: All UI components are thoroughly tested
- **Hook Tests**: Custom hooks have full test coverage
- **Integration Tests**: Chat functionality is tested end-to-end

Run tests with:

```bash
npm test
```

## Development

### Code Style

- **TypeScript**: Strict type checking enabled
- **ESLint**: Configured with Next.js and TypeScript rules
- **Prettier**: Code formatting (configure as needed)

### Component Architecture

- **Atomic Design**: Components organized by complexity (UI → Feature → Page)
- **Custom Hooks**: Business logic extracted into reusable hooks
- **TypeScript**: Full type safety with interfaces and strict mode

### State Management

- **Zustand Stores**: Centralized and persistent state for chat, settings, and UI
- **React State**: Local component state for UI interactions
- **Custom Hooks**: Encapsulate shared logic (chat, localStorage)

## API Integration

The app integrates with OpenRouter API to provide access to various AI models:

- **Models Supported**: Any model available through OpenRouter
- **Rate Limiting**: Handled gracefully with user feedback
- **Error Handling**: Comprehensive error states and retry mechanisms

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass (`npm test`)
6. Commit your changes (`git commit -m 'feat: add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

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

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main

### Other Platforms

The app can be deployed to any platform that supports Next.js:

- Netlify
- AWS Amplify
- Railway
- Heroku

## Environment Variables

| Variable                           | Description                         | Default                          |
| ---------------------------------- | ----------------------------------- | -------------------------------- |
| `OPENROUTER_API_KEY`               | Your OpenRouter API key             | Required                         |
| `OPENROUTER_API_MODEL`             | Default model to use                | `deepseek/deepseek-r1-0528:free` |
| `OPENROUTER_MODELS_LIST`           | Comma separated list of models      | See `.env.example`               |
| `OPENROUTER_BASE_URL`              | OpenRouter API base URL             | `https://openrouter.ai/api/v1`   |
| `OPENROUTER_MAX_TOKENS`            | Maximum tokens per response         | `1000`                           |
| `CONTEXT_MESSAGE_PAIRS`            | Number of message pairs for context | `5`                              |
| `CONTEXT_RATIO`                    | Ratio of context tokens             | `0.6`                            |
| `OUTPUT_RATIO`                     | Ratio of output tokens              | `0.4`                            |
| `RESERVE_TOKENS`                   | Tokens reserved for system prompts  | `150`                            |
| `NEXT_PUBLIC_ENABLE_CONTEXT_AWARE` | Expose context-aware flag to client | `true`                           |

## License

This project is open source and available under the [MIT License](LICENSE).

## Support

If you encounter any issues or have questions:

1. Check the [Issues](../../issues) page
2. Create a new issue with detailed information
3. Include steps to reproduce the problem

## Roadmap

- [ ] User authentication and chat history persistence
- [ ] Model selection in UI
- [ ] File upload support
- [ ] Export chat conversations
- [ ] Custom system prompts
- [ ] Usage analytics and cost tracking

---

Built with ❤️ using Next.js, TypeScript, and Tailwind CSS.
