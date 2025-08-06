# Markdown Components Documentation

## Overview

The OpenRouter Chatbot supports rich markdown rendering in LLM responses using React-Markdown with custom components and syntax highlighting.

## Features

- **GitHub Flavored Markdown (GFM)**: Tables, strikethrough, task lists, and more
- **Syntax Highlighting**: Code blocks with language-specific highlighting
- **Custom Styling**: Consistent with the application's design system
- **Security**: XSS-safe rendering with proper sanitization
- **Performance**: Memoized components for optimal rendering

## Custom Components

### CustomCodeBlock

Renders inline code and code blocks with syntax highlighting.

````tsx
// Inline code
`const example = "Hello World"`

// Code block
```javascript
function greet(name) {
  return `Hello, ${name}!`;
}
````

**Features:**

- Inline code with gray background
- Code blocks with syntax highlighting
- Dark mode support
- Overflow scrolling for long lines

### CustomTable

Renders tables with responsive design and proper styling.

```markdown
| Feature | Status | Notes           |
| ------- | ------ | --------------- |
| Tables  | ✅     | Fully supported |
| Sorting | ❌     | Not implemented |
```

**Features:**

- Responsive horizontal scrolling
- Consistent border styling
- Dark mode support

### CustomBlockquote

Renders blockquotes with left border styling.

```markdown
> This is a blockquote with proper styling
> and support for multiple lines.
```

**Features:**

- Left border accent
- Italic text styling
- Proper padding and margins

### CustomLink

Renders external links safely with security attributes.

```markdown
[Visit Example](https://example.com)
```

**Features:**

- Opens in new tab (`target="_blank"`)
- Security attributes (`rel="noopener noreferrer"`)
- Emerald color theming
- Hover effects

### CustomPreBlock

Handles pre-formatted text blocks.

**Features:**

- Consistent styling with code blocks
- Overflow handling
- Dark mode support

## Usage

The markdown renderer is automatically applied to messages with `contentType: "markdown"`. No additional configuration is needed.

### MessageList Integration

```tsx
{
  message.contentType === "markdown" ? (
    <div className="markdown-content">
      <MemoizedMarkdown>{message.content}</MemoizedMarkdown>
    </div>
  ) : (
    <p className="whitespace-pre-wrap">{message.content}</p>
  );
}
```

## Styling

Markdown content uses the `markdown-content` wrapper class with custom styles defined in `globals.css`:

- Consistent typography scaling
- Proper spacing and margins
- Dark mode support
- Integration with Tailwind CSS

## Security

- **Sanitization**: React-Markdown sanitizes all HTML content
- **XSS Prevention**: No use of `dangerouslySetInnerHTML`
- **Safe Links**: External links include security attributes
- **Input Validation**: Content comes from trusted LLM APIs

## Performance

- **Memoization**: Markdown components are memoized to prevent unnecessary re-renders
- **Lazy Loading**: Ready for lazy loading implementation
- **Bundle Size**: ~80KB for react-markdown and dependencies

## Browser Support

- Modern browsers with ES2018+ support
- Mobile responsive design
- Dark mode support

## Troubleshooting

### Markdown Not Rendering

1. Check that `contentType` is set to `"markdown"`
2. Verify the message content contains valid markdown
3. Check browser console for any errors

### Styling Issues

1. Ensure `markdown-content` wrapper is present
2. Check that global CSS includes markdown styles
3. Verify Tailwind CSS is properly configured

### Performance Issues

1. Consider implementing lazy loading for large conversations
2. Monitor bundle size with webpack-bundle-analyzer
3. Use React DevTools to profile component renders

## Future Enhancements

- **Math Equations**: KaTeX support for mathematical expressions
- **Diagrams**: Mermaid.js integration for flowcharts and diagrams
- **Syntax Themes**: Customizable code highlighting themes
- **Export**: Markdown export functionality
