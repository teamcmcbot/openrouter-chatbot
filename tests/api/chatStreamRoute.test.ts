// Mock Next.js server primitives and AI SDK to avoid edge runtime dependencies
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

import { NextResponse } from "next/server";

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
    if (typeof value === "string") {
      out += value;
    } else if (value instanceof Uint8Array) {
      out += dec.decode(value);
    } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
      out += dec.decode(value);
    } else if (value && typeof (value as ArrayBuffer).byteLength === 'number') {
      // Treat as ArrayBuffer
      out += dec.decode(new Uint8Array(value as ArrayBuffer));
    } else {
      // Fallback: toString
      out += String(value);
    }
  }
  return out;
}

// Mutable auth context used by the auth middleware mock
type FeatureFlags = Record<string, unknown>;
type Profile = { subscription_tier?: "anonymous" | "free" | "pro" | "enterprise" } | null;
let fakeAuthContext = {
  isAuthenticated: true,
  user: { id: "user-1" },
  profile: { subscription_tier: "pro" } as Profile,
  accessLevel: "authenticated" as const,
  features: {} as FeatureFlags,
};

type AuthContextType = typeof fakeAuthContext;
type Handler = (req: unknown, auth: AuthContextType) => Promise<unknown> | unknown;

jest.mock("../../lib/utils/openrouter", () => {
  return {
    // we'll stub this per-test
    getOpenRouterCompletionStream: jest.fn(),
    fetchOpenRouterModels: jest.fn(async () => []),
  };
});

jest.mock("../../lib/middleware/auth", () => ({
  withEnhancedAuth: (handler: Handler) => (req: unknown) => handler(req, fakeAuthContext),
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
  validateChatRequestWithAuth: jest.fn((data: { messages: Array<{ role: string; content: unknown }>; model?: string; temperature?: number; systemPrompt?: string }, _ctx: AuthContextType) => {
    void _ctx; // avoid unused var lint
    return {
      valid: true,
      warnings: [],
      enhancedData: {
        messages: data.messages,
        model: data.model || "deepseek/deepseek-r1-0528:free",
        temperature: data.temperature,
        systemPrompt: data.systemPrompt,
      },
    };
  }),
  validateRequestLimits: jest.fn(() => ({ allowed: true })),
}));

jest.mock("../../lib/utils/tokens", () => ({
  estimateTokenCount: jest.fn(() => 1),
  getModelTokenLimits: jest.fn(async () => ({ maxInputTokens: 8192, maxOutputTokens: 1024 })),
}));

describe("API chat stream route - transform", () => {
  const ORIG_ENV = { ...process.env } as NodeJS.ProcessEnv;

  beforeAll(() => {
    process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "test-key";
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
    fakeAuthContext = { ...fakeAuthContext, profile: { subscription_tier: "pro" } };
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("buffers fragmented marker lines and forwards annotations; emits final metadata JSON", async () => {
    const { getOpenRouterCompletionStream } = await import("../../lib/utils/openrouter");
    const streamMock = getOpenRouterCompletionStream as unknown as jest.Mock;

    const annotationsPayload = { type: "annotations", data: [{ type: "url_citation", url: "https://a.com" }] };
    const backendMeta = { type: "metadata", data: { id: "m1", usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } } };

    // Fragment annotation marker across chunks (no newline until end)
    const parts = [
      "Hello ",
      "__ANNOTATIONS_CHU", "NK__" + JSON.stringify(annotationsPayload) + "\n",
      "world\n",
      "__METADATA__" + JSON.stringify(backendMeta) + "__END__",
    ];
    streamMock.mockResolvedValueOnce(rsFromStrings(parts));

    const { POST } = await import("../../src/app/api/chat/stream/route");
    const req: { json: () => Promise<{ messages: Array<{ role: string; content: string }>; model: string }> } = {
      json: async () => ({
        messages: [{ role: "user", content: "hi" }],
        model: "deepseek/deepseek-r1-0528:free",
      }),
    };
  const res = (await POST(req as unknown as import("next/server").NextRequest)) as NextResponse;
    const body = res.body!;
    const text = await readAll(body);

    // Annotation marker forwarded
    expect(text).toContain("__ANNOTATIONS_CHUNK__");
    expect(text).toContain("https://a.com");

    // Final metadata JSON present and standardized
    const finalLine = text.split("\n").find((l) => l.includes("__FINAL_METADATA__"));
    expect(finalLine).toBeTruthy();
    const parsed = JSON.parse(finalLine!);
    expect(parsed.__FINAL_METADATA__).toBeTruthy();
    // Response text should include normal content only
    expect(parsed.__FINAL_METADATA__.response).toContain("Hello ");
    expect(parsed.__FINAL_METADATA__.response).toContain("world");
  });

  it("drops reasoning markers when not requested", async () => {
    const { getOpenRouterCompletionStream } = await import("../../lib/utils/openrouter");
    const streamMock = getOpenRouterCompletionStream as unknown as jest.Mock;

    const parts = [
      "__REASONING_CHUNK__" + JSON.stringify({ type: "reasoning", data: "thinking" }) + "\n",
      "Answer\n",
    ];
    streamMock.mockResolvedValueOnce(rsFromStrings(parts));

    const { POST } = await import("../../src/app/api/chat/stream/route");
    const req: { json: () => Promise<{ messages: Array<{ role: string; content: string }>; model: string }> } = {
      json: async () => ({ messages: [{ role: "user", content: "why" }], model: "deepseek/deepseek-r1-0528:free" }),
    };
  const res = (await POST(req as unknown as import("next/server").NextRequest)) as NextResponse;
    const text = await readAll(res.body!);

    expect(text).not.toContain("__REASONING_CHUNK__");
    const finalLine = text.split("\n").find((l) => l.includes("__FINAL_METADATA__"));
    expect(finalLine).toBeTruthy();
  });

  it("forwards reasoning markers when requested and tier allows", async () => {
    fakeAuthContext.profile = { subscription_tier: "enterprise" };
    const { getOpenRouterCompletionStream } = await import("../../lib/utils/openrouter");
    const streamMock = getOpenRouterCompletionStream as unknown as jest.Mock;

    const parts = [
      "__REASONING_CHUNK__" + JSON.stringify({ type: "reasoning", data: "thinking" }) + "\n",
      "Answer\n",
    ];
    streamMock.mockResolvedValueOnce(rsFromStrings(parts));

    const { POST } = await import("../../src/app/api/chat/stream/route");
    const req: { json: () => Promise<{ messages: Array<{ role: string; content: string }>; model: string; reasoning: { effort: "low" } }> } = {
      json: async () => ({ messages: [{ role: "user", content: "why" }], model: "deepseek/deepseek-r1-0528:free", reasoning: { effort: "low" } }),
    };
  const res = (await POST(req as unknown as import("next/server").NextRequest)) as NextResponse;
    const text = await readAll(res.body!);

    expect(text).toContain("__REASONING_CHUNK__");
    const finalLine = text.split("\n").find((l) => l.includes("__FINAL_METADATA__"));
    expect(finalLine).toBeTruthy();
  });
});
