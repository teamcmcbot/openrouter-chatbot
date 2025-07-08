// Mock react-markdown for Jest testing
import React from "react";

export default function ReactMarkdown({ children, ...otherProps }) {
  // Extract plugin props that shouldn't be passed to DOM elements
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { remarkPlugins, rehypePlugins, components, ...domProps } = otherProps;

  // Basic markdown parsing for testing
  const parseMarkdown = (content) => {
    if (!content) return "";

    // First sanitize HTML to prevent XSS
    const sanitizeHtml = (html) => {
      // Remove script tags and other dangerous elements
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, "")
        .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, "")
        .replace(/<embed[^>]*>/gi, "")
        .replace(/javascript:/gi, "")
        .replace(/on\w+\s*=/gi, "");
    };

    // Sanitize the content first
    const sanitized = sanitizeHtml(content);

    // Simple transformations for testing
    let parsed = sanitized
      // Headers
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      // Bold
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      // Inline code
      .replace(/`(.+?)`/g, "<code>$1</code>")
      // Code blocks
      .replace(/```[\s\S]*?```/g, (match) => {
        const content = match.replace(/```/g, "").trim();
        return `<pre><code>${content}</code></pre>`;
      })
      // Line breaks
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br>");

    // Wrap in paragraphs if not already wrapped
    if (!parsed.startsWith("<h") && !parsed.startsWith("<pre")) {
      parsed = `<p>${parsed}</p>`;
    }

    return parsed;
  };

  const parsedContent = parseMarkdown(children);

  return React.createElement("div", {
    "data-testid": "react-markdown",
    ...domProps,
    dangerouslySetInnerHTML: { __html: parsedContent },
  });
}

export const remarkGfm = jest.fn();
export const rehypeHighlight = jest.fn();
