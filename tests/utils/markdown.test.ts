import { detectMarkdownContent, detectMarkdownContentAdvanced } from "../../lib/utils/markdown";

describe("Markdown Content Detection", () => {
  describe("detectMarkdownContent", () => {
    it("detects code blocks", () => {
      expect(detectMarkdownContent("Here is some code:\n```javascript\nconst x = 1;\n```")).toBe(true);
      expect(detectMarkdownContent("```\nplain code block\n```")).toBe(true);
      expect(detectMarkdownContent("No code here")).toBe(false);
    });

    it("detects inline code", () => {
      expect(detectMarkdownContent("Use the `console.log()` function")).toBe(true);
      expect(detectMarkdownContent("The variable `x` is important")).toBe(true);
      expect(detectMarkdownContent("No inline code here")).toBe(false);
    });

    it("detects bold text", () => {
      expect(detectMarkdownContent("This is **bold** text")).toBe(true);
      expect(detectMarkdownContent("**Important note**")).toBe(true);
      expect(detectMarkdownContent("This is not bold")).toBe(false);
    });

    it("detects italic text", () => {
      expect(detectMarkdownContent("This is *italic* text")).toBe(true);
      expect(detectMarkdownContent("*Emphasis here*")).toBe(true);
      expect(detectMarkdownContent("This is not italic")).toBe(false);
    });

    it("detects headers", () => {
      expect(detectMarkdownContent("# Main Header")).toBe(true);
      expect(detectMarkdownContent("## Sub Header")).toBe(true);
      expect(detectMarkdownContent("### Another Header")).toBe(true);
      expect(detectMarkdownContent("Just plain text")).toBe(false);
    });

    it("detects bullet lists", () => {
      expect(detectMarkdownContent("- First item\n- Second item")).toBe(true);
      expect(detectMarkdownContent("* Item one\n* Item two")).toBe(true);
      expect(detectMarkdownContent("+ Plus item")).toBe(true);
      expect(detectMarkdownContent("No list here")).toBe(false);
    });

    it("detects numbered lists", () => {
      expect(detectMarkdownContent("1. First item\n2. Second item")).toBe(true);
      expect(detectMarkdownContent("10. Tenth item")).toBe(true);
      expect(detectMarkdownContent("No numbered list")).toBe(false);
    });

    it("detects tables", () => {
      expect(detectMarkdownContent("| Column 1 | Column 2 |\n| --- | --- |")).toBe(true);
      expect(detectMarkdownContent("|Header|Value|")).toBe(true);
      expect(detectMarkdownContent("No table here")).toBe(false);
    });

    it("detects blockquotes", () => {
      expect(detectMarkdownContent("> This is a quote")).toBe(true);
      expect(detectMarkdownContent("> Multiple\n> Line\n> Quote")).toBe(true);
      expect(detectMarkdownContent("Not a quote")).toBe(false);
    });

    it("detects links", () => {
      expect(detectMarkdownContent("Check out [this link](https://example.com)")).toBe(true);
      expect(detectMarkdownContent("[Google](https://google.com) is useful")).toBe(true);
      expect(detectMarkdownContent("No links here")).toBe(false);
    });

    it("returns false for plain text", () => {
      expect(detectMarkdownContent("Just plain text without any formatting")).toBe(false);
      expect(detectMarkdownContent("Simple sentence.")).toBe(false);
      expect(detectMarkdownContent("")).toBe(false);
    });
  });

  describe("detectMarkdownContentAdvanced", () => {
    it("uses scoring system for better accuracy", () => {
      // High score content should be detected
      const highScoreContent = "# Header\n\n**Bold text** with `code` and:\n\n- List item\n- Another item";
      expect(detectMarkdownContentAdvanced(highScoreContent)).toBe(true);

      // Low score content should not be detected
      const lowScoreContent = "Just one *word* emphasized";
      expect(detectMarkdownContentAdvanced(lowScoreContent)).toBe(false);
    });

    it("gives higher weight to code blocks", () => {
      const codeBlockContent = "```javascript\nconst x = 1;\n```";
      expect(detectMarkdownContentAdvanced(codeBlockContent)).toBe(true);
    });

    it("gives higher weight to tables", () => {
      const tableContent = "| Name | Age |\n| --- | --- |\n| John | 25 |";
      expect(detectMarkdownContentAdvanced(tableContent)).toBe(true);
    });

    it("gives higher weight to headers", () => {
      const headerContent = "# Important Header\n\nSome content below";
      expect(detectMarkdownContentAdvanced(headerContent)).toBe(true);
    });

    it("accumulates score from multiple elements", () => {
      const multiContent = "Some **bold** text with `inline code` and a *link*";
      expect(detectMarkdownContentAdvanced(multiContent)).toBe(true);
    });

    it("handles edge cases", () => {
      expect(detectMarkdownContentAdvanced("")).toBe(false);
      expect(detectMarkdownContentAdvanced("   ")).toBe(false);
      expect(detectMarkdownContentAdvanced("Plain text only")).toBe(false);
    });
  });

  describe("Real-world examples", () => {
    it("detects typical AI code responses", () => {
      const aiCodeResponse = `Here&apos;s how to implement a React component:

\`\`\`javascript
import React from &apos;react&apos;;

const MyComponent = () => {
  return <div>Hello World</div>;
};

export default MyComponent;
\`\`\`

This component renders a simple greeting.`;

      expect(detectMarkdownContent(aiCodeResponse)).toBe(true);
      expect(detectMarkdownContentAdvanced(aiCodeResponse)).toBe(true);
    });

    it("detects typical AI explanation responses", () => {
      const aiExplanationResponse = `# Understanding React Hooks

React Hooks are functions that let you use state and other React features. Here are the main ones:

## useState
- Manages component state
- Returns current state and setter function

## useEffect
- Handles side effects
- Runs after render

> **Tip**: Always follow the Rules of Hooks!`;

      expect(detectMarkdownContent(aiExplanationResponse)).toBe(true);
      expect(detectMarkdownContentAdvanced(aiExplanationResponse)).toBe(true);
    });

    it("does not detect plain conversational responses", () => {
      const plainResponse = "I understand your question. Let me help you with that. The answer is quite simple and straightforward.";
      
      expect(detectMarkdownContent(plainResponse)).toBe(false);
      expect(detectMarkdownContentAdvanced(plainResponse)).toBe(false);
    });

    it("handles mixed content correctly", () => {
      const mixedContent = "Sure! Here&apos;s the solution using the `Array.map()` method with **proper error handling**.";
      
      expect(detectMarkdownContent(mixedContent)).toBe(true);
      expect(detectMarkdownContentAdvanced(mixedContent)).toBe(true);
    });
  });
});
