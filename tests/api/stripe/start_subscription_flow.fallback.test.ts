export {};

// Tests the fallback path when Stripe rejects advanced flow_data params

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

jest.mock('../../../lib/middleware/redisRateLimitMiddleware', () => ({
  withTieredRateLimit: (handler: any) => handler,
}));

jest.mock('../../../lib/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn() } }));

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

// Supabase mock: existing customer id and subscription
jest.mock('../../../lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    from: (table: string) => {
      const ctx: any = { filters: {} };
      const api: any = {
        select: () => api,
        eq: (col: string, val: unknown) => { ctx.filters[col] = val; return api; },
        order: () => api,
        limit: () => api,
        single: async () => {
          if (table === 'profiles' && ctx.filters['id'] === 'u1') {
            return { data: { id: 'u1', email: 'u1@test.dev', stripe_customer_id: 'cus_test' }, error: null };
          }
          return { data: null, error: new Error('not found') } as any;
        },
        maybeSingle: async () => {
          if (table === 'subscriptions' && ctx.filters['user_id'] === 'u1') {
            return { data: { stripe_subscription_id: 'sub_123', status: 'active', cancel_at_period_end: false }, error: null } as any;
          }
          return { data: null, error: null } as any;
        },
        update: () => ({ eq: () => ({ error: null }) }),
      };
      return api;
    },
  })),
}));

// Stripe mock: confirm path will throw on retrieve; then
// 1) minimal rejects, 2) plain succeeds
const createPortalMock = jest.fn()
  .mockRejectedValueOnce({
    code: 'parameter_unknown',
    param: 'flow_data[subscription_update]',
    message: 'Received unknown parameter flow_data[subscription_update]',
  })
  .mockResolvedValueOnce({ url: 'https://stripe.test/portal-plain' });

jest.mock('stripe', () => {
  const StripeMock: any = jest.fn().mockImplementation(() => ({
    customers: { create: jest.fn(async () => ({ id: 'cus_test' })) },
    checkout: { sessions: { create: jest.fn(async () => ({ url: 'https://stripe.test/checkout' })) } },
    subscriptions: { retrieve: jest.fn(async () => { throw Object.assign(new Error('confirm_not_supported'), { code: 'confirm_not_supported' }); }) },
    billingPortal: { sessions: { create: createPortalMock } },
  }));
  StripeMock.default = StripeMock;
  return StripeMock;
});

if (!(global as any).crypto) {
  (global as any).crypto = { randomUUID: () => 'uuid-test' } as any;
} else if (!(global as any).crypto.randomUUID) {
  (global as any).crypto.randomUUID = () => 'uuid-test';
}

async function readResBody(res: any): Promise<any> {
  const body = res?.body;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  try { return JSON.parse(text); } catch { return text; }
}

describe('start-subscription-flow fallback behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  test('falls back to minimal then plain when confirm flow unsupported', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test';
    process.env.STRIPE_PRO_PRICE_ID = 'price_pro';
    process.env.STRIPE_ENTERPRISE_PRICE_ID = 'price_ent';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    const { POST } = await import('../../../src/app/api/stripe/start-subscription-flow/route');
    const req = { method: 'POST', json: async () => ({ plan: 'enterprise' }) } as any;

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await readResBody(res);
    expect(data.url).toContain('stripe.test/portal-plain');

    // Ensure minimal was attempted and then plain
    expect(createPortalMock).toHaveBeenCalledTimes(2);
    const firstArgs = createPortalMock.mock.calls[0][0];
    const secondArgs = createPortalMock.mock.calls[1][0];

    // 1) minimal has no items
    expect(firstArgs.flow_data.subscription_update).not.toHaveProperty('items');
    // 2) plain has no flow_data
    expect(secondArgs.flow_data).toBeUndefined();
  });
});
