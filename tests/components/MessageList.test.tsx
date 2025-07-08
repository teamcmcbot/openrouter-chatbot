import { render, screen } from "@testing-library/react";
import MessageList from "../../components/chat/MessageList";
import { ChatMessage } from "../../lib/types/chat";

let messageCounter = 0;
const createTestMessage = (content: string, contentType: "text" | "markdown" = "text", role: "user" | "assistant" = "assistant"): ChatMessage => ({
  id: `test-id-${++messageCounter}`,
  content,
  role,
  timestamp: new Date("2024-01-01T00:00:00Z"),
  contentType,
});

describe("MessageList with Markdown Support", () => {
  beforeEach(() => {
    messageCounter = 0;
  });
  it("renders plain text messages correctly", () => {
    const messages = [
      createTestMessage("This is plain text without any formatting", "text"),
    ];

    render(<MessageList messages={messages} isLoading={false} />);

    expect(screen.getByText("This is plain text without any formatting")).toBeInTheDocument();
    // Should render as p element with whitespace-pre-wrap
    const textElement = screen.getByText("This is plain text without any formatting");
    expect(textElement.tagName).toBe("P");
    expect(textElement).toHaveClass("whitespace-pre-wrap");
  });

  it("renders markdown messages with proper formatting", () => {
    const markdownContent = "# Hello World\n\nThis is **bold** text and `inline code`.";
    const messages = [
      createTestMessage(markdownContent, "markdown"),
    ];

    render(<MessageList messages={messages} isLoading={false} />);

    // Check that markdown content is rendered
    expect(screen.getByText("Hello World")).toBeInTheDocument();
    expect(screen.getByText("bold")).toBeInTheDocument();
    expect(screen.getByText("inline code")).toBeInTheDocument();
    
    // Check that it&apos;s wrapped in markdown-content div
    const markdownContainer = screen.getByText("Hello World").closest(".markdown-content");
    expect(markdownContainer).toBeInTheDocument();
  });

  it("handles mixed content types in the same conversation", () => {
    const messages = [
      createTestMessage("Plain text message", "text", "user"),
      createTestMessage("## Markdown Response\n\nWith **formatting**", "markdown", "assistant"),
      createTestMessage("Another plain text", "text", "user"),
    ];

    render(<MessageList messages={messages} isLoading={false} />);

    // Plain text messages
    expect(screen.getByText("Plain text message")).toBeInTheDocument();
    expect(screen.getByText("Another plain text")).toBeInTheDocument();
    
    // Markdown message
    expect(screen.getByText("Markdown Response")).toBeInTheDocument();
    expect(screen.getByText("formatting")).toBeInTheDocument();
  });

  it("defaults to plain text when contentType is undefined", () => {
    const messages = [
      {
        id: "test",
        content: "## This should be plain text",
        role: "assistant" as const,
        timestamp: new Date(),
        // contentType is undefined
      },
    ];

    render(<MessageList messages={messages} isLoading={false} />);

    // Should render as plain text, not as heading
    const textElement = screen.getByText("## This should be plain text");
    expect(textElement.tagName).toBe("P");
    expect(textElement).toHaveClass("whitespace-pre-wrap");
  });

  it("renders user messages correctly", () => {
    const messages = [
      createTestMessage("User message with markdown", "markdown", "user"),
    ];

    render(<MessageList messages={messages} isLoading={false} />);

    // Find the message bubble by looking for the div with the correct styling classes
    const userBubble = screen.getByText("User message with markdown").closest(".bg-emerald-600");
    expect(userBubble).toHaveClass("bg-emerald-600", "text-white");
  });

  it("renders assistant messages with model tags", () => {
    const messageWithModel: ChatMessage = {
      id: "test",
      content: "Response from GPT-4",
      role: "assistant",
      timestamp: new Date(),
      contentType: "text",
      model: "gpt-4-turbo",
    };

    render(<MessageList messages={[messageWithModel]} isLoading={false} />);

    expect(screen.getByText("gpt-4-turbo")).toBeInTheDocument();
    expect(screen.getByText("Response from GPT-4")).toBeInTheDocument();
  });

  it("shows loading indicator when isLoading is true", () => {
    render(<MessageList messages={[]} isLoading={true} />);

    // Should show animated dots
    const loadingDots = screen.getAllByText("", { selector: ".animate-bounce" });
    expect(loadingDots).toHaveLength(3);
  });

  it("shows empty state when no messages and not loading", () => {
    render(<MessageList messages={[]} isLoading={false} />);

    expect(screen.getByText("Start a conversation")).toBeInTheDocument();
    expect(screen.getByText("Type a message below to begin chatting with the AI assistant.")).toBeInTheDocument();
  });

  it("renders timestamp and metadata correctly", () => {
    const messageWithMetadata: ChatMessage = {
      id: "test",
      content: "Test message",
      role: "assistant",
      timestamp: new Date("2024-01-01T12:00:00Z"),
      contentType: "text",
      elapsed_time: 2,
      total_tokens: 150,
    };

    render(<MessageList messages={[messageWithMetadata]} isLoading={false} />);

    // Test the formatted time based on what the formatTime function would produce
    const expectedTime = messageWithMetadata.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    expect(screen.getByText(expectedTime)).toBeInTheDocument();
    expect(screen.getByText(/Took 2 seconds, 150 tokens/)).toBeInTheDocument();
  });
});
