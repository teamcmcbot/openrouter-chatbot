// Newline preservation test for /api/chat/stream
// Mirrors the existing transform tests' mocking strategy

jest.mock("next/server", () => {
  class NextResponse {
    body: unknown;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    constructor(body: unknown, init?: { status?: number; statusText?: string; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.statusText = init?.statusText ?? "OK";
      this.headers = init?.headers ?? {};
    }
    static json(data: unknown, init?: { status?: number; statusText?: string; headers?: Record<string, string> }) {
      return new NextResponse(JSON.stringify(data), init);
    }
  }
  class NextRequest {}
  return { NextResponse, NextRequest };
});

jest.mock("ai", () => ({
  createTextStreamResponse: ({ textStream, headers }: { textStream: ReadableStream<Uint8Array>; headers?: Record<string, string> }) => ({
    body: textStream,
    status: 200,
    statusText: "OK",
    headers: headers || {},
  }),
}));

// Shared helpers
const enc = new TextEncoder();
const dec = new TextDecoder();

function rsFromStrings(parts: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const p of parts) controller.enqueue(enc.encode(p));
      controller.close();
    },
  });
}

async function readAll(rs: ReadableStream<unknown>): Promise<string> {
  const reader = rs.getReader();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (typeof value === "string") out += value;
    else if (value instanceof Uint8Array) out += dec.decode(value);
    else out += String(value);
  }
  return out;
}

// Mocks aligned with existing tests
jest.mock("../../lib/utils/openrouter", () => ({
  getOpenRouterCompletionStream: jest.fn(),
  fetchOpenRouterModels: jest.fn(async () => []),
}));

const fakeAuthContext = {
  isAuthenticated: true,
  user: { id: "user-1" },
  profile: { subscription_tier: "pro" as const },
  accessLevel: "authenticated" as const,
  features: {},
};

type Handler = (req: unknown, auth: typeof fakeAuthContext) => Promise<unknown> | unknown;

jest.mock("../../lib/middleware/auth", () => ({
  withEnhancedAuth: (handler: Handler) => (req: unknown) => handler(req, fakeAuthContext),
  withAuth: (handler: Handler) => (req: unknown) => handler(req, fakeAuthContext),
}));

jest.mock("../../lib/middleware/redisRateLimitMiddleware", () => ({
  withTieredRateLimit: (handler: Handler) => handler,
}));

jest.mock("../../lib/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    from: () => ({ select: () => ({ in: () => ({ eq: () => ({ data: [], error: null }) }) }) }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "http://example.com" }, error: null }) }) },
  })),
}));

jest.mock("../../lib/utils/validation", () => ({
  validateChatRequestWithAuth: jest.fn((data: { messages: Array<{ role: string; content: unknown }>; model?: string; temperature?: number; systemPrompt?: string }) => ({
    valid: true,
    warnings: [],
    enhancedData: {
      messages: data.messages,
      model: data.model || "deepseek/deepseek-r1-0528:free",
      temperature: data.temperature,
      systemPrompt: data.systemPrompt,
    },
  })),
  validateRequestLimits: jest.fn(() => ({ allowed: true })),
}));

jest.mock("../../lib/utils/tokens", () => ({
  estimateTokenCount: jest.fn(() => 1),
}));

jest.mock("../../lib/utils/tokens.server", () => ({
  getModelTokenLimits: jest.fn(async () => ({ maxInputTokens: 8192, maxOutputTokens: 1024 })),
}));

describe("API chat stream route - newline preservation", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("includes newlines in final metadata.response", async () => {
    const { getOpenRouterCompletionStream } = await import("../../lib/utils/openrouter");
    const streamMock = getOpenRouterCompletionStream as unknown as jest.Mock;

    // Simulate two lines of markdown content
    const parts = [
      "# Title\n",
      "- Item 1\n",
      "- Item 2\n",
    ];
    streamMock.mockResolvedValueOnce(rsFromStrings(parts));

    const { POST } = await import("../../src/app/api/chat/stream/route");
    const req: { json: () => Promise<{ messages: Array<{ role: string; content: string }>; model: string }> } = {
      json: async () => ({ messages: [{ role: "user", content: "hi" }], model: "deepseek/deepseek-r1-0528:free" }),
    };
    const res = (await POST(req as unknown as import("next/server").NextRequest)) as { body: ReadableStream<unknown> };
    const text = await readAll(res.body);

    const finalLine = text.split("\n").find((l) => l.includes("__FINAL_METADATA__"));
    expect(finalLine).toBeTruthy();
    const parsed = JSON.parse(finalLine!);
    const response: string = parsed.__FINAL_METADATA__.response;

    // Must contain explicit newlines between lines for proper markdown rendering
    expect(response).toContain("# Title\n");
    expect(response).toContain("- Item 1\n");
    expect(response).toContain("- Item 2\n");
  });
});
