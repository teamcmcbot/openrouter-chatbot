# Markdown Support Implementation Plan

## 📋 Overview

This document outlines the implementation plan for adding markdown support to the OpenRouter Chatbot's message display system. This will enable proper rendering of formatted text, code blocks, tables, and other markdown elements that LLMs often return in their responses.

## 🎯 Objectives

- Render markdown content from LLM responses
- Maintain current design aesthetics and responsiveness
- Ensure security against XSS attacks
- Support code syntax highlighting
- Maintain performance with minimal bundle size increase
- Provide fallback for plain text when needed

## 📊 Impact Analysis

### Bundle Size Impact

- **react-markdown**: ~45KB (gzipped: ~15KB)
- **remark-gfm**: ~25KB (gzipped: ~8KB)
- **rehype-highlight**: ~30KB (gzipped: ~12KB)
- **Total increase**: ~100KB raw (~35KB gzipped)

### Performance Impact

- Minimal rendering overhead for typical message sizes
- Code highlighting may add slight delay for large code blocks
- No impact on API response times

## 🔧 Required Changes

### 1. Dependencies Installation

#### New Dependencies

```json
{
  "dependencies": {
    "react-markdown": "^9.0.1",
    "remark-gfm": "^4.0.0",
    "rehype-highlight": "^7.0.0",
    "highlight.js": "^11.9.0"
  },
  "devDependencies": {
    "@tailwindcss/typography": "^0.5.10"
  }
}
```

#### Installation Commands

```bash
npm install react-markdown remark-gfm rehype-highlight highlight.js
npm install -D @tailwindcss/typography
```

### 2. Component Updates

#### 2.1 MessageList Component (`components/chat/MessageList.tsx`)

**Current Implementation:**

```tsx
<p className="whitespace-pre-wrap">{message.content}</p>
```

**New Implementation:**

```tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

// Replace message content rendering with:
<div className="markdown-content">
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    rehypePlugins={[rehypeHighlight]}
    className="prose prose-sm max-w-none dark:prose-invert"
    components={{
      // Custom component overrides
      code: CustomCodeBlock,
      pre: CustomPreBlock,
      table: CustomTable,
      blockquote: CustomBlockquote,
      a: CustomLink,
    }}
  >
    {message.content}
  </ReactMarkdown>
</div>;
```

#### 2.2 New Custom Components

**File:** `components/chat/markdown/MarkdownComponents.tsx`

```tsx
interface CustomCodeBlockProps {
  inline?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const CustomCodeBlock = ({
  inline,
  className,
  children,
  ...props
}: CustomCodeBlockProps) => {
  if (inline) {
    return (
      <code
        className="bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono"
        {...props}
      >
        {children}
      </code>
    );
  }

  return (
    <pre className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 overflow-x-auto my-2">
      <code className="text-sm font-mono" {...props}>
        {children}
      </code>
    </pre>
  );
};

export const CustomTable = ({ children, ...props }: any) => (
  <div className="overflow-x-auto my-4">
    <table
      className="min-w-full border-collapse border border-gray-300 dark:border-gray-600"
      {...props}
    >
      {children}
    </table>
  </div>
);

export const CustomBlockquote = ({ children, ...props }: any) => (
  <blockquote
    className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 py-2 my-4 italic text-gray-700 dark:text-gray-300"
    {...props}
  >
    {children}
  </blockquote>
);

export const CustomLink = ({ href, children, ...props }: any) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 underline"
    {...props}
  >
    {children}
  </a>
);
```

### 3. Configuration Updates

#### 3.1 Tailwind Configuration (`tailwind.config.ts`)

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  // ...existing config
  plugins: [
    require("@tailwindcss/typography"),
    // ...other plugins
  ],
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            maxWidth: "none",
            color: "inherit",
            a: {
              color: "rgb(16 185 129)", // emerald-500
              textDecoration: "underline",
              fontWeight: "normal",
            },
            code: {
              color: "inherit",
              backgroundColor: "rgb(243 244 246)", // gray-100
              padding: "0.25rem 0.375rem",
              borderRadius: "0.375rem",
              fontWeight: "normal",
            },
            "code::before": {
              content: '""',
            },
            "code::after": {
              content: '""',
            },
          },
        },
        invert: {
          css: {
            code: {
              backgroundColor: "rgb(55 65 81)", // gray-700
            },
          },
        },
      },
    },
  },
};

export default config;
```

#### 3.2 Global Styles (`src/app/globals.css`)

```css
/* Add highlight.js theme */
@import "highlight.js/styles/github.css";

/* Dark mode code highlighting */
@media (prefers-color-scheme: dark) {
  @import "highlight.js/styles/github-dark.css";
}

/* Custom markdown styles */
.markdown-content {
  @apply text-inherit;
}

.markdown-content h1,
.markdown-content h2,
.markdown-content h3,
.markdown-content h4,
.markdown-content h5,
.markdown-content h6 {
  @apply text-inherit font-semibold mt-4 mb-2 first:mt-0;
}

.markdown-content h1 {
  @apply text-xl;
}
.markdown-content h2 {
  @apply text-lg;
}
.markdown-content h3 {
  @apply text-base;
}

.markdown-content ul,
.markdown-content ol {
  @apply my-2 ml-4;
}

.markdown-content ul {
  @apply list-disc;
}

.markdown-content ol {
  @apply list-decimal;
}

.markdown-content p {
  @apply my-2 first:mt-0 last:mb-0;
}

.markdown-content table th {
  @apply bg-gray-50 dark:bg-gray-700 font-semibold text-left px-3 py-2 border border-gray-300 dark:border-gray-600;
}

.markdown-content table td {
  @apply px-3 py-2 border border-gray-300 dark:border-gray-600;
}
```

### 4. Type Updates

#### 4.1 Chat Message Interface (`lib/types/chat.ts`)

```typescript
export interface ChatMessage {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
  elapsed_time?: number;
  total_tokens?: number;
  contentType?: "text" | "markdown"; // New field to specify content type
}
```

#### 4.2 Chat Request/Response (`lib/types/chat.ts`)

```typescript
export interface ChatRequest {
  message: string;
  model?: string;
  preferMarkdown?: boolean; // New optional field
}

export interface ChatResponse {
  response: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  timestamp: string;
  elapsed_time: number;
  contentType?: "text" | "markdown"; // New field
}
```

### 5. API Updates

#### 5.1 Chat API Route (`src/app/api/chat/route.ts`)

**Minimal changes needed:**

````typescript
// Add content type detection
const response = await getOpenRouterCompletion(messages, selectedModel);

// Simple heuristic to detect markdown content
const hasMarkdown = /```|`[^`]+`|\*\*|\*|#{1,6}\s|\n-\s|\n\d+\.\s|\|.*\|/.test(
  response.response
);

return NextResponse.json({
  response: response.response,
  contentType: hasMarkdown ? "markdown" : "text",
  // ...rest of response
});
````

### 6. Hook Updates

#### 6.1 useChat Hook (`hooks/useChat.ts`)

```typescript
const sendMessage = useCallback(async (content: string, model?: string) => {
  // ...existing code...

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: content,
      model,
      preferMarkdown: true, // Request markdown formatting
    }),
  });

  const data = await response.json();

  const assistantMessage: ChatMessage = {
    id: crypto.randomUUID(),
    content: data.response,
    role: "assistant",
    timestamp: new Date(),
    elapsed_time: data.elapsed_time,
    total_tokens: data.usage?.total_tokens,
    contentType: data.contentType || "text", // Use detected content type
  };

  // ...rest of implementation
}, []);
```

### 7. Testing Updates

#### 7.1 Component Tests (`tests/components/MessageList.test.tsx`)

```typescript
import { render, screen } from "@testing-library/react";
import MessageList from "../../components/chat/MessageList";

describe("MessageList with Markdown", () => {
  it("renders markdown content correctly", () => {
    const messages = [
      {
        id: "1",
        content: "## Hello\n\nThis is **bold** text with `code`",
        role: "assistant" as const,
        timestamp: new Date(),
        contentType: "markdown" as const,
      },
    ];

    render(<MessageList messages={messages} isLoading={false} />);

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Hello"
    );
    expect(screen.getByText("bold")).toHaveClass("font-bold");
    expect(screen.getByText("code")).toHaveClass("font-mono");
  });

  it("renders plain text when contentType is text", () => {
    const messages = [
      {
        id: "1",
        content: "## Not a heading",
        role: "assistant" as const,
        timestamp: new Date(),
        contentType: "text" as const,
      },
    ];

    render(<MessageList messages={messages} isLoading={false} />);

    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("## Not a heading")).toBeInTheDocument();
  });
});
```

## 🚀 Implementation Phases

### Phase 1: Basic Markdown Support (1-2 days)

1. Install dependencies
2. Update MessageList component with basic ReactMarkdown
3. Add Tailwind typography plugin
4. Test basic markdown rendering

### Phase 2: Custom Styling (1 day)

1. Create custom markdown components
2. Add proper dark mode support
3. Ensure responsive design
4. Style code blocks and tables

### Phase 3: Enhanced Features (1 day)

1. Add syntax highlighting for code blocks
2. Implement content type detection
3. Add fallback for plain text
4. Performance optimizations

### Phase 4: Testing & Polish (1 day)

1. Write comprehensive tests
2. Add error boundaries
3. Performance testing
4. Documentation updates

## 🔒 Security Considerations

### XSS Prevention

- ReactMarkdown sanitizes HTML by default
- Custom components avoid `dangerouslySetInnerHTML`
- External links open in new tabs with `noopener noreferrer`

### Content Validation

- Validate markdown content size limits
- Implement content filtering if needed
- Monitor for malicious markdown patterns

## 📈 Performance Optimizations

### Code Splitting

```typescript
// Lazy load markdown components for better initial bundle size
const MarkdownRenderer = lazy(() => import("./MarkdownRenderer"));

// Use Suspense for graceful loading
<Suspense fallback={<div className="whitespace-pre-wrap">{content}</div>}>
  <MarkdownRenderer content={content} />
</Suspense>;
```

### Memoization

```typescript
const MemoizedMarkdown = memo(({ content }: { content: string }) => (
  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
));
```

## 🧪 Testing Strategy

### Unit Tests

- Component rendering with various markdown inputs
- Custom component behavior
- Content type detection logic

### Integration Tests

- End-to-end markdown rendering in chat flow
- Performance with large markdown content
- Accessibility compliance

### Visual Tests

- Screenshot comparisons for consistent rendering
- Cross-browser compatibility
- Mobile responsiveness

## 📋 Migration Checklist

### Phase 1: Foundation Setup

- [x] **Task 1.1**: Install required dependencies (react-markdown, remark-gfm, rehype-highlight, highlight.js)
- [x] **Task 1.2**: Install Tailwind typography plugin
- [x] **Task 1.3**: Update Tailwind configuration to include typography plugin
- [x] **Task 1.4**: Add highlight.js CSS imports to global styles

### Phase 2: Type System Updates

- [x] **Task 2.1**: Update ChatMessage interface to include contentType field
- [x] **Task 2.2**: Update ChatRequest interface to include preferMarkdown field
- [x] **Task 2.3**: Update ChatResponse interface to include contentType field

### Phase 3: Custom Markdown Components

- [x] **Task 3.1**: Create MarkdownComponents.tsx with CustomCodeBlock component
- [x] **Task 3.2**: Add CustomTable component for table rendering
- [x] **Task 3.3**: Add CustomBlockquote component for quote styling
- [x] **Task 3.4**: Add CustomLink component for safe external links
- [x] **Task 3.5**: Add custom markdown styles to global CSS

### Phase 4: Core Message Rendering

- [x] **Task 4.1**: Update MessageList component to conditionally render markdown
- [x] **Task 4.2**: Add fallback for plain text rendering
- [x] **Task 4.3**: Test basic markdown rendering functionality

### Phase 5: API Integration

- [x] **Task 5.1**: Update chat API route to detect markdown content
- [x] **Task 5.2**: Add content type detection logic
- [x] **Task 5.3**: Update API response to include contentType

### Phase 6: Hook Updates

- [x] **Task 6.1**: Update useChat hook to handle contentType
- [x] **Task 6.2**: Add preferMarkdown flag to API requests
- [x] **Task 6.3**: Update message creation to include contentType

### Phase 7: Testing & Validation

- [ ] **Task 7.1**: Create tests for markdown components
- [ ] **Task 7.2**: Create tests for MessageList with markdown support
- [ ] **Task 7.3**: Test content type detection
- [ ] **Task 7.4**: Test fallback to plain text

### Phase 8: Performance & Security

- [ ] **Task 8.1**: Add lazy loading for markdown renderer
- [ ] **Task 8.2**: Add memoization for performance
- [ ] **Task 8.3**: Security review for XSS prevention
- [ ] **Task 8.4**: Performance testing with large content

### Phase 9: Documentation & Polish

- [ ] **Task 9.1**: Update component documentation
- [ ] **Task 9.2**: Add usage examples
- [ ] **Task 9.3**: Final testing and bug fixes

## 🔄 Rollback Plan

If issues arise, the implementation can be quickly rolled back by:

1. Reverting MessageList component to use `whitespace-pre-wrap`
2. Removing markdown dependencies
3. Restoring original type definitions
4. Rolling back API changes

The modular approach ensures that rollback is straightforward and doesn't affect core functionality.

## 📚 Future Enhancements

### Advanced Features

- Math equation rendering with KaTeX
- Mermaid diagram support
- Custom emoji rendering
- Message export with preserved formatting

### User Preferences

- Toggle between markdown and plain text view
- Custom markdown themes
- Font size adjustments for code blocks

This implementation plan provides a comprehensive roadmap for adding robust markdown support while maintaining the application's performance, security, and user experience standards.
