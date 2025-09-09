// Tests for POST /api/chat (non-stream) image output extraction (Phase 2)
// Focus: when imageOutput=true and OpenRouter returns images array, route adds output_images

// Mock next/server early
jest.mock('next/server', () => {
  class NextResponse {
    body: string;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    constructor(body: string, init?: { status?: number; statusText?: string; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.statusText = init?.statusText || 'OK';
      this.headers = init?.headers || {};
    }
    static json(data: unknown, init?: { status?: number; statusText?: string; headers?: Record<string, string> }) {
      return new NextResponse(JSON.stringify(data), init);
    }
    async json() { return JSON.parse(this.body); }
  }
  class NextRequest {}
  return { NextResponse, NextRequest };
});

// Auth + rate limit middleware passthroughs
type AuthContext = {
  isAuthenticated: boolean;
  user: { id: string } | null;
  profile: { subscription_tier?: string } | null;
  accessLevel: 'anonymous' | 'authenticated';
  features: Record<string, unknown>;
};
const authContext: AuthContext = {
  isAuthenticated: true,
  user: { id: 'user-1' },
  profile: { subscription_tier: 'enterprise' },
  accessLevel: 'authenticated',
  features: {},
};

jest.mock('../../lib/middleware/auth', () => ({
  withEnhancedAuth: (handler: (req: unknown, auth: AuthContext) => unknown) => (req: unknown) => handler(req, authContext),
}));
jest.mock('../../lib/middleware/redisRateLimitMiddleware', () => ({
  withRedisRateLimitEnhanced: (handler: (req: unknown, auth?: unknown) => unknown) => handler,
}));

// Validation & limits mocks
jest.mock('../../lib/utils/validation', () => ({
  validateChatRequestWithAuth: jest.fn((data: { messages: Array<{ role: string; content: unknown }>; model?: string; temperature?: number; systemPrompt?: string }) => ({
    valid: true,
    warnings: [],
    enhancedData: {
      messages: data.messages,
      model: data.model || 'deepseek/deepseek-r1-0528:free',
      temperature: data.temperature,
      systemPrompt: data.systemPrompt,
    },
  })),
  validateRequestLimits: jest.fn(() => ({ allowed: true })),
}));

jest.mock('../../lib/utils/tokens', () => ({
  estimateTokenCount: jest.fn(() => 1),
}));
jest.mock('../../lib/utils/tokens.server', () => ({
  getModelTokenLimits: jest.fn(async () => ({ maxInputTokens: 4096, maxOutputTokens: 1024 })),
}));

// Logger stub (silence output & allow inspection if needed)
jest.mock('../../lib/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Supabase server mock (attachments path unused here)
jest.mock('../../lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    from: () => ({ select: () => ({ in: () => ({ eq: () => ({ data: [], error: null }) }) }) }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'http://signed.example' }, error: null }) }) },
  })),
}));

// OpenRouter completion mock
const completionMock = {
  id: 'or-1',
  model: 'test/image-model',
  choices: [
    { message: { images: [
      'data:image/png;base64,AAA',
      { type: 'image_url', image_url: { url: 'data:image/png;base64,BBB' } },
      'data:image/png;base64,AAA' // duplicate to ensure dedupe path
    ], content: 'Here are images' } },
  ],
  usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
};

const getOpenRouterCompletion = jest.fn(async () => completionMock);
jest.mock('../../lib/utils/openrouter', () => ({
  getOpenRouterCompletion: () => getOpenRouterCompletion(),
  fetchOpenRouterModels: jest.fn(async () => []),
}));

// Import route AFTER mocks
import { POST } from '../../src/app/api/chat/route';

describe('POST /api/chat - image output extraction', () => {
  it('attaches deduplicated output_images array when imageOutput requested', async () => {
    const req = {
      json: async () => ({
        messages: [{ role: 'user', content: 'generate an image' }],
        model: 'test/image-model',
        imageOutput: true,
      }),
      headers: { get: () => null },
    } as unknown as import('next/server').NextRequest;

  const res = (await POST(req)) as unknown as { status: number; json: () => Promise<{ data: { output_images?: string[] } }> };
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    // Validate output_images present & deduped to 2
    expect(body.data.output_images).toEqual([
      'data:image/png;base64,AAA',
      'data:image/png;base64,BBB',
    ]);

    // Ensure OpenRouter helper was invoked with modalities including image
    expect(getOpenRouterCompletion).toHaveBeenCalledTimes(1);
  // We don't inspect modalities here because the mock wrapper does not forward arguments in this lightweight test.
  });
});
