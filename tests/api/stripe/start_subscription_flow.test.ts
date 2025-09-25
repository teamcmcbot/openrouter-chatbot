export {};

// Tests for Stripe smart routing endpoint: /api/stripe/start-subscription-flow

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

// Dynamic controls for the Supabase mock
let mockStripeCustomerId: string | null = null;
let mockSubscription: { stripe_subscription_id: string; status: string; cancel_at_period_end: boolean } | null = null;

// Supabase server client mock used by the route
jest.mock('../../../lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    from: (table: string) => {
      const ctx: any = { filters: {}, orderBy: null as null | { column: string; asc: boolean }, limit: 0 };
      const api: any = {
        select: () => api,
        eq: (col: string, val: unknown) => { ctx.filters[col] = val; return api; },
        order: (column: string, { ascending }: { ascending: boolean }) => { ctx.orderBy = { column, asc: ascending }; return api; },
        limit: (n: number) => { ctx.limit = n; return api; },
        single: async () => {
          if (table === 'profiles' && ctx.filters['id'] === 'u1') {
            return { data: { id: 'u1', email: 'u1@test.dev', stripe_customer_id: mockStripeCustomerId }, error: null };
          }
          return { data: null, error: new Error('not found') } as any;
        },
        maybeSingle: async () => {
          if (table === 'subscriptions' && ctx.filters['user_id'] === 'u1') {
            return { data: mockSubscription, error: null } as any;
          }
          return { data: null, error: null } as any;
        },
        update: () => ({ eq: () => ({ error: null }) }),
      };
      return api;
    },
  })),
}));

// Mock Stripe SDK used in the route
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

describe('POST /api/stripe/start-subscription-flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockStripeCustomerId = null;
    mockSubscription = null;
  });

  test('routes new users to Checkout', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test';
    process.env.STRIPE_PRO_PRICE_ID = 'price_pro';
    process.env.STRIPE_ENTERPRISE_PRICE_ID = 'price_ent';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    // No existing customer id and no subscription for user
    mockStripeCustomerId = null;
    mockSubscription = null;

    const { POST } = await import('../../../src/app/api/stripe/start-subscription-flow/route');
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

  test('routes existing subscribers to Billing Portal confirm', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test';
    process.env.STRIPE_PRO_PRICE_ID = 'price_pro';
    process.env.STRIPE_ENTERPRISE_PRICE_ID = 'price_ent';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    // Existing customer id and active subscription
    mockStripeCustomerId = 'cus_test';
    mockSubscription = {
      stripe_subscription_id: 'sub_123',
      status: 'active',
      cancel_at_period_end: false,
    };

    const { POST } = await import('../../../src/app/api/stripe/start-subscription-flow/route');
    const req = {
      method: 'POST',
      json: async () => ({ plan: 'enterprise', returnPath: '/account/subscription?billing_updated=1' }),
    } as any;

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await readResBody(res);
    expect(data).toHaveProperty('url');
    expect(data.url).toContain('stripe.test/portal');
  });
});
