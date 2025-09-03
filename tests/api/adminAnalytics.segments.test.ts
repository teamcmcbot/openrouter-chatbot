/**
 * Segmented Admin Analytics tests: validates `segments` in analytics endpoints and `?segment=anonymous` for errors.
 */

// Mock next/server BEFORE route imports
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

// Admin auth passthrough
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

// Minimal logger + error utils
jest.mock('../../lib/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn() } }));
jest.mock('../../lib/utils/errors', () => ({
  handleError: (err: unknown) => ({ status: 500, json: async () => ({ error: (err as Error).message || 'error' }), headers: new Map<string,string>() }),
}));

// Supabase mock covering both authenticated and anonymous paths
const now = new Date();
const iso = (d: Date) => d.toISOString().slice(0,10);
const day = (off: number) => new Date(now.getTime() + off*86400000);

const seedAuthCosts = [
  { usage_period: iso(day(-1)), model_id: 'auth-model', total_tokens: 100, total_cost: 0.2, assistant_messages: 3, distinct_users: 2, prompt_tokens: 30, completion_tokens: 70 },
];
const seedAnonCosts = [
  { usage_period: iso(day(-1)), model_id: 'anon-model', total_tokens: 50, estimated_cost: 0.05, assistant_messages: 1, prompt_tokens: 10, completion_tokens: 40 },
];
const seedAnonUsageDaily = [
  { usage_date: iso(day(-1)), anon_hash: 'anon-1', messages_received: 5 },
];
const seedAnonModelDaily = [
  { usage_date: iso(day(-1)), model_id: 'anon-model', total_tokens: 50, estimated_cost: 0.05, assistant_messages: 1, generation_ms: 500 },
];
const seedAnonErrors = [
  { model: 'anon-model', message_timestamp: day(-1).toISOString(), error_message: 'anon boom', provider: 'openrouter', provider_request_id: 'req1', completion_id: null, elapsed_ms: 200 },
];

function makeBuilder(table: string) {
  const builder = {
    gte: () => builder,
  lt: () => (table === 'message_token_costs' ? builder : Promise.resolve({ data: [], error: null })),
  order: () => Promise.resolve({ data: [], error: null }),
  limit: () => Promise.resolve({ data: [], error: null })
  };
  // Wire anonymous read paths used by routes
  if (table === 'anonymous_usage_daily') {
    return {
      gte: () => ({ lt: () => Promise.resolve({ data: seedAnonUsageDaily, error: null }) })
    } as unknown as typeof builder;
  }
  if (table === 'anonymous_model_usage_daily') {
    return {
  gte: () => ({ lt: () => Promise.resolve({ data: seedAnonModelDaily, error: null }) })
    } as unknown as typeof builder;
  }
  // Minimal stubs for other tables referenced by overview but not central to segments assertions
  if (table === 'profiles' || table === 'chat_sessions' || table === 'chat_messages') {
    return {
      select: () => Promise.resolve({ data: [], count: 0, error: null }),
    } as unknown as typeof builder;
  }
  return builder;
}

jest.mock('../../lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    from: (table: string) => ({
  select: () => {
        if (table === 'profiles' || table === 'chat_sessions' || table === 'chat_messages') {
          return Promise.resolve({ data: [], count: 0, error: null });
        }
        return makeBuilder(table);
      },
    }),
    rpc: (fn: string) => {
      if (fn === 'get_global_model_costs') return Promise.resolve({ data: seedAuthCosts, error: null });
      if (fn === 'get_anonymous_model_costs') return Promise.resolve({ data: seedAnonCosts, error: null });
      if (fn === 'get_error_count') return Promise.resolve({ data: 1, error: null });
      if (fn === 'get_recent_errors') return Promise.resolve({ data: [], error: null });
      if (fn === 'get_anonymous_errors') return Promise.resolve({ data: seedAnonErrors, error: null });
      return Promise.resolve({ data: null, error: null });
    },
  }))
}));

// Import routes AFTER mocks
import { GET as getOverview } from '../../src/app/api/admin/analytics/overview/route';
import { GET as getCosts } from '../../src/app/api/admin/analytics/costs/route';
import { GET as getPerf } from '../../src/app/api/admin/analytics/performance/route';
import { GET as getPerfErrors } from '../../src/app/api/admin/analytics/performance/errors/route';
import { GET as getUsage } from '../../src/app/api/admin/analytics/usage/route';

interface UrlOnlyRequest { url: string }
const req = (u: string): UrlOnlyRequest => ({ url: u });

// Minimal shapes used for type assertions in tests
type SegOverview = { segments: { authenticated: unknown; anonymous: { usage_7d: { total_tokens: number; messages: number; anon_sessions?: number }, costs_7d: { total_cost: number } } } };
type SegCosts = { segments: { anonymous: { totals: { total_cost: number }, stacked_cost: { days: unknown[] } } } };
type SegUsage = { segments: { anonymous: { daily: Array<{ active_users: number }> } } };
type SegPerf = { segments: { anonymous: { overall: { avg_ms: number; error_count: number } } } };
type PerfErrors = { ok: boolean; errors: Array<{ model?: string }> };

describe('Admin Analytics segments', () => {
  test('overview includes segments with anonymous usage and costs', async () => {
  const res = await (getOverview as unknown as (r: UrlOnlyRequest) => Promise<{ status: number; json: () => Promise<SegOverview> }>)(req('http://localhost/api/admin/analytics/overview?range=7d'));
  const body = await res.json();
    expect(body.segments).toBeTruthy();
    expect(body.segments.authenticated).toBeTruthy();
    expect(body.segments.anonymous).toBeTruthy();
    expect(body.segments.anonymous.usage_7d).toBeTruthy();
    expect(body.segments.anonymous.costs_7d.total_cost).toBeCloseTo(0.05, 5);
  });

  test('costs returns segmented totals for anonymous', async () => {
  const res = await (getCosts as unknown as (r: UrlOnlyRequest) => Promise<{ status: number; json: () => Promise<SegCosts> }>)(req('http://localhost/api/admin/analytics/costs?range=7d'));
  const body = await res.json();
    expect(body.segments.anonymous.totals.total_cost).toBeCloseTo(0.05, 5);
    expect(Array.isArray(body.segments.anonymous.stacked_cost.days)).toBe(true);
  });

  test('usage returns anonymous daily with anon_sessions', async () => {
  const res = await (getUsage as unknown as (r: UrlOnlyRequest) => Promise<{ status: number; json: () => Promise<SegUsage> }>)(req('http://localhost/api/admin/analytics/usage?range=7d'));
  const body = await res.json();
  const anon = body.segments.anonymous;
  expect(anon).toBeTruthy();
  expect(anon.daily[0].active_users).toBe(1);
  });

  test('performance includes anonymous segment averages and errors', async () => {
  const res = await (getPerf as unknown as (r: UrlOnlyRequest) => Promise<{ status: number; json: () => Promise<SegPerf> }>)(req('http://localhost/api/admin/analytics/performance?range=7d'));
  const body = await res.json();
    expect(body.segments.anonymous.overall.error_count).toBe(1);
    // avg derived from seedAnonModelDaily generation_ms and messages
    expect(body.segments.anonymous.overall.avg_ms).toBe(500);
  });

  test('performance/errors returns anonymous rows when segment=anonymous', async () => {
  const res = await (getPerfErrors as unknown as (r: UrlOnlyRequest) => Promise<{ status: number; json: () => Promise<PerfErrors> }>)(req('http://localhost/api/admin/analytics/performance/errors?range=7d&segment=anonymous&limit=5'));
  const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.errors.length).toBeGreaterThan(0);
    expect(body.errors[0].model).toBe('anon-model');
  });
});
