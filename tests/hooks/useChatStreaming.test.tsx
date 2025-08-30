import { renderHook, act } from "@testing-library/react";
import { useChatStreaming } from "../../hooks/useChatStreaming";
import { useSettingsStore } from "../../stores/useSettingsStore";
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

// Minimal ChatProvider consumer not required since hook writes to stores directly

describe("useChatStreaming (integration-ish)", () => {
  beforeEach(() => {
    // Reset fetch mock before each test
    (global.fetch as jest.Mock).mockReset();
    // Ensure settings: enable streaming
    useSettingsStore.getState().setSetting("streamingEnabled", true);

    // Reset chat store conversations
    useChatStore.setState({ conversations: [], currentConversationId: null });
  });

  it("accumulates content, dedupes annotations by URL, and concatenates reasoning", async () => {
    // Compose a stream with interleaved content and markers
    const chunks = [
      "Hello ",
      "world\n",
      '__REASONING_CHUNK__' + JSON.stringify({ type: "reasoning", data: "Think A. " }) + "\n",
      '__ANNOTATIONS_CHUNK__' + JSON.stringify({ type: "annotations", data: [ { type: 'url_citation', url: 'HTTP://Example.com', title: 'Ex 1' } ] }) + "\n",
      "More text\n",
      '__ANNOTATIONS_CHUNK__' + JSON.stringify({ type: "annotations", data: [ { type: 'url_citation', url: 'http://example.com', content: 'Body' } ] }) + "\n",
      '__REASONING_CHUNK__' + JSON.stringify({ type: "reasoning", data: "Think B." }) + "\n",
      JSON.stringify({ __FINAL_METADATA__: { response: "Hello world\nMore text\n", usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }, id: "c1" } }) + "\n",
    ];

    // Mock fetch to return a Response with our stream
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      body: streamFromChunks(chunks),
      json: () => Promise.resolve({}),
      headers: new Headers(),
    });

    const { result } = renderHook(() => useChatStreaming());

    await act(async () => {
      await result.current.sendMessage("Hi", "test-model", { reasoning: { effort: "low" } });
    });

    // streamingContent should be cleared after completion, but assistant message should be stored
    const state = useChatStore.getState();
    const conv = state.conversations[0];
    expect(conv).toBeTruthy();
  const assistant = conv.messages.find((m: ChatMessage) => m.role === 'assistant');
    expect(assistant?.content).toBe("Hello world\nMore text\n");

    // Reasoning chunks should be concatenated when provided
    expect(assistant?.reasoning).toBe("Think A. Think B.");

    // Annotations should be deduped by URL (case-insensitive) and fields merged
    expect(Array.isArray(assistant?.annotations)).toBe(true);
    expect(assistant?.annotations?.length).toBe(1);
    expect(assistant?.annotations?.[0].url).toBe('HTTP://Example.com');
    expect(assistant?.annotations?.[0].title).toBe('Ex 1');
    expect(assistant?.annotations?.[0].content).toBe('Body');
  });
});
