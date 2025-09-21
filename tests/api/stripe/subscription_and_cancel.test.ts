// Tests for GET /api/stripe/subscription and POST /api/stripe/cancel-subscription

// Minimal Next primitives
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

// Auth context via withProtectedAuth wrapper (unique name to avoid TS jest hoist collisions)
const fakeAuthContextSubCancel = {
  isAuthenticated: true,
  user: { id: 'u1' },
  profile: { id: 'u1', email: 'u1@test.dev', subscription_tier: 'free', account_type: 'user' },
  accessLevel: 'authenticated',
  features: {},
};
jest.mock('../../../lib/middleware/auth', () => ({
  withProtectedAuth: (handler: any) => (req: any) => handler(req, fakeAuthContextSubCancel),
}));

// Supabase server client mock
jest.mock('../../../lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    from: (table: string) => {
      const ctx: any = { filters: {} };
      const api: any = {
        select: () => api,
        eq: (col: string, val: unknown) => { ctx.filters[col] = val; return api; },
        single: async () => ({ data: { id: 'u1', subscription_tier: 'pro', subscription_status: 'active', stripe_customer_id: 'cus_123' }, error: null }),
        maybeSingle: async () => {
          if (table === 'subscriptions' && ctx.filters['user_id'] === 'u1') {
            return { data: { stripe_subscription_id: 'sub_123', stripe_price_id: 'price_pro', status: 'active', current_period_start: '2025-09-01T00:00:00.000Z', current_period_end: '2025-10-01T00:00:00.000Z', cancel_at_period_end: false }, error: null } as any;
          }
          return { data: null, error: null } as any;
        },
        order: () => api,
        limit: () => api,
        update: () => ({ eq: () => ({ error: null }) }),
      };
      return api;
    },
  })),
}));

// Stripe SDK mock for cancel-subscription
jest.mock('stripe', () => {
  const StripeMock: any = jest.fn().mockImplementation(() => ({
    subscriptions: { update: jest.fn(async () => ({ id: 'sub_123', cancel_at_period_end: true })) },
  }));
  StripeMock.default = StripeMock;
  return StripeMock;
});

async function readResBody(res: any): Promise<any> {
  const body = res?.body;
  if (!body) return null;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  try { return JSON.parse(text); } catch { return text; }
}

describe('Stripe subscription GET and cancel-subscription POST', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  test('GET /api/stripe/subscription returns normalized state', async () => {
    const { GET } = await import('../../../src/app/api/stripe/subscription/route');
    const req = {} as any;
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await readResBody(res);
    expect(data).toMatchObject({
      tier: 'pro',
      status: 'active',
      periodEnd: '2025-10-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
    });
  });

  test('POST /api/stripe/cancel-subscription returns ok when active', async () => {
    // Adjust supabase mock to return an active subscription
    const serverMod = await import('../../../lib/supabase/server');
    (serverMod as any).createClient.mockResolvedValueOnce({
      from: () => ({
        select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { stripe_subscription_id: 'sub_123', status: 'active' }, error: null }) }) }) }) })
      })
    });

    process.env.STRIPE_SECRET_KEY = 'sk_test';
    const { POST } = await import('../../../src/app/api/stripe/cancel-subscription/route');
    const req = { method: 'POST' } as any;
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await readResBody(res);
    expect(data).toEqual({ ok: true });
  });

  test('POST /api/stripe/cancel-subscription 400 when no active subscription', async () => {
    // Supabase returns no sub
    const serverMod = await import('../../../lib/supabase/server');
    (serverMod as any).createClient.mockResolvedValueOnce({
      from: () => ({
        select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) })
      })
    });

    process.env.STRIPE_SECRET_KEY = 'sk_test';
    const { POST } = await import('../../../src/app/api/stripe/cancel-subscription/route');
    const req = { method: 'POST' } as any;
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await readResBody(res);
    expect(data).toHaveProperty('error');
  });
});
