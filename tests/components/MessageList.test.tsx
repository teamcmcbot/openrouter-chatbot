import { render, screen } from "@testing-library/react";
import MessageList from "../../components/chat/MessageList";
import { ChatMessage } from "../../lib/types/chat";
import { useAuthStore } from "../../stores/useAuthStore";

// Mock Next.js Image component
jest.mock("next/image", () => {
  return function MockImage({ src, alt }: { src: string; alt: string }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} data-testid="user-avatar" />;
  };
});

// Mock the auth store
jest.mock("../../stores/useAuthStore", () => ({
  useAuthStore: jest.fn(),
}));

const mockUseAuthStore = useAuthStore as jest.MockedFunction<typeof useAuthStore>;

// Helper to create a mock user
const createMockUser = (hasAvatar = true) => ({
  id: "test-user-id",
  email: "test@example.com",
  user_metadata: hasAvatar ? {
    avatar_url: "https://example.com/avatar.jpg",
    full_name: "Test User",
  } : {
    full_name: "Test User",
  },
  app_metadata: {},
  aud: "authenticated",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);

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
    // Default mock: no user signed in
    mockUseAuthStore.mockReturnValue(null);
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

    // Test that the timestamp appears (it will include date since it's not today)
    // Use case-insensitive regex to handle both "PM" and "pm" formats
    expect(screen.getByText(/01\/01\/2024.*08:00 pm/i)).toBeInTheDocument();
    expect(screen.getByText(/Took 2 seconds, 150 tokens/)).toBeInTheDocument();
  });

  describe("User Avatar functionality", () => {
    it("displays user avatar when user is signed in with avatar_url", () => {
      // Mock signed-in user with avatar
      mockUseAuthStore.mockReturnValue(createMockUser(true));

      const messages = [
        createTestMessage("User message with avatar", "text", "user"),
      ];

      render(<MessageList messages={messages} isLoading={false} />);

      // Should show avatar image instead of "ME"
      const avatar = screen.getByTestId("user-avatar");
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveAttribute("src", "https://example.com/avatar.jpg");
      expect(avatar).toHaveAttribute("alt", "User Avatar");
      
      // Should not show "ME" text
      expect(screen.queryByText("ME")).not.toBeInTheDocument();
    });

    it("displays 'ME' text when user is signed in but has no avatar_url", () => {
      // Mock signed-in user without avatar
      mockUseAuthStore.mockReturnValue(createMockUser(false));

      const messages = [
        createTestMessage("User message without avatar", "text", "user"),
      ];

      render(<MessageList messages={messages} isLoading={false} />);

      // Should show "ME" text
      expect(screen.getByText("ME")).toBeInTheDocument();
      
      // Should not show avatar image
      expect(screen.queryByTestId("user-avatar")).not.toBeInTheDocument();
    });

    it("displays 'ME' text when user is not signed in", () => {
      // Default mock is already set in beforeEach (no user)
      
      const messages = [
        createTestMessage("Anonymous user message", "text", "user"),
      ];

      render(<MessageList messages={messages} isLoading={false} />);

      // Should show "ME" text
      expect(screen.getByText("ME")).toBeInTheDocument();
      
      // Should not show avatar image
      expect(screen.queryByTestId("user-avatar")).not.toBeInTheDocument();
    });

    it("always displays 'AI' for assistant messages regardless of user state", () => {
      // Mock signed-in user with avatar
      mockUseAuthStore.mockReturnValue(createMockUser(true));

      const messages = [
        createTestMessage("Assistant response", "text", "assistant"),
      ];

      render(<MessageList messages={messages} isLoading={false} />);

      // Should always show "AI" for assistant messages
      expect(screen.getByText("AI")).toBeInTheDocument();
      
      // Should not show user avatar for assistant messages
      expect(screen.queryByTestId("user-avatar")).not.toBeInTheDocument();
    });
  });
});
