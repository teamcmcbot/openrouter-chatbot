// Minimal tests for Stripe checkout-session and customer-portal routes

// Polyfill minimal Next primitives used by routes/middleware
jest.mock('next/server', () => {
  class NextResponse {
    body: unknown;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    constructor(body: unknown, init?: { status?: number; statusText?: string; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.statusText = init?.statusText ?? 'OK';
      this.headers = init?.headers ?? {};
    }
    static json(data: unknown, init?: { status?: number; statusText?: string; headers?: Record<string, string> }) {
      return new NextResponse(JSON.stringify(data), init);
    }
  }
  class NextRequest {}
  return { NextResponse, NextRequest };
});

// Pass-through rate limit wrappers
jest.mock('../../../lib/middleware/redisRateLimitMiddleware', () => ({
  withTieredRateLimit: (handler: any) => handler,
}));

// Quiet logs
jest.mock('../../../lib/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn() } }));

// Auth: provide a minimal authenticated context via withProtectedAuth
const authContext = {
  isAuthenticated: true,
  user: { id: 'u1' },
  profile: { id: 'u1', email: 'u1@test.dev', subscription_tier: 'free', account_type: 'user' },
  accessLevel: 'authenticated',
  features: {},
};
jest.mock('../../../lib/middleware/auth', () => ({
  withProtectedAuth: (handler: any) => (req: any) => handler(req, authContext),
}));

// Supabase server client mock used by both routes
jest.mock('../../../lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    from: (table: string) => {
      const ctx: any = { filters: {} };
      const api: any = {
        select: () => api,
        eq: (col: string, val: unknown) => { ctx.filters[col] = val; return api; },
        single: async () => {
          if (table === 'profiles' && ctx.filters['id'] === 'u1') {
            return { data: { id: 'u1', email: 'u1@test.dev', stripe_customer_id: null }, error: null };
          }
          return { data: null, error: new Error('not found') } as any;
        },
  update: () => ({ eq: () => ({ error: null }) }),
      };
      return api;
    },
  })),
}));

// Mock Stripe SDK used in routes
jest.mock('stripe', () => {
  const StripeMock: any = jest.fn().mockImplementation(() => ({
    customers: { create: jest.fn(async () => ({ id: 'cus_test' })) },
    checkout: { sessions: { create: jest.fn(async () => ({ url: 'https://stripe.test/checkout' })) } },
    billingPortal: { sessions: { create: jest.fn(async () => ({ url: 'https://stripe.test/portal' })) } },
  }));
  StripeMock.default = StripeMock;
  return StripeMock;
});

// Minimal crypto UUID for idempotency key usage in route
if (!(global as any).crypto) {
  (global as any).crypto = { randomUUID: () => 'uuid-test' } as any;
} else if (!(global as any).crypto.randomUUID) {
  (global as any).crypto.randomUUID = () => 'uuid-test';
}

async function readResBody(res: any): Promise<any> {
  const body = res?.body;
  if (!body) return null;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  try { return JSON.parse(text); } catch { return text; }
}

describe('Stripe checkout-session and customer-portal', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  test('POST /api/stripe/checkout-session returns URL', async () => {
    // Set env BEFORE importing route (module reads env at import time)
    process.env.STRIPE_SECRET_KEY = 'sk_test';
    process.env.STRIPE_PRO_PRICE_ID = 'price_pro';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    const { POST } = await import('../../../src/app/api/stripe/checkout-session/route');
    const req = {
      method: 'POST',
      json: async () => ({ plan: 'pro' }),
    } as any;

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await readResBody(res);
    expect(data).toHaveProperty('url');
    expect(data.url).toContain('stripe.test/checkout');
  });

  test('POST /api/stripe/customer-portal returns URL', async () => {
    // Adjust supabase mock to return an existing customer id for this test
    const serverMod = await import('../../../lib/supabase/server');
    (serverMod as any).createClient.mockResolvedValueOnce({
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'u1', stripe_customer_id: 'cus_test' }, error: null }) }) })
      })
    });

    // Set env BEFORE importing route
    process.env.STRIPE_SECRET_KEY = 'sk_test';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    const { POST } = await import('../../../src/app/api/stripe/customer-portal/route');
    const req = { method: 'POST', json: async () => ({}) } as any;

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await readResBody(res);
    expect(data).toHaveProperty('url');
    expect(data.url).toContain('stripe.test/portal');
  });
});
