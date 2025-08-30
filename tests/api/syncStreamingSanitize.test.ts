/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for streaming flag persistence and contentType sanitization via GET/POST /api/chat/sync
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

jest.mock('/Users/zhenwei.seo/github/openrouter-chatbot/lib/middleware/auth', () => ({
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

jest.mock('/Users/zhenwei.seo/github/openrouter-chatbot/lib/utils/auth', () => ({
  extractAuthContext: jest.fn(() => currentAuthContext),
  hasPermission: jest.fn(() => true),
}));

jest.mock('../../lib/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn() } }));

jest.mock('/Users/zhenwei.seo/github/openrouter-chatbot/lib/utils/errors', () => {
  const actual = jest.requireActual('/Users/zhenwei.seo/github/openrouter-chatbot/lib/utils/errors');
  return {
    ...actual,
    handleError: (err: unknown) => {
      const mod = jest.requireMock('next/server');
      const message = err instanceof Error ? err.message : String(err);
      return mod.NextResponse.json({ error: message, code: 'internal_server_error' }, { status: 500 });
    }
  };
});

// In-memory mock supabase server capturing is_streaming and content_type
jest.mock('/Users/zhenwei.seo/github/openrouter-chatbot/lib/supabase/server', () => {
  type SessionRow = { id: string; user_id: string; title?: string; message_count?: number; total_tokens?: number; last_model?: string; last_message_preview?: string; last_message_timestamp?: string; created_at?: string; updated_at?: string };
  type MessageRow = { id: string; session_id: string; role: string; content: string; model?: string | null; total_tokens?: number; input_tokens?: number; output_tokens?: number; user_message_id?: string | null; content_type?: string | null; elapsed_ms?: number | null; completion_id?: string | null; message_timestamp: string; has_attachments?: boolean; attachment_count?: number; has_websearch?: boolean | null; websearch_result_count?: number | null; error_message?: string | null; is_streaming?: boolean | null };
  type AnnotationRow = { id: string; user_id: string; session_id: string; message_id: string; annotation_type: 'url_citation'; url: string; title: string | null; content: string | null; start_index: number | null; end_index: number | null; created_at: string };
  type AttachmentRow = { id: string; message_id: string; status: 'ready'|'failed'|'processing' };

  const sessions: SessionRow[] = [];
  const messages: MessageRow[] = [];
  const annotations: AnnotationRow[] = [];
  const attachments: AttachmentRow[] = [];

  function uuid() { return 'id-' + Math.random().toString(36).slice(2, 10); }

  return {
    __mockState: { sessions, messages, annotations, attachments },
    createClient: jest.fn(async () => ({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'u1', email: 'u@test.dev' } }, error: null })) },
      from: (tableName: string) => {
        type Filters = Record<string, unknown>;
        const ctx: { filters: Filters; inFilter?: { col: string; arr: unknown[] }; countHead?: { count?: 'exact'; head?: boolean } } = { filters: {} };
        const api = {
          select: (_sel: string, opts?: { count?: 'exact'; head?: boolean }) => { ctx.countHead = opts; return api; },
          eq: (col: string, val: unknown) => { ctx.filters[col] = val; return api; },
          is: (col: string, val: unknown) => { ctx.filters[col] = val; return api; },
          in: (col: string, arr: unknown[]) => { ctx.inFilter = { col, arr }; return api; },
          order: () => api,
          limit: () => api,
          single: async () => ({ data: null, error: new Error('unsupported single') }) as any,
          then: (resolve: (arg: { data: unknown[] | null; error: null; count?: number }) => void) => {
            if (tableName === 'chat_sessions') {
              const userId = ctx.filters['user_id'] as string | undefined;
              const rows = sessions.filter(s => (!userId || s.user_id === userId));
              // Attach nested chat_messages for each session to mimic Supabase nested select
              const enriched = rows.map(s => ({
                ...s,
                chat_messages: messages.filter(m => m.session_id === s.id),
              }));
              return resolve({ data: enriched as any, error: null });
            }
            if (tableName === 'chat_attachments') {
              let rows = attachments;
              if (ctx.inFilter && ctx.inFilter.col === 'message_id') {
                rows = rows.filter(r => (ctx.inFilter as any).arr.includes(r.message_id));
              }
              if ('status' in ctx.filters) rows = rows.filter(r => r.status === ctx.filters['status']);
              return resolve({ data: rows as any, error: null });
            }
            if (tableName === 'chat_message_annotations') {
              let rows = annotations as any[];
              if (ctx.inFilter && ctx.inFilter.col === 'message_id') {
                rows = rows.filter(r => (ctx.inFilter as any).arr.includes(r.message_id));
              }
              return resolve({ data: rows as any, error: null });
            }
            if (tableName === 'chat_messages') {
              const sid = ctx.filters['session_id'] as string | undefined;
              const rows = messages.filter(m => !sid || m.session_id === sid);
              return resolve({ data: rows as any, error: null });
            }
            return resolve({ data: [], error: null });
          },
          insert: (values: Record<string, unknown> | Record<string, unknown>[]) => {
            if (tableName === 'chat_session_stats') return { data: null, error: null } as any;
            if (tableName === 'chat_message_annotations') {
              const arr = Array.isArray(values) ? values : [values];
              for (const v of arr) {
                annotations.push({
                  id: uuid(),
                  user_id: String(v['user_id']),
                  session_id: String(v['session_id']),
                  message_id: String(v['message_id']),
                  annotation_type: 'url_citation',
                  url: String(v['url']),
                  title: (v['title'] as string) ?? null,
                  content: (v['content'] as string) ?? null,
                  start_index: (v['start_index'] as number) ?? null,
                  end_index: (v['end_index'] as number) ?? null,
                  created_at: new Date().toISOString(),
                });
              }
              return { data: null, error: null } as any;
            }
            if (tableName === 'chat_sessions') {
              const v = Array.isArray(values) ? values[0] : values;
              const found = sessions.find(s => s.id === v['id']);
              if (found) Object.assign(found, v);
              else sessions.push({
                id: String(v['id']), user_id: String(v['user_id']), title: String(v['title'] || ''),
                message_count: (v['message_count'] as number) || 0, total_tokens: (v['total_tokens'] as number) || 0,
                last_model: (v['last_model'] as string) || undefined, last_message_preview: (v['last_message_preview'] as string) || undefined,
                last_message_timestamp: (v['last_message_timestamp'] as string) || undefined, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
              });
              return { data: null, error: null, select: () => ({ single: async () => ({ data: null, error: null }) }) } as any;
            }
            return { data: null, error: null } as any;
          },
          upsert: (values: Record<string, unknown> | Record<string, unknown>[]) => {
            if (tableName === 'chat_messages') {
              const arr = Array.isArray(values) ? values : [values];
              for (const v of arr) {
                const idx = messages.findIndex(m => m.id === v['id']);
                const row: MessageRow = {
                  id: String(v['id']),
                  session_id: String(v['session_id']),
                  role: String(v['role']),
                  content: String(v['content'] || ''),
                  model: (v['model'] as string) || null,
                  total_tokens: (v['total_tokens'] as number) || 0,
                  input_tokens: (v['input_tokens'] as number) || 0,
                  output_tokens: (v['output_tokens'] as number) || 0,
                  user_message_id: (v['user_message_id'] as string) || null,
                  content_type: (v['content_type'] as string) || 'text',
                  elapsed_ms: (v['elapsed_ms'] as number) || 0,
                  completion_id: (v['completion_id'] as string) || null,
                  message_timestamp: typeof v['message_timestamp'] === 'string' ? (v['message_timestamp'] as string) : new Date().toISOString(),
                  has_attachments: Boolean(v['has_attachments']),
                  attachment_count: (v['attachment_count'] as number) || 0,
                  has_websearch: (v['has_websearch'] as boolean | null) ?? null,
                  websearch_result_count: (v['websearch_result_count'] as number | null) ?? null,
                  error_message: (v['error_message'] as string) || null,
                  is_streaming: typeof v['is_streaming'] === 'boolean' ? (v['is_streaming'] as boolean) : null,
                };
                if (idx >= 0) messages[idx] = row; else messages.push(row);
              }
              return { data: null, error: null } as any;
            }
            if (tableName === 'chat_sessions') {
              const v = Array.isArray(values) ? values[0] : values;
              const idx = sessions.findIndex(s => s.id === v['id']);
              const row: SessionRow = {
                id: String(v['id']), user_id: String(v['user_id']), title: String(v['title'] || ''), message_count: (v['message_count'] as number) || 0,
                total_tokens: (v['total_tokens'] as number) || 0, last_model: (v['last_model'] as string) || undefined, last_message_preview: (v['last_message_preview'] as string) || undefined,
                last_message_timestamp: (v['last_message_timestamp'] as string) || undefined, created_at: new Date().toISOString(), updated_at: (v['updated_at'] as string) || new Date().toISOString()
              };
              if (idx >= 0) sessions[idx] = row; else sessions.push(row);
              return { select: () => ({ single: async () => ({ data: row, error: null }) }) } as any;
            }
            return { data: null, error: new Error('upsert unsupported') } as any;
          },
          delete: () => {
            const delApi = {
              in: (col: string, arr: unknown[]) => {
                if (tableName === 'chat_message_annotations' && col === 'message_id') {
                  for (const id of arr as string[]) {
                    for (let i = annotations.length - 1; i >= 0; i--) if (annotations[i].message_id === id) annotations.splice(i, 1);
                  }
                }
                return { data: null, error: null } as any;
              }
            };
            return delApi as any;
          }
        };
        return api;
      },
    }))
  };
});

// Import routes under test
import { POST as postSync, GET as getSync } from '../../src/app/api/chat/sync/route';

// Helpers
interface MockResponse<T> { status: number; json: () => Promise<T>; headers: unknown; }
const makeReq = (core: { url: string; method?: string; json?: () => Promise<unknown> }) => ({ headers: { get: () => null }, ...core } as unknown as NextRequest);

describe('Sync API - Streaming + Sanitization', () => {
  test('POST sets is_streaming and sanitizes contentType; GET returns defaults for websearch', async () => {
    const conv = {
      id: 'sess-ss-1',
      title: 'Streaming & sanitize',
      userId: 'u1',
      messages: [
        { id: 'u-1', role: 'user' as const, content: 'Hi', timestamp: new Date(), contentType: 'html' as const },
        { id: 'a-1', role: 'assistant' as const, content: 'Hello', model: 'm', total_tokens: 3, timestamp: new Date(), contentType: 'html' as const, was_streaming: true },
      ],
      messageCount: 2,
      totalTokens: 3,
      lastModel: 'm',
      lastMessagePreview: 'Hello',
      lastMessageTimestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // POST sync
    const postReq = makeReq({ url: 'http://localhost/api/chat/sync', method: 'POST', json: async () => ({ conversations: [conv] }) });
    const postRes = await postSync(postReq) as unknown as MockResponse<{ success: boolean; results: any }>;
    expect(postRes.status).toBe(200);
    const postBody = await postRes.json();
    expect(postBody.success).toBe(true);
    expect(postBody.results.synced).toBe(1);

  // Assert is_streaming persisted in mocked DB (via dynamic import of mock module)
  const serverModule = await import('/Users/zhenwei.seo/github/openrouter-chatbot/lib/supabase/server');
  const state = (serverModule as unknown as { __mockState: { messages: any[] } }).__mockState;
  const msgA1 = state.messages.find(m => m.id === 'a-1');
    expect(msgA1).toBeDefined();
    expect(msgA1.is_streaming).toBe(true);
    expect(msgA1.content_type).toBe('text'); // sanitized

    // GET sync
    const getReq = makeReq({ url: 'http://localhost/api/chat/sync', method: 'GET' });
    const getRes = await getSync(getReq) as unknown as MockResponse<{ conversations: any[] }>;
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    const found = getBody.conversations.find(c => c.id === 'sess-ss-1');
    expect(found).toBeDefined();

    const u1 = found.messages.find((m: any) => m.id === 'u-1');
    const a1 = found.messages.find((m: any) => m.id === 'a-1');
    expect(u1.contentType).toBe('text'); // sanitized from html
    expect(a1.contentType).toBe('text'); // sanitized from html

    // Websearch defaults when omitted
    expect(a1.has_websearch).toBe(false);
    expect(a1.websearch_result_count).toBe(0);
  });
});
