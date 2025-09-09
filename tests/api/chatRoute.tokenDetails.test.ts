// Tests for token details forwarding from OpenRouter through API responses
// Focus: verifying prompt_tokens_details and completion_tokens_details are properly forwarded

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

// Validation mocks
jest.mock('../../lib/utils/validation', () => ({
  validateChatRequestWithAuth: jest.fn((data: { message?: string; model?: string; temperature?: number; systemPrompt?: string }) => ({
    valid: true,
    warnings: [],
    enhancedData: {
      messages: [{ role: 'user', content: data.message || 'Test message' }],
      model: data.model || 'gpt-4',
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

// Logger stub
jest.mock('../../lib/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Supabase server mock
jest.mock('../../lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    from: () => ({ select: () => ({ in: () => ({ eq: () => ({ data: [], error: null }) }) }) }),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'http://signed.example' }, error: null }) }) },
  })),
}));

// Mock OpenRouter utility with token details
const mockOpenRouterResponse = {
  id: 'test-completion-id',
  choices: [
    {
      message: {
        content: 'Test response',
      },
    },
  ],
  usage: {
    prompt_tokens: 20,
    completion_tokens: 15,
    total_tokens: 35,
    prompt_tokens_details: {
      cached_tokens: 5,
    },
    completion_tokens_details: {
      reasoning_tokens: 8,
      image_tokens: 7,
    },
  },
  model: 'gpt-4',
};

jest.mock('../../lib/utils/openrouter', () => ({
  getOpenRouterCompletion: jest.fn(() => Promise.resolve(mockOpenRouterResponse)),
  fetchOpenRouterModels: jest.fn(async () => []),
}));

// Import after mocks
import { POST } from '../../src/app/api/chat/route';

describe('/api/chat token details forwarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards prompt_tokens_details from OpenRouter response', async () => {
    const req = {
      json: async () => ({
        message: 'Test message',
        model: 'gpt-4',
      }),
      headers: { get: () => null },
    } as unknown as import('next/server').NextRequest;

    const response = (await POST(req)) as unknown as { status: number; json: () => Promise<{ data: { usage?: { prompt_tokens_details?: { cached_tokens?: number } } } }> };
    const body = await response.json();

    expect(body.data.usage).toBeDefined();
    expect(body.data.usage?.prompt_tokens_details).toEqual({
      cached_tokens: 5,
    });
  });
});
