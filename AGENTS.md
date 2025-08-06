# AGENT.md

## Project Overview

This repository is a modern chatbot application powered by OpenRouter's AI models. It is designed for extensibility, maintainability, and ease of use, supporting authentication, persistent conversations, and rich UI features. The documentation in the `docs/` folder is maintained by Codex, serving as a functional documentation agent that updates and adds documentation based on code changes and feature implementations.

---

## Tech Stack

- **Next.js** (App Router) – React-based framework for SSR/SSG and routing
- **TypeScript** – Type safety across the codebase
- **Zustand** – State management for chat, auth, and UI
- **Supabase** – Authentication and database backend
- **OpenRouter API** – AI model integration for chat responses
- **Tailwind CSS** – Utility-first CSS framework for styling
- **Vercel** – Deployment platform

---

## Main Components

- **Chat Store (`stores/useChatStore.ts`)**  
  Manages chat state, conversations, messages, and sync logic.
- **Auth Store (`stores/useAuthStore.ts`)**  
  Handles user authentication and session management.
- **UI Components (`components/ui/`)**  
  Includes layout, logo, error boundary, and navigation.
- **API Integration (`lib/api/`)**  
  Handles requests to OpenRouter and Supabase endpoints.
- **Token Utilities (`lib/utils/tokens.ts`)**  
  Manages token estimation and model limits.
- **Documentation (`docs/`)**  
  Functional documentation maintained by Codex.

---

## Dependencies

- `zustand` – State management
- `@supabase/supabase-js` – Supabase client
- `next` – Next.js framework
- `react` – UI library
- `tailwindcss` – CSS framework
- `openrouter` – OpenRouter API client (custom or npm package)
- Other utility libraries as needed

---

## Documentation Best Practices

- **Structure:**

  - Organize documentation by feature and component in the `docs/` folder.
  - Use clear headings, code examples, and diagrams where helpful.

- **Format:**

  - Use Markdown (`.md`) files.
  - Start each doc with a summary and purpose.
  - Document public APIs, props, and usage patterns.
  - Include "How it works" and "How to extend" sections for major features.

- **Updating Docs:**

  - Update documentation with every significant code or feature change.
  - Reference code locations and commit hashes when documenting changes.
  - Use changelogs for tracking updates.

- **Best Practices:**
  - Keep documentation concise and up-to-date.
  - Prefer code samples over prose for clarity.
  - Document edge cases, error handling, and integration points.
  - Use consistent terminology and formatting.

---

## Example Documentation Format

````markdown
# Feature: Chat Store

## Overview

Manages chat conversations, messages, and sync logic.

## API

- `createConversation(title?: string): string`
- `sendMessage(content: string, model?: string): Promise<void>`
- ...

## Usage

```tsx
import { useChat } from "../stores/useChatStore";
const { sendMessage } = useChat();
```
````

## Extending

To add new message types, update `ChatMessage` in `lib/types/chat.ts` and relevant store logic.

```

---

## Contribution

Codex is responsible for maintaining and updating documentation.
All contributors should reference and follow the documentation standards
```
