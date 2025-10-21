// Mock server/models to avoid cookies() call
jest.mock("../../lib/server/models", () => ({
  getServerModelConfig: jest.fn().mockResolvedValue({
    id: "test-model",
    name: "Test Model",
    pricing: { prompt: "0", completion: "0" },
    context_length: 4096,
    supported_parameters: {},
  }),
  doesModelSupportParameter: jest.fn().mockResolvedValue(true),
}));

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function makeSSEEvent(json: unknown): string {
  return `data: ${JSON.stringify(json)}\n\n`;
}

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

async function readAllStreaming(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) out += decoder.decode(value);
  }
  return out;
}

describe("getOpenRouterCompletionStream - SSE handling", () => {
  const origFetch = global.fetch;

  beforeAll(() => {
  // Ensure env is set before dynamic imports to capture value at module init
  process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "test-key";
  });

  afterEach(() => {
    global.fetch = origFetch as typeof fetch;
  });

  it("buffers partial SSE events and forwards content", async () => {
  const { getOpenRouterCompletionStream } = await import("../../lib/utils/openrouter");
    // One JSON event split across two network chunks
    const evt = makeSSEEvent({ id: "x1" });
    const contentEvt = makeSSEEvent({ choices: [{ delta: { content: "Hello" } }] });
    const doneEvt = "data: [DONE]\n\n";

    const body = streamFromChunks([
      evt.slice(0, 5), // partial
      evt.slice(5), // rest
      contentEvt.slice(0, 10),
      contentEvt.slice(10),
      doneEvt,
    ]);

  global.fetch = jest.fn(async () => ({ ok: true, body } as Response)) as unknown as typeof fetch;

  type Msg = { role: "user" | "assistant" | "system"; content: string };
  const messages: Msg[] = [{ role: "user", content: "hi" }];
    const outStream = await getOpenRouterCompletionStream(messages, undefined, 100, 0.1);
    const text = await readAllStreaming(outStream);
    expect(text).toContain("Hello");
    // metadata sentinel should be present
    expect(text).toContain("__METADATA__");
    expect(text).toContain("__END__");
  });

  it("accumulates and deduplicates annotations (by URL)", async () => {
  const { getOpenRouterCompletionStream } = await import("../../lib/utils/openrouter");
    const ann1 = { type: "url_citation", url: "https://example.com/A" };
    const ann2 = { type: "url_citation", url: "https://example.com/B" };
    const annDup = { type: "url_citation", url: "https://example.com/a" }; // case-insensitive duplicate

    const chunks = [
      makeSSEEvent({ id: "s1" }),
      makeSSEEvent({ choices: [{ delta: { annotations: [ann1, ann2] } }] }),
      makeSSEEvent({ choices: [{ delta: { annotations: [annDup] } }] }),
      "data: [DONE]\n\n",
    ];
    const body = streamFromChunks(chunks);
  global.fetch = jest.fn(async () => ({ ok: true, body } as Response)) as unknown as typeof fetch;

  type Msg = { role: "user" | "assistant" | "system"; content: string };
  const messages: Msg[] = [{ role: "user", content: "web search" }];
    const outStream = await getOpenRouterCompletionStream(messages, undefined, 100, 0.1, undefined, null, {
      webSearch: true,
      webMaxResults: 3,
    });
    const text = await readAllStreaming(outStream);

    // Should emit at least one annotations chunk
    const annLines = text
      .split("\n")
      .filter((l: string) => l.startsWith("__ANNOTATIONS_CHUNK__"));
    expect(annLines.length).toBeGreaterThanOrEqual(1);

    // Final metadata should include deduped 2 URLs
  const metaMatch = text.match(/__METADATA__(\{[\s\S]*?\})__END__/);
  const metaSentinel = metaMatch ? metaMatch[1] : undefined;
    expect(metaSentinel).toBeTruthy();
    const meta = JSON.parse(metaSentinel!);
    expect(Array.isArray(meta.data.annotations)).toBe(true);
  const urls = (meta.data.annotations as Array<{ url: string }>).map((a) => a.url);
    expect(new Set(urls).size).toBe(2);
    expect(urls).toEqual(expect.arrayContaining(["https://example.com/A", "https://example.com/B"]));
  });

  it("gates reasoning emission based on options", async () => {
  const { getOpenRouterCompletionStream } = await import("../../lib/utils/openrouter");
    const reasonEvt = makeSSEEvent({ choices: [{ delta: { reasoning: "thinking..." } }] });
    const doneEvt = "data: [DONE]\n\n";
    const body = streamFromChunks([reasonEvt, doneEvt]);
  global.fetch = jest.fn(async () => ({ ok: true, body } as Response)) as unknown as typeof fetch;

  type Msg = { role: "user" | "assistant" | "system"; content: string };
  const messages: Msg[] = [{ role: "user", content: "why?" }];

    // No reasoning option -> no reasoning chunk
    const streamNo = await getOpenRouterCompletionStream(messages);
    const textNo = await readAllStreaming(streamNo);
    expect(textNo).not.toContain("__REASONING_CHUNK__");

    // With reasoning option -> reasoning chunk present
    const body2 = streamFromChunks([reasonEvt, doneEvt]);
  (global.fetch as unknown as jest.Mock).mockResolvedValueOnce({ ok: true, body: body2 } as Response);
    const streamYes = await getOpenRouterCompletionStream(messages, undefined, undefined, undefined, undefined, null, {
      reasoning: { effort: "low" },
    });
    const textYes = await readAllStreaming(streamYes);
    expect(textYes).toContain("__REASONING_CHUNK__");
  });
});
