import { useChatStore } from "../../stores/useChatStore";

describe("ChatStore banner scope on retry (non-streaming)", () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockReset();
    useChatStore.setState({ conversations: [], currentConversationId: null, conversationErrorBanners: {} });
  });

  it("does not clear banners from other conversations when retrying current message", async () => {
    // Seed two conversations, both with banners; will retry only in convA
    const convA = {
      id: "convA",
      title: "A",
      messages: [
        {
          id: "mA",
          role: "user" as const,
          content: "hello",
          timestamp: new Date(),
          error: true,
          was_streaming: false,
        },
      ],
      userId: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 1,
      totalTokens: 0,
      isActive: true,
      lastMessagePreview: undefined,
      lastMessageTimestamp: undefined,
    };
    const convB = { ...convA, id: "convB", title: "B", isActive: false, messages: [{ ...convA.messages[0], id: "mB" }] };

    useChatStore.setState({
      conversations: [convA, convB],
      currentConversationId: "convA",
      conversationErrorBanners: {
        convA: { messageId: "mA", message: "Err A", createdAt: new Date().toISOString() },
        convB: { messageId: "mB", message: "Err B", createdAt: new Date().toISOString() },
      },
    });

    // Mock retry success for non-streaming path
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            response: "ok",
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            request_id: "mA",
          },
        }),
      headers: new Headers(),
    });

    // Execute retryLastMessage via store API (non-streaming for mA)
    await useChatStore.getState().retryLastMessage();

    // Verify convA banner dismissed (cleared by retry), convB banner remains
    const banners = useChatStore.getState().conversationErrorBanners as Record<string, unknown>;
    expect(banners.convA).toBeUndefined();
    expect(banners.convB).toBeTruthy();

    // Also verify that the fetch call targeted non-streaming endpoint
    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls[0][0]).toBe("/api/chat");
  });
});
