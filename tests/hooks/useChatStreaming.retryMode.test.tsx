import { renderHook, act } from "@testing-library/react";
import { useChatStreaming } from "../../hooks/useChatStreaming";
import { useChatStore } from "../../stores/useChatStore";
import type { ChatMessage } from "../../lib/types/chat";

// Helper to create a ReadableStream from string chunks
function streamFromChunks(chunks: (string | Uint8Array)[]) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(typeof c === "string" ? encoder.encode(c) : c);
      }
      controller.close();
    },
  });
}

describe("useChatStreaming retry mode routing", () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockReset();
    // Reset chat store
    useChatStore.setState({ conversations: [], currentConversationId: null });
  });

  it("routes retry to /api/chat/stream when original was_streaming=true", async () => {
    // Seed store with a conversation and a failed user message marked as streaming
    const convId = "conv_stream";
    const failedUser: ChatMessage = {
      id: "u1",
      role: "user",
      content: "Hello",
      timestamp: new Date(),
      error: true,
      was_streaming: true,
      originalModel: "test-model",
      // capture original request options
      requested_web_search: true,
      requested_web_max_results: 3,
      requested_reasoning_effort: "low",
    };
    useChatStore.setState({
      conversations: [
        {
          id: convId,
          title: "New Chat",
          messages: [failedUser],
          userId: undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 1,
          totalTokens: 0,
          isActive: true,
          lastMessagePreview: undefined,
          lastMessageTimestamp: undefined,
        },
      ],
      currentConversationId: convId,
    });

    // Mock streaming response with final metadata
    const chunks = [
      "Chunk 1\n",
      JSON.stringify({ __FINAL_METADATA__: { response: "Answer", usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }, id: "cid1" } }) + "\n",
    ];
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      body: streamFromChunks(chunks),
      json: () => Promise.resolve({}),
      headers: new Headers(),
    });

    const { result } = renderHook(() => useChatStreaming());
    await act(async () => {
      await result.current.retryLastMessage();
    });

    // Assert first fetch call hit streaming endpoint
  const calls = (global.fetch as jest.Mock).mock.calls.map((c) => c[0]);
  expect(calls.length).toBeGreaterThan(0);
  // One of the calls should be the streaming endpoint (there may be a prior /api/models hydration)
  expect(calls).toContain("/api/chat/stream");

    // Ensure assistant reply stored
    const state = useChatStore.getState();
    const conv = state.conversations.find((c) => c.id === convId)!;
    expect(conv.messages.some((m) => m.role === "assistant")).toBe(true);
  });

  it("routes retry to /api/chat (non-stream) when original was_streaming=false", async () => {
    // Seed store with a conversation and a failed user message marked as non-streaming
    const convId = "conv_legacy";
    const failedUser: ChatMessage = {
      id: "u2",
      role: "user",
      content: "Hi",
      timestamp: new Date(),
      error: true,
      was_streaming: false,
      originalModel: "test-model",
    };
    useChatStore.setState({
      conversations: [
        {
          id: convId,
          title: "New Chat",
          messages: [failedUser],
          userId: undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 1,
          totalTokens: 0,
          isActive: true,
          lastMessagePreview: undefined,
          lastMessageTimestamp: undefined,
        },
      ],
      currentConversationId: convId,
    });

    // Mock non-streaming response
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            response: "Answer",
            usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
            request_id: "u2",
          },
        }),
      headers: new Headers(),
    });

    const { result } = renderHook(() => useChatStreaming());
    await act(async () => {
      await result.current.retryLastMessage();
    });

    // Assert first fetch call hit non-streaming endpoint
  const calls = (global.fetch as jest.Mock).mock.calls.map((c) => c[0]);
  expect(calls.length).toBeGreaterThan(0);
  expect(calls).toContain("/api/chat");

    // Ensure assistant reply stored
    const state = useChatStore.getState();
    const conv = state.conversations.find((c) => c.id === convId)!;
    expect(conv.messages.some((m) => m.role === "assistant")).toBe(true);
  });
});
