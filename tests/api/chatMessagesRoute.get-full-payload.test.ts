/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for GET /api/chat/messages full payload mapping
 */

// Polyfills first: Buffer, Headers, Request, Response (needed by next/server and middleware)
import { Buffer as NodeBuffer } from 'buffer';
const g: unknown = globalThis as unknown;
(g as { Buffer?: typeof Buffer }).Buffer = (g as { Buffer?: typeof Buffer }).Buffer || (NodeBuffer as unknown as typeof Buffer);

if (!(globalThis as unknown as { Headers?: unknown }).Headers) {
  class HeadersPolyfill {
    private m = new Map<string, string>();
    set(k: string, v: string) { this.m.set(k.toLowerCase(), v); }
    get(k: string) { return this.m.get(k.toLowerCase()) ?? null; }
    append(k: string, v: string) { this.set(k, v); }
    has(k: string) { return this.m.has(k.toLowerCase()); }
  }
  (globalThis as unknown as { Headers: unknown }).Headers = HeadersPolyfill as unknown;
}
if (!(globalThis as unknown as { Request?: unknown }).Request) {
  class RequestPolyfill {
    url: string;
    method: string;
    headers: unknown;
    private _body: unknown;
    constructor(input: string | URL, init?: { method?: string; headers?: unknown; body?: unknown }) {
      this.url = typeof input === 'string' ? input : input.toString();
      this.method = (init?.method || 'GET').toUpperCase();
      this.headers = init?.headers || new (globalThis as unknown as { Headers: { new(): unknown } }).Headers();
      this._body = init?.body || null;
    }
    async json() { return this._body ? JSON.parse(String(this._body)) : null; }
    async text() { return typeof this._body === 'string' ? this._body : (this._body ? JSON.stringify(this._body) : ''); }
    async formData() { return new Map(); }
  }
  (globalThis as unknown as { Request: unknown }).Request = RequestPolyfill as unknown;
}
if (!(globalThis as unknown as { Response?: unknown }).Response) {
  class ResponsePolyfill {
    status: number;
    statusText: string;
    headers: unknown;
    url: string;
    private _body: unknown;
    constructor(body?: unknown, init?: { status?: number; statusText?: string; headers?: unknown }) {
      this._body = body;
      this.status = init?.status ?? 200;
      this.statusText = init?.statusText ?? '';
      this.headers = init?.headers || new (globalThis as unknown as { Headers: { new(): unknown } }).Headers();
      this.url = '';
    }
    static json(data: unknown, init?: { status?: number; statusText?: string; headers?: Record<string, string> }) {
      const HeadersCtor = (globalThis as unknown as { Headers?: { new(): unknown } }).Headers;
      const headers = HeadersCtor ? new (HeadersCtor as any)() : undefined;
      if (headers) {
        (headers as any).set('content-type', 'application/json');
        if (init?.headers) {
          for (const [k, v] of Object.entries(init.headers)) (headers as any).set(k, v);
        }
      }
      return new ResponsePolyfill(JSON.stringify(data), { status: init?.status, statusText: init?.statusText, headers });
    }
    async json() { try { return typeof this._body === 'string' ? JSON.parse(this._body) : this._body; } catch { return this._body; } }
    async text() { return typeof this._body === 'string' ? this._body : JSON.stringify(this._body); }
    async arrayBuffer() { const txt = await this.text(); const enc = new TextEncoder(); return enc.encode(txt).buffer; }
  }
  (globalThis as unknown as { Response: unknown }).Response = ResponsePolyfill as unknown;
}

// Mock next/server before importing routes
jest.mock('next/server', () => {
  class MockNextResponse {
    status: number;
    headers: any;
    private _body: unknown;
    constructor(body?: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.status = init?.status ?? 200;
      const HeadersCtor = (globalThis as unknown as { Headers?: { new(): unknown } }).Headers;
      this.headers = HeadersCtor ? new (HeadersCtor as any)() : {};
      if (init?.headers && this.headers && 'set' in this.headers) {
        for (const [k, v] of Object.entries(init.headers)) (this.headers as any).set(k, v);
      }
      this._body = body;
    }
    static json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return new MockNextResponse(body, init);
    }
    async json() { return this._body; }
  }
  return {
    NextResponse: MockNextResponse,
    NextRequest: class { url = ''; constructor(u: string){ this.url = u; } },
  };
});

// Auth middleware mocks
import type { User } from '@supabase/supabase-js';
import { AuthContext, FeatureFlags, UserProfile } from '../../lib/types/auth';
import type { NextRequest } from 'next/server';

jest.mock('../../lib/middleware/auth', () => ({
  withProtectedAuth: (handler: any) => (req: any) => handler(req, currentAuthContext),
  withEnhancedAuth: (handler: any) => (req: any) => handler(req, currentAuthContext),
  withTierAuth: (handler: any) => (req: any) => handler(req, currentAuthContext),
  withConversationOwnership: (handler: any) => (req: any) => handler(req, currentAuthContext),
  addRateLimitHeaders: (response: any, _authContext: any, remaining: number = 0) => {
    try {
      response.headers.set('X-RateLimit-Limit', '1000');
      response.headers.set('X-RateLimit-Remaining', String(remaining));
      response.headers.set('X-RateLimit-Reset', new Date(Date.now() + 3600000).toISOString());
    } catch {}
    return response;
  },
}));

const featureFlags: FeatureFlags = {
  canModifySystemPrompt: true,
  canAccessAdvancedModels: true,
  canUseCustomTemperature: true,
  canSaveConversations: true,
  canSyncConversations: true,
  maxRequestsPerHour: 1000,
  maxTokensPerRequest: 100000,
  hasRateLimitBypass: true,
  canUseProModels: true,
  canUseEnterpriseModels: false,
  showAdvancedSettings: true,
  canExportConversations: false,
  hasAnalyticsDashboard: false,
};
const profile: Partial<UserProfile> = { id: 'u1', subscription_tier: 'free', account_type: 'user', default_model: 'gpt', temperature: 0.7, system_prompt: '', credits: 0, created_at: '', updated_at: '' };
const minimalUser = { id: 'u1' } as unknown as User;
const mockAuthContext: AuthContext = {
  isAuthenticated: true,
  user: minimalUser,
  profile: profile as UserProfile,
  accessLevel: 'authenticated',
  features: featureFlags,
};
const currentAuthContext = mockAuthContext;

jest.mock('../../lib/utils/auth', () => ({
  extractAuthContext: jest.fn(() => currentAuthContext),
  hasPermission: jest.fn(() => true),
}));

jest.mock('../../lib/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn() } }));

jest.mock('../../lib/utils/errors', () => {
  const actual = jest.requireActual('../../lib/utils/errors');
  return {
    ...actual,
    handleError: (err: unknown) => {
      const mod = jest.requireMock('next/server');
      const message = err instanceof Error ? err.message : String(err);
      return mod.NextResponse.json({ error: message, code: 'internal_server_error' }, { status: 500 });
    }
  };
});

// In-memory mock supabase server for GET /api/chat/messages
jest.mock('../../lib/supabase/server', () => {
  type SessionRow = { id: string; user_id: string; title?: string };
  type MessageRow = {
    id: string; session_id: string; role: string; content: string; model?: string | null;
    total_tokens?: number; input_tokens?: number; output_tokens?: number; user_message_id?: string | null;
    content_type?: string | null; elapsed_ms?: number | null; completion_id?: string | null; message_timestamp: string;
    has_websearch?: boolean | null; websearch_result_count?: number | null; error_message?: string | null;
    reasoning?: string | null; reasoning_details?: Record<string, unknown> | Record<string, unknown>[] | null;
    metadata?: Record<string, unknown> | null; is_streaming?: boolean | null;
  };
  type AnnotationRow = { id: string; user_id: string; session_id: string; message_id: string; annotation_type: 'url_citation'; url: string; title: string | null; content: string | null; start_index: number | null; end_index: number | null; created_at: string };
  type AttachmentRow = { id: string; message_id: string; status: 'ready'|'failed'|'processing' };

  const sessions: SessionRow[] = [ { id: 'sess-1', user_id: 'u1', title: 'Test' } ];
  const messages: MessageRow[] = [
    // system should be filtered
    { id: 's-0', session_id: 'sess-1', role: 'system', content: 'sys', message_timestamp: new Date('2025-08-30T00:00:00Z').toISOString() },
    // user message with request options and originalModel
    {
      id: 'u-1', session_id: 'sess-1', role: 'user', content: 'What is 1+1?', model: 'google/gemini-2.5-flash-lite',
      message_timestamp: new Date('2025-08-30T10:00:00Z').toISOString(), input_tokens: 10,
      metadata: { requested_web_search: true, requested_web_max_results: 3, requested_reasoning_effort: 'low' }, is_streaming: true,
    },
    // assistant with websearch + reasoning and details as object (coerce to array)
    {
      id: 'a-1', session_id: 'sess-1', role: 'assistant', content: '2', model: 'google/gemini-2.5-flash-lite',
      total_tokens: 20, input_tokens: 10, output_tokens: 10, elapsed_ms: 1234, completion_id: 'gen-1', content_type: 'markdown',
      has_websearch: true, websearch_result_count: 2, message_timestamp: new Date('2025-08-30T10:00:10Z').toISOString(), is_streaming: true,
      reasoning: 'simple math', reasoning_details: { steps: [1,2] }
    },
  ];
  const annotations: AnnotationRow[] = [
    { id: 'ann-1', user_id: 'u1', session_id: 'sess-1', message_id: 'a-1', annotation_type: 'url_citation', url: 'https://ex.com/1', title: 'One', content: 'c1', start_index: 0, end_index: 5, created_at: new Date().toISOString() },
    { id: 'ann-2', user_id: 'u1', session_id: 'sess-1', message_id: 'a-1', annotation_type: 'url_citation', url: 'https://ex.com/2', title: 'Two', content: 'c2', start_index: 6, end_index: 12, created_at: new Date().toISOString() },
  ];
  const attachments: AttachmentRow[] = [
    { id: 'att-1', message_id: 'u-1', status: 'ready' },
  ];

  return {
    __mockState: { sessions, messages, annotations, attachments },
    createClient: jest.fn(async () => ({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'u1', email: 'u@test.dev' } }, error: null })) },
      from: (tableName: string) => {
        type Filters = Record<string, unknown>;
        const ctx: { filters: Filters; inFilter?: { col: string; arr: unknown[] } } = { filters: {} };
        const api = {
          select: () => api,
          eq: (col: string, val: unknown) => { ctx.filters[col] = val; return api; },
          in: (col: string, arr: unknown[]) => { ctx.inFilter = { col, arr }; return api; },
          order: () => api,
          single: async () => {
            if (tableName === 'chat_sessions') {
              const sid = ctx.filters['id'] as string | undefined;
              const uid = ctx.filters['user_id'] as string | undefined;
              const row = sessions.find(s => (!sid || s.id === sid) && (!uid || s.user_id === uid));
              return row ? { data: row, error: null } : { data: null, error: new Error('not found') };
            }
            return { data: null, error: new Error('unsupported single') } as any;
          },
          then: (resolve: (arg: { data: unknown[] | null; error: null }) => void) => {
            if (tableName === 'chat_messages') {
              const sid = ctx.filters['session_id'] as string | undefined;
              const rows = messages.filter(m => !sid || m.session_id === sid);
              // simulate the order by message_timestamp asc already in route
              return resolve({ data: rows as any, error: null });
            }
            if (tableName === 'chat_attachments') {
              let rows = attachments;
              if (ctx.inFilter && ctx.inFilter.col === 'message_id') rows = rows.filter(r => (ctx.inFilter as any).arr.includes(r.message_id));
              if ('status' in ctx.filters) rows = rows.filter(r => r.status === ctx.filters['status']);
              return resolve({ data: rows as any, error: null });
            }
            if (tableName === 'chat_message_annotations') {
              let rows = annotations as any[];
              if (ctx.inFilter && ctx.inFilter.col === 'message_id') rows = rows.filter(r => (ctx.inFilter as any).arr.includes(r.message_id));
              return resolve({ data: rows as any, error: null });
            }
            if (tableName === 'chat_sessions') {
              return resolve({ data: sessions as any, error: null });
            }
            return resolve({ data: [], error: null });
          },
        };
        return api;
      },
    }))
  };
});

// Import route under test
import { GET as getMessages } from '../../src/app/api/chat/messages/route';

// Helpers
interface MockResponse<T> { status: number; json: () => Promise<T>; headers: unknown; }
const makeReq = (core: { url: string; method?: string }) => ({ headers: { get: () => null }, ...core } as unknown as NextRequest);

describe('GET /api/chat/messages - full payload mapping', () => {
  test('returns reasoning, annotations, attachments, websearch, tokens, streaming, contentType and model fields', async () => {
    const req = makeReq({ url: 'http://localhost/api/chat/messages?session_id=sess-1', method: 'GET' });
    const res = await getMessages(req) as unknown as MockResponse<{ messages: any[]; count: number }>;
    expect(res.status).toBe(200);
    const body = await res.json();
    const msgs = body.messages;
    // system filtered; so expect 2
    expect(body.count).toBe(2);
    expect(msgs.map(m => m.id)).toEqual(['u-1','a-1']);

    const u1 = msgs.find(m => m.id === 'u-1');
    expect(u1.originalModel).toBe('google/gemini-2.5-flash-lite');
    expect(u1.model).toBeUndefined();
    expect(u1.attachment_ids).toEqual(['att-1']);
    expect(u1.has_attachments).toBe(true);
    expect(u1.was_streaming).toBe(true);
    expect(u1.requested_web_search).toBe(true);
    expect(u1.requested_web_max_results).toBe(3);
    expect(u1.requested_reasoning_effort).toBe('low');
    expect(u1.input_tokens).toBe(10);

    const a1 = msgs.find(m => m.id === 'a-1');
    expect(a1.model).toBe('google/gemini-2.5-flash-lite');
    expect(a1.contentType).toBe('markdown');
    expect(a1.has_websearch).toBe(true);
    expect(a1.websearch_result_count).toBe(2);
    expect(a1.reasoning).toBe('simple math');
    expect(Array.isArray(a1.reasoning_details)).toBe(true); // coerced from object
    expect(a1.total_tokens).toBe(20);
    expect(a1.input_tokens).toBe(10);
    expect(a1.output_tokens).toBe(10);
    expect(a1.elapsed_ms).toBe(1234);
    expect(a1.completion_id).toBe('gen-1');
    expect(a1.was_streaming).toBe(true);
    expect(Array.isArray(a1.annotations)).toBe(true);
    expect(a1.annotations.map((x: any) => x.url).sort()).toEqual(['https://ex.com/1','https://ex.com/2']);
  });
});
