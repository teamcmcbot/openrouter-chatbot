/**
 * Tests for /api/usage/costs and /api/usage/costs/daily handlers using mocked next/server.
 */

// Mock next/server BEFORE importing route modules to avoid real Next dependency on global Request.
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
      headers: new Map<string,string>(),
    }),
  },
  // Provide placeholder NextRequest type (not used at runtime in our handlers beyond .url parsing)
  NextRequest: class { url = ''; constructor(u: string){ this.url = u; } }
}));
import { NextResponse } from 'next/server';

// Mocks must come before route imports
import { AuthContext, FeatureFlags, UserProfile } from '../../lib/types/auth';

interface MinimalUser { id: string }
const featureFlags: FeatureFlags = {
  canModifySystemPrompt: true,
  canAccessAdvancedModels: true,
  canUseCustomTemperature: true,
  canSaveConversations: true,
  canSyncConversations: true,
  maxRequestsPerHour: 1000,
  maxTokensPerRequest: 100000,
  hasRateLimitBypass: false,
  canUseProModels: true,
  canUseEnterpriseModels: false,
  showAdvancedSettings: true,
  canExportConversations: false,
  hasAnalyticsDashboard: false,
};
const profile: Partial<UserProfile> = { id: 'user-1', subscription_tier: 'free', account_type: 'user', default_model: 'gpt', temperature: 0.7, system_prompt: '', credits: 0, created_at: '', updated_at: '' };
const minimalUser: MinimalUser = { id: 'user-1' };
import type { User } from '@supabase/supabase-js';
const mockAuthContextAuthenticated: AuthContext = {
  isAuthenticated: true,
  user: minimalUser as unknown as User, // minimal user shape
  profile: profile as UserProfile,
  accessLevel: 'authenticated',
  features: featureFlags,
};
const mockAuthContextUnauth: AuthContext = {
  isAuthenticated: false,
  user: null,
  profile: null,
  accessLevel: 'anonymous',
  features: featureFlags,
};

let currentAuthContext = mockAuthContextAuthenticated;

jest.mock('../../lib/utils/auth', () => ({
  extractAuthContext: jest.fn(() => currentAuthContext),
  hasPermission: jest.fn(() => true),
}));

// Minimal logger + error handlers suppress noise
jest.mock('../../lib/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn() } }));

jest.mock('../../lib/utils/errors', () => ({
  handleError: (err: unknown) => (NextResponse as any).json({ error: (err as Error).message || 'error' }, { status: 500 }),
  createAuthError: (_code: string, message: string) => new Error(message),
  handleAuthError: (err: unknown) => (NextResponse as any).json({ error: (err as Error).message || 'auth error' }, { status: 401 }),
}));

// Supabase mock infrastructure
interface Row {
  assistant_message_id: string;
  session_id: string;
  model_id: string;
  message_timestamp: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_cost: string;
  completion_cost: string;
  image_cost: string;
  total_cost: string;
  user_id: string;
}

const baseRows: Row[] = [
  {
    assistant_message_id: 'm1', session_id: 's1', model_id: 'modelA',
    message_timestamp: new Date(Date.now() - 2*24*60*60*1000).toISOString(),
    prompt_tokens: 50, completion_tokens: 150, total_tokens: 200,
    prompt_cost: '0.010000', completion_cost: '0.030000', image_cost: '0.000000', total_cost: '0.040000', user_id: 'user-1'
  },
  {
    assistant_message_id: 'm2', session_id: 's1', model_id: 'modelB',
    message_timestamp: new Date(Date.now() - 1*24*60*60*1000).toISOString(),
    prompt_tokens: 20, completion_tokens: 80, total_tokens: 100,
    prompt_cost: '0.004000', completion_cost: '0.016000', image_cost: '0.000000', total_cost: '0.020000', user_id: 'user-1'
  },
  {
    assistant_message_id: 'm3', session_id: 's2', model_id: 'modelA',
    message_timestamp: new Date().toISOString(),
    prompt_tokens: 10, completion_tokens: 40, total_tokens: 50,
    prompt_cost: '0.002000', completion_cost: '0.008000', image_cost: '0.000000', total_cost: '0.010000', user_id: 'user-1'
  }
];

function buildFiltered(rows: Row[], filters: { modelId?: string }) {
  let r = rows;
  if (filters.modelId) r = r.filter(x => x.model_id === filters.modelId);
  return r;
}

interface QueryBuilder {
  _modelId?: string;
  select(sel: string): QueryBuilder;
  eq(col: string, val: unknown): QueryBuilder;
  gte(col: string, val: unknown): QueryBuilder;
  lt(col: string, val: unknown): QueryBuilder;
  order(col: string, opts: { ascending: boolean }): QueryBuilder;
  range(from: number, to: number): Promise<{ data: Row[]; count: number; error: null }>; 
  then(res: (arg: { data: Row[]; error: null }) => void): void;
}

function makeQuery(rows: Row[]): QueryBuilder {
  const qb: QueryBuilder & { _rows: Row[]; _select?: string } = {
    _modelId: undefined as string | undefined,
    _rows: rows,
    select(sel: string) { this._select = sel; return this; },
    eq(col: string, val: unknown) { if (col === 'model_id') this._modelId = String(val); return this; },
    gte() { return this; },
    lt() { return this; },
    order() { return this; },
    range(from: number, to: number) {
      const filtered = buildFiltered(this._rows, { modelId: this._modelId });
      return Promise.resolve({ data: filtered.slice(from, to + 1), count: filtered.length, error: null });
    },
    then(res: (arg: { data: Row[]; error: null }) => void) { // aggregator
      const filtered = buildFiltered(this._rows, { modelId: this._modelId });
      res({ data: filtered, error: null });
    }
  };
  return qb;
}

jest.mock('../../lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    from: () => makeQuery(baseRows),
  }))
}));

// Route imports AFTER mocks
import { GET as getCosts } from '../../src/app/api/usage/costs/route';
import { GET as getDaily } from '../../src/app/api/usage/costs/daily/route';

// Minimal NextRequest stub (only url referenced by code under test)
// Create a minimal object with just a url field; middleware & handlers only access req.url
interface UrlOnlyRequest { url: string }
function makeRequest(url: string): UrlOnlyRequest { return { url }; }

describe('GET /api/usage/costs', () => {
  test('returns paginated items and summary', async () => {
    currentAuthContext = mockAuthContextAuthenticated;
  const res: any = await getCosts(makeRequest('http://localhost/api/usage/costs?range=7d') as any);
  expect(res.status).toBe(200);
  const body = await res.json();
    expect(body.items.length).toBeGreaterThan(0);
    const sumTokens = baseRows.reduce((a,r)=> a + r.total_tokens, 0);
    expect(body.summary.total_tokens).toBe(sumTokens);
    expect(body.pagination.page).toBe(1);
  });

  test('applies model filter', async () => {
    currentAuthContext = mockAuthContextAuthenticated;
  const res: any = await getCosts(makeRequest('http://localhost/api/usage/costs?range=7d&model_id=modelA') as any);
  const body = await res.json();
  expect(body.items.every((i: { model_id: string }) => i.model_id === 'modelA')).toBe(true);
    const expectedTokens = baseRows.filter(r=> r.model_id==='modelA').reduce((a,r)=> a + r.total_tokens, 0);
    expect(body.summary.total_tokens).toBe(expectedTokens);
  });

  test('unauthorized when not authenticated', async () => {
    currentAuthContext = mockAuthContextUnauth;
  const res: any = await getCosts(makeRequest('http://localhost/api/usage/costs?range=7d') as any);
  expect(res.status).toBe(401);
  });
});

describe('GET /api/usage/costs/daily', () => {
  test('returns daily rollups summing to total', async () => {
    currentAuthContext = mockAuthContextAuthenticated;
  const res: any = await getDaily(makeRequest('http://localhost/api/usage/costs/daily?range=7d') as any);
  expect(res.status).toBe(200);
  const body = await res.json();
  const totalFromDaily = body.items.reduce((a: number, d: { total_tokens: number }) => a + d.total_tokens, 0);
    expect(totalFromDaily).toBe(body.summary.total_tokens);
  });
});
