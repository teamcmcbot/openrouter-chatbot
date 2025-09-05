/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Admin Ban/Unban endpoint tests
 * - Requires admin auth via withAdminAuth
 * - Validates input, self-ban prevention, and snapshot invalidation calls
 */

// Minimal Next polyfill
jest.mock('next/server', () => {
  class NextResponse {
    body: unknown;
    status: number;
    headers: Record<string, string>;
    constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = init?.headers ?? {};
    }
    static json(data: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return new NextResponse(JSON.stringify(data), init);
    }
  }
  class NextRequest {}
  return { NextResponse, NextRequest };
});

// Quiet logger
jest.mock('../../lib/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn(), infoOrDebug: jest.fn() } }));

// Mock auth: always admin, include user id for self-ban guard
const adminCtx = {
  isAuthenticated: true,
  user: { id: 'admin-1' },
  profile: { id: 'admin-1', account_type: 'admin', subscription_tier: 'enterprise' },
  accessLevel: 'authenticated',
  features: {},
};
jest.mock('../../lib/middleware/auth', () => ({
  withAdminAuth: (handler: any) => (req: any) => handler(req, adminCtx),
}));

// Spy on snapshot invalidation
const deleteAuthSnapshot = jest.fn(async () => {});
jest.mock('../../lib/utils/authSnapshot', () => ({ deleteAuthSnapshot }));

// Supabase RPC mock
const rpc = jest.fn(async (fn: string, args: Record<string, any>) => {
  if (fn === 'ban_user') return { data: { ok: true, until: args.p_until, reason: args.p_reason }, error: null } as any;
  if (fn === 'unban_user') return { data: { ok: true, reason: args.p_reason }, error: null } as any;
  return { data: null, error: new Error('unknown rpc') } as any;
});
jest.mock('../../lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({ rpc })),
}));

// Request helper
function makeReq(url: string, body?: any) {
  return {
    url,
    json: async () => body ?? {},
    headers: { get: () => null },
  } as any;
}

describe('Admin users ban/unban API', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  test('ban: 400 when missing reason', async () => {
    const { POST } = await import('../../src/app/api/admin/users/[id]/ban/route');
    const res = await POST(makeReq('http://localhost/api/admin/users/u1/ban', { until: null }));
    expect(res.status).toBe(400);
    const body = JSON.parse((res as any).body);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/Reason required/i);
  });

  test('ban: prevents self-ban', async () => {
    const { POST } = await import('../../src/app/api/admin/users/[id]/ban/route');
    const res = await POST(makeReq('http://localhost/api/admin/users/admin-1/ban', { reason: 'test' }));
    expect(res.status).toBe(400);
    const body = JSON.parse((res as any).body);
    expect(body.error).toMatch(/Cannot ban your own account/i);
    expect(deleteAuthSnapshot).not.toHaveBeenCalled();
  });

  test('ban: invalid until ISO returns 400', async () => {
    const { POST } = await import('../../src/app/api/admin/users/[id]/ban/route');
    const res = await POST(makeReq('http://localhost/api/admin/users/u2/ban', { reason: 'abuse', until: 'not-a-date' }));
    expect(res.status).toBe(400);
    const body = JSON.parse((res as any).body);
    expect(body.error).toMatch(/Invalid until/i);
    expect(deleteAuthSnapshot).not.toHaveBeenCalled();
  });

  test('ban: success invalidates snapshot', async () => {
    const { POST } = await import('../../src/app/api/admin/users/[id]/ban/route');
    const res = await POST(makeReq('http://localhost/api/admin/users/u2/ban', { reason: 'abuse', until: '2025-12-31T00:00:00.000Z' }));
    expect(res.status).toBe(200);
    expect(deleteAuthSnapshot).toHaveBeenCalledWith('u2');
    const body = JSON.parse((res as any).body);
    expect(body.success).toBe(true);
  });

  test('unban: success invalidates snapshot', async () => {
    const { POST } = await import('../../src/app/api/admin/users/[id]/unban/route');
    const res = await POST(makeReq('http://localhost/api/admin/users/u3/unban', { reason: 'appeal accepted' }));
    expect(res.status).toBe(200);
    expect(deleteAuthSnapshot).toHaveBeenCalledWith('u3');
    const body = JSON.parse((res as any).body);
    expect(body.success).toBe(true);
  });
});
