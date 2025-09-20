// Minimal webhook idempotency test

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

// Quiet logs
jest.mock('../../../lib/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn() } }));

// Service client mock: emulate stripe_events idempotency and minimal profiles/subscriptions writes
jest.mock('../../../lib/supabase/service', () => {
  const events = new Set<string>();
  return {
    createServiceClient: () => ({
      from: (table: string) => {
        const ctx: any = { filters: {} };
        const api: any = {
          select: () => api,
          eq: (col: string, val: unknown) => { ctx.filters[col] = val; return api; },
          maybeSingle: async () => {
            if (table === 'stripe_events' && ctx.filters['id']) {
              const exists = events.has(String(ctx.filters['id']))
                ? { id: ctx.filters['id'] } : null;
              return { data: exists, error: null };
            }
            if (table === 'profiles' && ctx.filters['stripe_customer_id']) {
              return { data: { id: 'u1' }, error: null };
            }
            return { data: null, error: null } as any;
          },
          insert: async (obj: any) => {
            if (table === 'stripe_events' && obj?.id) events.add(obj.id);
            return { error: null };
          },
          upsert: async () => ({ error: null }),
          update: () => ({ eq: () => ({ error: null }) }),
        };
        return api;
      },
    })
  };
});

// Stripe SDK mock: constructEvent returns payload and signature is ignored in test
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: (rawBody: Buffer) => JSON.parse(rawBody.toString('utf-8')),
    },
  }));
});

describe('Stripe webhook idempotency', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  test('re-processing same event is ignored', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';

    const { POST } = await import('../../../src/app/api/stripe/webhook/route');
    const event = { id: 'evt_1', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'active', items: { data: [ { price: { id: 'price_pro' } } ] } , customer: 'cus_1' } } };

    const headers = new Map<string, string>([['stripe-signature', 't=1,v1=dummy']]);
    const body = Buffer.from(JSON.stringify(event), 'utf-8');
    const makeReq = () => ({
      arrayBuffer: async () => body,
      headers: { get: (k: string) => headers.get(k) },
    });

    const res1 = await POST(makeReq() as any);
    expect(res1.status).toBe(200);

    // Send the same event again (should be idempotent)
    const res2 = await POST(makeReq() as any);
    expect(res2.status).toBe(200);
  });
});
