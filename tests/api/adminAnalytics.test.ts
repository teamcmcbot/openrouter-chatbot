/**
 * Tests for /api/admin/analytics/* handlers using mocked next/server, middleware, and Supabase client.
 */

// 1) Mock next/server BEFORE importing route modules
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
      headers: new Map<string, string>(),
    }),
  },
  NextRequest: class { url = ''; constructor(u: string){ this.url = u; } }
}));

// 2) Middleware: provide admin auth context pass-through
import type { AuthContext, FeatureFlags, UserProfile } from '../../lib/types/auth';
const flags: FeatureFlags = {
  canModifySystemPrompt: true,
  canAccessAdvancedModels: true,
  canUseCustomTemperature: true,
  canSaveConversations: true,
  canSyncConversations: true,
  maxRequestsPerHour: 1000,
  maxTokensPerRequest: 100000,
  hasRateLimitBypass: true,
  canUseProModels: true,
  canUseEnterpriseModels: true,
  showAdvancedSettings: true,
  canExportConversations: false,
  hasAnalyticsDashboard: true,
};
const adminProfile: Partial<UserProfile> = { account_type: 'admin', subscription_tier: 'enterprise' };
const adminCtx: AuthContext = { isAuthenticated: true, user: null, profile: adminProfile as UserProfile, accessLevel: 'authenticated', features: flags };

jest.mock('../../lib/middleware/auth', () => ({
  withAdminAuth: (handler: (req: unknown, ctx: AuthContext) => unknown) => (req: unknown) => handler(req, adminCtx),
}));
jest.mock('../../lib/middleware/redisRateLimitMiddleware', () => ({
  withTieredRateLimit: (handler: (req: unknown, ctx: AuthContext) => unknown) => (req: unknown) => handler(req, adminCtx),
}));

// 3) Minimal logger + error utils
jest.mock('../../lib/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn() } }));
jest.mock('../../lib/utils/errors', () => ({
  handleError: (err: unknown) => ({ status: 500, json: async () => ({ error: (err as Error).message || 'error' }), headers: new Map<string,string>() }),
}));

// 4) Supabase mock infra and seeds
const now = new Date();
const iso = (d: Date) => d.toISOString().slice(0,10);
const day = (off: number) => new Date(now.getTime() + off*86400000);

const seedCounts = { total_count: 358, new_count: 0, active_count: 52, inactive_count: 35, disabled_count: 271 } as const;
const seedRecent = [
  { day: iso(day(0)), flagged_new: 0, flagged_active: 52, flagged_inactive: 0, flagged_disabled: 271 },
  { day: iso(day(-1)), flagged_new: 0, flagged_active: 0, flagged_inactive: 1, flagged_disabled: 0 },
];
const seedUsageDaily = [
  { usage_date: iso(day(-1)), user_id: 'u1', assistant_messages: 3, total_tokens: 1000 },
  { usage_date: iso(day(-1)), user_id: 'u2', assistant_messages: 2, total_tokens: 500 },
  { usage_date: iso(day(0)), user_id: 'u1', assistant_messages: 5, total_tokens: 800 },
];
const seedCostsRows = [
  { usage_period: iso(day(-1)), model_id: 'modelA', prompt_tokens: 10, completion_tokens: 90, total_tokens: 100, total_cost: 0.2, assistant_messages: 3, distinct_users: 2 },
  { usage_period: iso(day(0)), model_id: 'modelB', prompt_tokens: 5, completion_tokens: 45, total_tokens: 50, total_cost: 0.1, assistant_messages: 2, distinct_users: 1 },
];
const seedLatency = [
  { message_timestamp: day(-1).toISOString(), elapsed_ms: 0 },
  { message_timestamp: day(-1).toISOString(), elapsed_ms: 100 },
  { message_timestamp: day(0).toISOString(), elapsed_ms: 200 },
];
const seedErrorCount = 7;
const seedRecentErrors = [
  { message_id: 'mid-1', session_id: 's1', user_id: 'u1', model: 'modelA', message_timestamp: day(0).toISOString(), error_message: 'boom', completion_id: null, user_message_id: 'um1', elapsed_ms: 123 },
];

// Unified builder producing the exact shapes our handlers await
function makeBuilder(table: string, opts?: { head?: boolean }) {
  const builder = {
    gte: () => builder,
    lt: () => {
      // For message_token_costs latency path, continue chaining to .order()
      if (table === 'message_token_costs' && !opts?.head) return builder;
      // For daily aggregate tables, return final result here
      if (table === 'user_usage_daily') return Promise.resolve({ data: [{ messages_sent: 2, messages_received: 3, total_tokens: 1500 }], error: null });
      if (table === 'user_model_costs_daily') return Promise.resolve({ data: seedUsageDaily, error: null });
      if (table === 'message_token_costs' && opts?.head) return Promise.resolve({ data: [], count: 3, error: null });
      return Promise.resolve({ data: [], error: null });
    },
    order: () => {
      if (table === 'message_token_costs') return Promise.resolve({ data: seedLatency, error: null });
      if (table === 'v_model_recent_activity_admin') return Promise.resolve({ data: seedRecent, error: null });
      return Promise.resolve({ data: [], error: null });
    },
    limit: (n: number) => {
      if (table === 'v_sync_stats') return Promise.resolve({ data: [{ last_success_at: day(-1).toISOString(), success_rate_30d: 0.99 }].slice(0,n), error: null });
      if (table === 'v_model_counts_public') return Promise.resolve({ data: [seedCounts].slice(0,n), error: null });
      return Promise.resolve({ data: [], error: null });
    },
  };
  return builder;
}

jest.mock('../../lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    from: (table: string) => ({
      select: (_sel: string, options?: { count?: 'exact'; head?: boolean }) => {
        // Head counts arrive later after .gte/.lt for message_token_costs; for others we return promises directly when needed.
        if (table === 'profiles') return Promise.resolve({ data: [], count: 2, error: null });
        if (table === 'chat_sessions') return Promise.resolve({ data: [], count: 5, error: null });
        if (table === 'chat_messages') return Promise.resolve({ data: [], count: 12, error: null });
        return makeBuilder(table, options);
      },
      order: (col: string) => {
        if (table === 'v_model_recent_activity_admin' && col === 'day') return Promise.resolve({ data: seedRecent, error: null });
        return Promise.resolve({ data: [], error: null });
      },
    }),
    rpc: (fn: 'get_global_model_costs' | 'get_error_count' | 'get_recent_errors') => {
      if (fn === 'get_global_model_costs') return Promise.resolve({ data: seedCostsRows, error: null });
      if (fn === 'get_error_count') return Promise.resolve({ data: seedErrorCount, error: null });
      if (fn === 'get_recent_errors') return Promise.resolve({ data: seedRecentErrors, error: null });
      return Promise.resolve({ data: null, error: null });
    },
  }))
}));

// 5) Import routes AFTER mocks
import { GET as getOverview } from '../../src/app/api/admin/analytics/overview/route';
import { GET as getCosts } from '../../src/app/api/admin/analytics/costs/route';
import { GET as getPerf } from '../../src/app/api/admin/analytics/performance/route';
import { GET as getPerfErrors } from '../../src/app/api/admin/analytics/performance/errors/route';
import { GET as getUsage } from '../../src/app/api/admin/analytics/usage/route';
import { GET as getModels } from '../../src/app/api/admin/analytics/models/route';

// Minimal request stub
interface UrlOnlyRequest { url: string }
const req = (u: string): UrlOnlyRequest => ({ url: u });

// 6) Tests

describe('Admin Analytics API', () => {
  test('overview returns totals and top models', async () => {
    const res = await (getOverview as unknown as (r: UrlOnlyRequest) => Promise<{ status: number; json: () => Promise<unknown> }>)(req('http://localhost/api/admin/analytics/overview?range=7d'));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; totals: { users: number } };
    expect(body.ok).toBe(true);
    expect(body.totals.users).toBeGreaterThanOrEqual(0);
  });

  test('costs returns stacked series and totals', async () => {
    const res = await (getCosts as unknown as (r: UrlOnlyRequest) => Promise<{ status: number; json: () => Promise<unknown> }>)(req('http://localhost/api/admin/analytics/costs?range=7d&granularity=day'));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; stacked_cost: { days: unknown[] }; totals: { total_cost: number } };
    expect(body.ok).toBe(true);
    expect((body.stacked_cost.days as unknown[]).length).toBeGreaterThan(0);
    expect(body.totals.total_cost).toBeCloseTo(0.3, 5);
  });

  test('performance excludes zero ms and reports error_count', async () => {
    const res = await (getPerf as unknown as (r: UrlOnlyRequest) => Promise<{ status: number; json: () => Promise<unknown> }>)(req('http://localhost/api/admin/analytics/performance?range=7d'));
    const body = await res.json() as { overall: { avg_ms: number; error_count: number } };
    expect(body.overall.avg_ms).toBe(150);
    expect(body.overall.error_count).toBe(seedErrorCount);
  });

  test('recent errors returns rows', async () => {
    const res = await (getPerfErrors as unknown as (r: UrlOnlyRequest) => Promise<{ status: number; json: () => Promise<unknown> }>)(req('http://localhost/api/admin/analytics/performance/errors?range=7d&limit=5'));
    const body = await res.json() as { ok: boolean; errors: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.errors.length).toBe(seedRecentErrors.length);
  });

  test('usage aggregates distinct users per day and total messages count', async () => {
    const res = await (getUsage as unknown as (r: UrlOnlyRequest) => Promise<{ status: number; json: () => Promise<unknown> }>)(req('http://localhost/api/admin/analytics/usage?range=7d'));
    const body = await res.json() as { daily: Array<{ date: string; active_users: number }>; total_messages: number };
    const targetDate = seedUsageDaily[0].usage_date;
    const row = body.daily.find(d => d.date === targetDate);
    expect(row?.active_users).toBe(2);
    expect(body.total_messages).toBe(3);
  });

  test('models returns counts and recent activity', async () => {
    const res = await (getModels as unknown as (r: UrlOnlyRequest) => Promise<{ status: number; json: () => Promise<unknown> }>)(req('http://localhost/api/admin/analytics/models'));
    const body = await res.json() as { counts: typeof seedCounts; recent: typeof seedRecent };
    expect(body.counts.total_count).toBe(seedCounts.total_count);
    expect(Array.isArray(body.recent)).toBe(true);
  });
});
