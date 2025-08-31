/**
 * Tests for CTA analytics endpoint DB persistence path
 */

// Mock supabase server client to control rpc behavior
jest.mock('../../lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: jest.fn(async () => ({ data: null, error: null })),
  }),
}));

// Reuse middleware and logger mocks from previous test
jest.mock('../../lib/middleware/auth', () => ({
  withEnhancedAuth: (handler: (req: unknown, ctx: unknown) => unknown) => (req: unknown) => handler(req, { isAuthenticated: false, user: null }),
}));
jest.mock('../../lib/middleware/redisRateLimitMiddleware', () => ({
  withRedisRateLimit: (handler: (req: unknown, ctx: unknown) => unknown) => (req: unknown, ctx: unknown) => handler(req, ctx),
  withRedisRateLimitEnhanced: (handler: (req: unknown, ctx: unknown) => unknown) => (req: unknown, ctx: unknown) => handler(req, ctx),
  addRateLimitHeaders: (res: unknown) => res,
}));
jest.mock('../../lib/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

// Mock next/server minimal
jest.mock('next/server', () => ({
  NextResponse: class { static json(body: unknown, init?: { status?: number }) { return { status: init?.status ?? 200, json: async () => body }; } },
  NextRequest: class {},
}));

import { POST as trackCta } from '../../src/app/api/analytics/cta/route';

const req = (body: unknown) => ({ method: 'POST', headers: new Map(), json: async () => body });

describe('CTA analytics API DB path', () => {
  it('returns ok even if RPC errors', async () => {
  const serverMod = await import('../../lib/supabase/server');
    const client = await (serverMod as unknown as { createClient: () => Promise<{ rpc: jest.Mock }> }).createClient();
    client.rpc.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });

    const res = await (trackCta as unknown as (r: unknown) => Promise<{ status: number; json: () => Promise<unknown> }>)(req({ page: 'landing', cta_id: 'start_chat' }));
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean };
    expect(data.ok).toBe(true);
  });
});
