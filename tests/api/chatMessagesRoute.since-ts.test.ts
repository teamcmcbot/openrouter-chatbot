 
/**
 * Tests for GET /api/chat/messages since_ts incremental behavior
 */

// Polyfills for next/server
import { Buffer as NodeBuffer } from 'buffer';
const g: unknown = globalThis as unknown;
(g as { Buffer?: typeof Buffer }).Buffer = (g as { Buffer?: typeof Buffer }).Buffer || (NodeBuffer as unknown as typeof Buffer);

if (!(globalThis as unknown as { Headers?: unknown }).Headers) {
  class HeadersPolyfill { private m = new Map<string, string>(); set(k: string, v: string){ this.m.set(k.toLowerCase(), v); } get(k: string){ return this.m.get(k.toLowerCase()) ?? null; } append(k: string, v: string){ this.set(k, v); } has(k: string){ return this.m.has(k.toLowerCase()); } }
  (globalThis as unknown as { Headers: unknown }).Headers = HeadersPolyfill as unknown;
}
if (!(globalThis as unknown as { Request?: unknown }).Request) {
  class RequestPolyfill { url: string; method: string; headers: unknown; private _body: unknown; constructor(input: string | URL, init?: { method?: string; headers?: unknown; body?: unknown }){ this.url = typeof input === 'string' ? input : input.toString(); this.method = (init?.method || 'GET').toUpperCase(); this.headers = init?.headers || new (globalThis as unknown as { Headers: { new(): unknown } }).Headers(); this._body = init?.body || null; } async json(){ return this._body ? JSON.parse(String(this._body)) : null; } async text(){ return typeof this._body === 'string' ? this._body : (this._body ? JSON.stringify(this._body) : ''); } async formData(){ return new Map(); } }
  (globalThis as unknown as { Request: unknown }).Request = RequestPolyfill as unknown;
}
if (!(globalThis as unknown as { Response?: unknown }).Response) {
  class ResponsePolyfill { status: number; statusText: string; headers: any; url: string; private _body: unknown; constructor(body?: unknown, init?: { status?: number; statusText?: string; headers?: unknown }){ this._body = body; this.status = init?.status ?? 200; this.statusText = init?.statusText ?? ''; const HeadersCtor = (globalThis as unknown as { Headers?: { new(): unknown } }).Headers; this.headers = HeadersCtor ? new (HeadersCtor as any)() : {}; this.url = ''; } static json(data: unknown, init?: { status?: number; statusText?: string; headers?: Record<string, string> }){ const HeadersCtor = (globalThis as unknown as { Headers?: { new(): unknown } }).Headers; const headers = HeadersCtor ? new (HeadersCtor as any)() : undefined; if (headers) { (headers as any).set('content-type', 'application/json'); if (init?.headers) { for (const [k, v] of Object.entries(init.headers)) (headers as any).set(k, v); } } return new ResponsePolyfill(JSON.stringify(data), { status: init?.status, statusText: init?.statusText, headers }); } async json(){ try { return typeof this._body === 'string' ? JSON.parse(this._body) : this._body; } catch { return this._body; } } async text(){ return typeof this._body === 'string' ? this._body : JSON.stringify(this._body); } async arrayBuffer(){ const txt = await this.text(); const enc = new TextEncoder(); return enc.encode(txt).buffer; } }
  (globalThis as unknown as { Response: unknown }).Response = ResponsePolyfill as unknown;
}

// Mock next/server
jest.mock('next/server', () => {
  class MockNextResponse { status: number; headers: any; private _body: unknown; constructor(body?: unknown, init?: { status?: number; headers?: Record<string, string> }){ this.status = init?.status ?? 200; const HeadersCtor = (globalThis as unknown as { Headers?: { new(): unknown } }).Headers; this.headers = HeadersCtor ? new (HeadersCtor as any)() : {}; if (init?.headers && this.headers && 'set' in this.headers) { for (const [k, v] of Object.entries(init.headers)) (this.headers as any).set(k, v); } this._body = body; } static json(body: unknown, init?: { status?: number; headers?: Record<string, string> }){ return new MockNextResponse(body, init); } async json(){ return this._body; } }
  return { NextResponse: MockNextResponse, NextRequest: class { url = ''; constructor(u: string){ this.url = u; } } };
});

// Auth middleware mocks
import type { User } from '@supabase/supabase-js';
import { AuthContext, FeatureFlags, UserProfile } from '../../lib/types/auth';
import type { NextRequest } from 'next/server';

jest.mock('../../lib/middleware/auth', () => ({
  withProtectedAuth: (handler: any) => (req: any) => handler(req, currentAuthContext),
}));

const featureFlags: FeatureFlags = { canModifySystemPrompt: true, canAccessAdvancedModels: true, canUseCustomTemperature: true, canSaveConversations: true, canSyncConversations: true, maxRequestsPerHour: 1000, maxTokensPerRequest: 100000, hasRateLimitBypass: true, canUseProModels: true, canUseEnterpriseModels: false, showAdvancedSettings: true, canExportConversations: false, hasAnalyticsDashboard: false };
const profile: Partial<UserProfile> = { id: 'u1', subscription_tier: 'free', account_type: 'user', default_model: 'gpt', temperature: 0.7, system_prompt: '', credits: 0, created_at: '', updated_at: '' };
const minimalUser = { id: 'u1' } as unknown as User;
const currentAuthContext: AuthContext = { isAuthenticated: true, user: minimalUser, profile: profile as UserProfile, accessLevel: 'authenticated', features: featureFlags };

jest.mock('../../lib/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn() } }));

jest.mock('../../lib/utils/errors', () => {
  const actual = jest.requireActual('../../lib/utils/errors');
  return { ...actual, handleError: (err: unknown) => { const mod = jest.requireMock('next/server'); const message = err instanceof Error ? err.message : String(err); return mod.NextResponse.json({ error: message, code: 'internal_server_error' }, { status: 500 }); } };
});

// Mock supabase for incremental behavior
jest.mock('../../lib/supabase/server', () => {
  type MessageRow = { id: string; session_id: string; role: 'user'|'assistant'|'system'; content: string; message_timestamp: string };
  const messages: MessageRow[] = [
    { id: 'u-1', session_id: 'sess-1', role: 'user', content: 'one', message_timestamp: '2025-08-30T10:00:00.000Z' },
    { id: 'a-1', session_id: 'sess-1', role: 'assistant', content: 'two', message_timestamp: '2025-08-30T10:00:10.000Z' },
    { id: 'u-2', session_id: 'sess-1', role: 'user', content: 'three', message_timestamp: '2025-08-31T10:00:00.000Z' },
  ];
  const sessions = [{ id: 'sess-1', user_id: 'u1' }];
  return {
    __mockState: { messages, sessions },
    createClient: jest.fn(async () => ({
      from: (tableName: string) => {
        const ctx: any = { filters: {}, gtVal: undefined, inFilter: undefined };
        const api = {
          select: () => api,
          eq: (col: string, val: unknown) => { ctx.filters[col] = val; return api; },
          in: (col: string, arr: unknown[]) => { ctx.inFilter = { col, arr }; return api; },
          gt: (col: string, val: unknown) => { ctx.gtVal = { col, val }; return api; },
          order: () => api,
          single: async () => {
            if (tableName === 'chat_sessions') {
              const sid = ctx.filters['id'];
              const uid = ctx.filters['user_id'];
              const row = sessions.find((s) => s.id === sid && s.user_id === uid);
              return row ? { data: row, error: null } : { data: null, error: new Error('not found') };
            }
            return { data: null, error: new Error('unsupported') } as any;
          },
          then: (resolve: any) => {
            if (tableName === 'chat_messages') {
              let rows = messages.filter(m => m.session_id === ctx.filters['session_id']);
              if (ctx.gtVal?.col === 'message_timestamp') {
                rows = rows.filter((m) => new Date(m.message_timestamp) > new Date(ctx.gtVal.val));
              }
              rows = rows.sort((a,b) => new Date(a.message_timestamp).getTime() - new Date(b.message_timestamp).getTime());
              return resolve({ data: rows as any, error: null });
            }
            if (tableName === 'chat_attachments') {
              // This test doesn't exercise attachments; return empty set
              return resolve({ data: [] as any, error: null });
            }
            if (tableName === 'chat_message_annotations') {
              // This test doesn't exercise annotations; return empty set
              return resolve({ data: [] as any, error: null });
            }
            return resolve({ data: [], error: null });
          },
        };
        return api;
      },
    })),
  };
});

// Import route
import { GET as getMessages } from '../../src/app/api/chat/messages/route';

interface MockResponse<T> { status: number; json: () => Promise<T>; headers: unknown; }
const makeReq = (url: string) => ({ headers: { get: () => null }, url } as unknown as NextRequest);

describe('GET /api/chat/messages since_ts', () => {
  it('returns up_to_date when no new messages', async () => {
    const req = makeReq('http://localhost/api/chat/messages?session_id=sess-1&since_ts=2025-08-31T10:00:00.000Z');
    const res = await getMessages(req) as unknown as MockResponse<{ up_to_date: boolean; messages: any[]; count: number }>;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.up_to_date).toBe(true);
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages.length).toBe(0);
  });

  it('returns only newer messages when available', async () => {
    const req = makeReq('http://localhost/api/chat/messages?session_id=sess-1&since_ts=2025-08-30T10:00:10.000Z');
    const res = await getMessages(req) as unknown as MockResponse<{ up_to_date: boolean; messages: any[]; count: number }>;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.up_to_date).toBe(false);
    // Newer than 10:00:10Z is just u-2
    expect(body.messages.map((m: any) => m.id)).toEqual(['u-2']);
  });
});