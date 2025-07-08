// Mock react-markdown for Jest testing
import React from "react";

export default function ReactMarkdown({ children, ...props }) {
  // Simple mock that renders content as a div with the text
  // This allows tests to find the text content
  return React.createElement("div", {
    "data-testid": "react-markdown",
    ...props,
    dangerouslySetInnerHTML: { __html: children },
  });
}

export const remarkGfm = jest.fn();
export const rehypeHighlight = jest.fn();
