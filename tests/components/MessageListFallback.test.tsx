import { render, screen } from "@testing-library/react";
import MessageList from "../../components/chat/MessageList";
import { ChatMessage } from "../../lib/types/chat";

describe("Markdown Fallback Behavior", () => {
  let messageCounter = 0;
  const createMessage = (content: string, contentType?: "text" | "markdown"): ChatMessage => ({
    id: `test-id-${++messageCounter}`,
    content,
    role: "assistant",
    timestamp: new Date(),
    contentType,
  });

  beforeEach(() => {
    messageCounter = 0;
  });

  describe("Plain text fallback", () => {
    it("renders markdown syntax as plain text when contentType is text", () => {
      const markdownSyntax = "# This is a header\n\n**Bold text** and `code`";
      const message = createMessage(markdownSyntax, "text");

      render(<MessageList messages={[message]} isLoading={false} />);

      // Should render literal markdown syntax, not formatted
      expect(screen.getByText(/# This is a header/)).toBeInTheDocument();
      expect(screen.getByText(/\*\*Bold text\*\*/)).toBeInTheDocument();
      expect(screen.getByText(/`code`/)).toBeInTheDocument();

      // Should not create HTML elements for markdown
      expect(screen.queryByRole("heading")).toBeNull();
      expect(screen.queryByText("Bold text")).toBeNull();
    });

    it("preserves whitespace and line breaks in plain text", () => {
      const multilineText = "Line 1\n\nLine 3 after empty line\n  Indented line";
      const message = createMessage(multilineText, "text");

      render(<MessageList messages={[message]} isLoading={false} />);

      const textElement = screen.getByText(/Line 1/);
      expect(textElement).toHaveClass("whitespace-pre-wrap");
      expect(textElement.textContent).toContain("Line 1");
      expect(textElement.textContent).toContain("Line 3 after empty line");
      expect(textElement.textContent).toContain("  Indented line");
    });

    it("defaults to plain text when contentType is undefined", () => {
      const message: ChatMessage = {
        id: "test",
        content: "## Should be plain text",
        role: "assistant",
        timestamp: new Date(),
        // contentType is undefined
      };

      render(<MessageList messages={[message]} isLoading={false} />);

      const textElement = screen.getByText("## Should be plain text");
      expect(textElement.tagName).toBe("P");
      expect(textElement).toHaveClass("whitespace-pre-wrap");
    });

    it("defaults to plain text when contentType is null", () => {
      const message: ChatMessage = {
        id: "test",
        content: "**Should be plain text**",
        role: "assistant",
        timestamp: new Date(),
        contentType: undefined,
      };

      render(<MessageList messages={[message]} isLoading={false} />);

      expect(screen.getByText("**Should be plain text**")).toBeInTheDocument();
      expect(screen.queryByText("Should be plain text")).toBeNull(); // No bold rendering
    });
  });

  describe("Error handling", () => {
    it("handles empty content gracefully", () => {
      const message = createMessage("", "markdown");

      render(<MessageList messages={[message]} isLoading={false} />);

      // Should render without crashing
      expect(screen.getByText("ME")).toBeInTheDocument(); // User avatar should still show
    });

    it("handles very long content", () => {
      const longContent = "# Long Content\n\n" + "A".repeat(10000);
      const message = createMessage(longContent, "markdown");

      render(<MessageList messages={[message]} isLoading={false} />);

      expect(screen.getByText("Long Content")).toBeInTheDocument();
      // Should render without performance issues
    });

    it("handles malformed markdown gracefully", () => {
      const malformedMarkdown = "# Header\n\n**unclosed bold\n\n```unclosed code block\n\n[broken link](";
      const message = createMessage(malformedMarkdown, "markdown");

      render(<MessageList messages={[message]} isLoading={false} />);

      // Should render something, even if not perfectly formatted
      expect(screen.getByText("Header")).toBeInTheDocument();
    });

    it("handles special characters in content", () => {
      const specialChars = "Content with special chars: <>&\"'";
      const message = createMessage(specialChars, "text");

      render(<MessageList messages={[message]} isLoading={false} />);

      expect(screen.getByText(specialChars)).toBeInTheDocument();
    });
  });

  describe("Security considerations", () => {
    it("prevents XSS in plain text mode", () => {
      const xssAttempt = "<script>alert('xss')</script>";
      const message = createMessage(xssAttempt, "text");

      render(<MessageList messages={[message]} isLoading={false} />);

      // Should render as text, not execute script
      expect(screen.getByText(xssAttempt)).toBeInTheDocument();
      expect(document.querySelector("script")).toBeNull();
    });

    it("sanitizes HTML in markdown mode", () => {
      const htmlContent = "<script>alert('xss')</script>\n\n# Safe Header";
      const message = createMessage(htmlContent, "markdown");

      render(<MessageList messages={[message]} isLoading={false} />);

      // Should render header but not execute script
      expect(screen.getByText("Safe Header")).toBeInTheDocument();
      expect(document.querySelector("script")).toBeNull();
    });
  });

  describe("Mixed content scenarios", () => {
    it("handles conversation with mixed content types correctly", () => {
      const messages = [
        createMessage("Plain text message", "text"),
        createMessage("# Markdown message\n\nWith **formatting**", "markdown"),
        createMessage("Another plain text with ** symbols **", "text"),
        createMessage("```\ncode block\n```", "markdown"),
      ];

      render(<MessageList messages={messages} isLoading={false} />);

      // First message: plain text
      expect(screen.getByText("Plain text message")).toBeInTheDocument();

      // Second message: formatted markdown
      expect(screen.getByText("Markdown message")).toBeInTheDocument();
      expect(screen.getByText("formatting")).toBeInTheDocument();

      // Third message: literal symbols
      expect(screen.getByText("Another plain text with ** symbols **")).toBeInTheDocument();

      // Fourth message: code block
      expect(screen.getByText("code block")).toBeInTheDocument();
    });

    it("preserves message order and styling", () => {
      const messages = [
        { ...createMessage("User message", "text"), role: "user" as const },
        createMessage("Assistant response with `code`", "markdown"),
      ];

      render(<MessageList messages={messages} isLoading={false} />);

      const userMessage = screen.getByText("User message").closest("div");
      const assistantMessage = screen.getByText("code").closest("div");

      // Check styling differences
      expect(userMessage).toHaveClass("bg-emerald-600");
      expect(assistantMessage).toHaveClass("bg-gray-100");
    });
  });
});
