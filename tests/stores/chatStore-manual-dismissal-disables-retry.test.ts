import { useChatStore } from "../../stores";
import type { ChatMessage } from "../../lib/types/chat";

describe("Manual dismissal disables retry", () => {
  beforeEach(() => {
    // Reset store to a clean state between tests (preserve functions via spread)
    useChatStore.setState((state) => ({
      ...state,
      conversations: [],
      currentConversationId: null,
      isLoading: false,
      error: null,
      isHydrated: true,
      conversationErrorBanners: {},
      isSyncing: false,
      lastSyncTime: null,
      syncError: null,
      syncInProgress: false,
    }));

    // Reset fetch mock call history
    ;(global.fetch as jest.Mock).mockClear();
  });

  it("clears the banner, flips retry_available=false, and blocks retryLastMessage network call", async () => {
    const failedUserMessage: ChatMessage = {
      id: "msg_failed_1",
      content: "Please summarize this.",
      role: "user",
      timestamp: new Date(),
      error: true,
      error_message: "Rate limited",
      error_code: "rate_limited",
      retry_after: 10,
      retry_available: true,
      originalModel: "openai/gpt-4o",
    };

    const conversationId = "conv_test_1";

    // Seed store with one conversation containing a failed user message and an active banner
    useChatStore.setState((state) => ({
      ...state,
      conversations: [
        {
          id: conversationId,
          title: "New Chat",
          messages: [failedUserMessage],
          userId: undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 1,
          totalTokens: 0,
          isActive: true,
          lastMessagePreview: failedUserMessage.content,
          lastMessageTimestamp: new Date().toISOString(),
        },
      ],
      currentConversationId: conversationId,
      conversationErrorBanners: {
        [conversationId]: {
          messageId: failedUserMessage.id,
          message: failedUserMessage.error_message || "Request failed",
          code: failedUserMessage.error_code,
          retryAfter: failedUserMessage.retry_after,
          createdAt: new Date().toISOString(),
        },
      },
    }));

    // 1) Manually dismiss the banner (this should also disable retry on the failed user message)
    useChatStore.getState().closeErrorBannerAndDisableRetry(conversationId);

    // Validate banner is cleared
    expect(useChatStore.getState().conversationErrorBanners[conversationId]).toBeUndefined();

    // Validate retry_available is now false on the failed user message
    const updatedConv = useChatStore.getState().conversations.find((c) => c.id === conversationId)!;
    const updatedMsg = updatedConv.messages.find((m) => m.id === failedUserMessage.id)!;
    expect(updatedMsg.retry_available).toBe(false);

    // 2) Attempt to retry; guard should early-return and not perform any network calls
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockClear();
    await useChatStore.getState().retryLastMessage();

    // Ensure no network call happened due to disabled retry
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
