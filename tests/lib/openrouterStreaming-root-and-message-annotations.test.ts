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

const enc2 = new TextEncoder();
const dec2 = new TextDecoder();

function makeSSEEvent2(json: unknown): string {
  return `data: ${JSON.stringify(json)}\n\n`;
}

function streamFromChunks2(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc2.encode(c));
      controller.close();
    },
  });
}

async function readAll2(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
  if (value) out += dec2.decode(value);
  }
  return out;
}

describe("getOpenRouterCompletionStream - root vs message annotations", () => {
  const origFetch = global.fetch;

  beforeAll(() => {
    process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "test-key";
  });

  afterEach(() => {
    global.fetch = origFetch as typeof fetch;
  });

  it("accumulates annotations from root.data.annotations and choices[0].message.annotations", async () => {
    const { getOpenRouterCompletionStream } = await import("../../lib/utils/openrouter");
    const rootAnn = { type: "url_citation", url: "https://root.example.com" };
    const msgAnn = { type: "url_citation", url: "https://msg.example.com" };

    const chunks = [
      makeSSEEvent2({ id: "s1" }),
      // Root-level annotations event observed in some providers
      makeSSEEvent2({ annotations: [rootAnn] }),
      // Message-level annotations event
      makeSSEEvent2({ choices: [{ message: { annotations: [msgAnn] } }] }),
      "data: [DONE]\n\n",
    ];
    const body = streamFromChunks2(chunks);
    global.fetch = jest.fn(async () => ({ ok: true, body } as Response)) as unknown as typeof fetch;

    type Msg = { role: "user" | "assistant" | "system"; content: string };
    const messages: Msg[] = [{ role: "user", content: "web search" }];
  const outStream = await getOpenRouterCompletionStream(messages, undefined, 100, 0.1, undefined, null, {
      webSearch: true,
      webMaxResults: 3,
    });
  const text = await readAll2(outStream);

    const metaMatch = text.match(/__METADATA__(\{[\s\S]*?\})__END__/);
    const metaSentinel = metaMatch ? metaMatch[1] : undefined;
    expect(metaSentinel).toBeTruthy();
    const meta = JSON.parse(metaSentinel!);
    const urls = (meta.data.annotations as Array<{ url: string }>).map((a) => a.url);
    expect(urls).toEqual(expect.arrayContaining(["https://root.example.com", "https://msg.example.com"]));
  });

  it("handles heavy fragmentation across many tiny chunks", async () => {
    const { getOpenRouterCompletionStream } = await import("../../lib/utils/openrouter");
    // Build a long content event and split it into tiny pieces
    const bigText = "The quick brown fox jumps over the lazy dog.".repeat(20);
    const contentEvt = `data: ${JSON.stringify({ choices: [{ delta: { content: bigText } }] })}\n\n`;
    const raw = contentEvt + "data: [DONE]\n\n";
    const tinyChunks = raw.split(""); // 1-char fragmentation
    const body = streamFromChunks2(tinyChunks);
    global.fetch = jest.fn(async () => ({ ok: true, body } as Response)) as unknown as typeof fetch;

    type Msg = { role: "user" | "assistant" | "system"; content: string };
    const messages: Msg[] = [{ role: "user", content: "fragmentation test" }];
    const outStream = await getOpenRouterCompletionStream(messages, undefined, 100, 0.1);
    const text = await readAll2(outStream);
    expect(text).toContain("The quick brown fox");
    expect(text.length).toBeGreaterThan(bigText.length / 2); // sanity check content flowed
  });
});
