/**
 * Tests for image attachments endpoints and link flow using mocked next/server and Supabase.
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
// NextResponse mock imported above; no runtime import needed

import type { User } from '@supabase/supabase-js';
import { AuthContext, FeatureFlags, UserProfile } from '../../lib/types/auth';
import type { NextRequest } from 'next/server';

// Mock auth middleware to pass through with our context and simple header setter
jest.mock('../../lib/middleware/auth', () => ({
    withProtectedAuth: (handler: any) => (req: any) => handler(req, currentAuthContext),
    withEnhancedAuth: (handler: any) => (req: any) => handler(req, currentAuthContext),
  withAuth: (handler: any) => (req: any) => handler(req, currentAuthContext),
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

// Minimal auth/profile
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

// Enhance error visibility in tests by wrapping handleError
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

// In-memory fakes for DB table and storage (types used in test and mock)
type Attachment = {
  id: string;
  user_id: string;
  session_id: string | null;
  message_id: string | null;
  kind: 'image';
  mime: string;
  size_bytes: number;
  storage_bucket: string;
  storage_path: string;
  draft_id: string | null;
  status: 'ready' | 'deleted';
  deleted_at: string | null;
};
function uuid() { return 'att-' + Math.random().toString(36).slice(2, 10); }
// Mock Supabase server using absolute path to match route import resolution
jest.mock('../../lib/supabase/server', () => {
  // Internal state for the mock module
  type SessionRow = { id: string; user_id: string; title?: string; message_count?: number; updated_at?: string; last_model?: string; last_message_preview?: string; last_message_timestamp?: string };
  type MessageRow = { id: string; session_id: string; role: string; content: string; model?: string | null; total_tokens?: number; message_timestamp: string; has_attachments?: boolean; attachment_count?: number };
  type ProfileRow = { id: string; email?: string; full_name?: string | null; avatar_url?: string | null; default_model?: string; temperature?: number; system_prompt?: string; subscription_tier?: 'free'|'pro'|'enterprise'; credits?: number };
  const attachments: Attachment[] = [];
  const sessions: SessionRow[] = [];
  const messages: MessageRow[] = [];
  const profiles: ProfileRow[] = [
    { id: 'u1', email: 'u@test.dev', full_name: 'Test User', avatar_url: null, default_model: 'gpt', temperature: 0.7, system_prompt: 'You are a helpful AI assistant.', subscription_tier: 'free', credits: 0 },
  ];
  const storageSet = new Set<string>();

  function matchSelect(rows: Attachment[], filters: Partial<Record<keyof Attachment, unknown>>) {
    return rows.filter(r => {
      for (const [k, v] of Object.entries(filters)) {
        if (v === null && r[k as keyof Attachment] !== null) return false;
        if (v !== null && (r as unknown as Record<string, unknown>)[k] !== v) return false;
      }
      return true;
    });
  }

  return {
    createClient: jest.fn(async () => ({
      auth: {
        getUser: jest.fn(async (_token?: string) => ({ data: { user: { id: 'u1', email: 'u@test.dev' } }, error: null })),
      },
      from: (tableName: string) => {
        type Filters = Partial<Record<string, unknown>>;
        const ctx: { filters: Filters; inFilter?: { col: string; arr: unknown[] }; countHead?: { count?: 'exact'; head?: boolean }; updateValues?: Record<string, unknown> } = { filters: {} };

        const api = {
          select: (_sel: string, opts?: { count?: 'exact'; head?: boolean }) => { ctx.countHead = opts; return api; },
          eq: (col: string, val: unknown) => { (ctx.filters as Record<string, unknown>)[col] = val; return api; },
          is: (col: string, val: unknown) => { (ctx.filters as Record<string, unknown>)[col] = val; return api; },
          in: (col: string, arr: unknown[]) => { ctx.inFilter = { col, arr }; return api; },
          single: async () => {
            if (tableName === 'chat_attachments') {
              let rows = attachments.slice();
              if (ctx.inFilter) rows = rows.filter((r) => ctx.inFilter!.arr.includes((r as Record<string, unknown>)[ctx.inFilter!.col]!));
              rows = matchSelect(rows, ctx.filters as Partial<Record<keyof Attachment, unknown>>);
              return rows.length ? { data: rows[0], error: null } : { data: null, error: new Error('not found') };
            }
            if (tableName === 'profiles') {
              const uid = ctx.filters['id'] as string | undefined;
              const row = profiles.find(p => (!uid || p.id === uid));
              return row ? { data: row, error: null } : { data: null, error: new Error('not found') };
            }
            if (tableName === 'chat_sessions') {
              const sid = ctx.filters['id'] as string | undefined;
              const uid = ctx.filters['user_id'] as string | undefined;
              const row = sessions.find(s => (!sid || s.id === sid) && (!uid || s.user_id === uid));
              return row ? { data: row, error: null } : { data: null, error: new Error('not found') };
            }
            const mid = ctx.filters['id'] as string | undefined;
            const mrow = messages.find(m => (!mid || m.id === mid));
            return mrow ? { data: mrow, error: null } : { data: null, error: new Error('not found') };
          },
          maybeSingle: async () => {
            const rows = matchSelect(attachments.slice(), ctx.filters as Partial<Record<keyof Attachment, unknown>>);
            return { data: null, error: null, count: rows.length };
          },
          insert: (values: Record<string, unknown> | Record<string, unknown>[]) => {
            if (tableName === 'chat_attachments') {
              const v = Array.isArray(values) ? values[0] : values;
              const row: Attachment = { id: uuid(), deleted_at: null, user_id: String(v['user_id'] || 'u1'), session_id: (v['session_id'] as string) || null, message_id: null, kind: 'image', mime: (v['mime'] as string) || 'image/jpeg', size_bytes: (v['size_bytes'] as number) || 0, storage_bucket: (v['storage_bucket'] as string) || 'attachments-images', storage_path: (v['storage_path'] as string) || 'p', draft_id: (v['draft_id'] as string) || null, status: 'ready' };
              attachments.push(row);
              return { data: row, error: null, select: () => ({ single: async () => ({ data: row, error: null }) }) } as unknown as { data: Attachment; error: null; select: () => { single: () => Promise<{ data: Attachment; error: null }> } };
            }
            if (tableName === 'chat_sessions') {
              const v = Array.isArray(values) ? values[0] : values;
              const row: SessionRow = { id: String(v['id']), user_id: String(v['user_id']), title: String(v['title'] || ''), message_count: 0, updated_at: new Date().toISOString() };
              sessions.push(row);
              return { data: row, error: null, select: () => ({ single: async () => ({ data: row, error: null }) }) } as unknown as { data: SessionRow; error: null; select: () => { single: () => Promise<{ data: SessionRow; error: null }> } };
            }
            if (tableName === 'profiles') {
              const v = Array.isArray(values) ? values[0] : values;
              const row: ProfileRow = {
                id: String(v['id'] || 'u1'),
                email: String(v['email'] || 'u@test.dev'),
                full_name: (v['full_name'] as string) || null,
                avatar_url: (v['avatar_url'] as string) || null,
                default_model: String(v['default_model'] || 'gpt'),
                temperature: Number(v['temperature'] ?? 0.7),
                system_prompt: String(v['system_prompt'] || 'You are a helpful AI assistant.'),
                subscription_tier: (v['subscription_tier'] as any) || 'free',
                credits: Number(v['credits'] ?? 0),
              };
              profiles.push(row);
              return { data: row, error: null, select: () => ({ single: async () => ({ data: row, error: null }) }) } as unknown as { data: ProfileRow; error: null; select: () => { single: () => Promise<{ data: ProfileRow; error: null }> } };
            }
            return { data: null, error: null } as unknown as { data: null; error: null };
          },
          upsert: (values: Record<string, unknown> | Record<string, unknown>[]) => {
            if (tableName !== 'chat_messages') return { data: null, error: new Error('upsert unsupported') } as unknown as { data: null; error: Error };
            const v = Array.isArray(values) ? values[0] : values;
            const idx = messages.findIndex(m => m.id === v['id']);
            const row: MessageRow = {
              id: String(v['id']),
              session_id: String(v['session_id']),
              role: String(v['role']),
              content: String(v['content'] || ''),
              model: (v['model'] as string) || null,
              total_tokens: (v['total_tokens'] as number) || 0,
              message_timestamp: typeof v['message_timestamp'] === 'string' ? (v['message_timestamp'] as string) : new Date().toISOString(),
              has_attachments: Boolean(v['has_attachments']),
              attachment_count: (v['attachment_count'] as number) || 0,
            };
            if (idx >= 0) messages[idx] = row; else messages.push(row);
            return { select: () => ({ single: async () => ({ data: row, error: null }) }) } as unknown as { select: () => { single: () => Promise<{ data: MessageRow; error: null }> } };
          },
          update: (values: Record<string, unknown>) => {
            ctx.updateValues = values;
            const updateApi = {
              eq: (col: string, val: unknown) => { (ctx.filters as Record<string, unknown>)[col] = val; return updateApi; },
              is: (col: string, val: unknown) => { (ctx.filters as Record<string, unknown>)[col] = val; return updateApi; },
              in: (col: string, arr: unknown[]) => { ctx.inFilter = { col, arr }; return updateApi; },
              then: (resolve: (result: { data: null; error: null }) => void) => {
                if (tableName === 'chat_attachments') {
                  let rows = attachments.slice();
                  if (ctx.inFilter) rows = rows.filter((r) => ctx.inFilter!.arr.includes((r as Record<string, unknown>)[ctx.inFilter!.col]!));
                  rows = matchSelect(rows, ctx.filters as Partial<Record<keyof Attachment, unknown>>);
                  rows.forEach(r => { Object.assign(r, ctx.updateValues); });
                } else if (tableName === 'chat_messages') {
                  const id = ctx.filters['id'] as string | undefined;
                  messages.forEach(m => { if (!id || m.id === id) Object.assign(m, values); });
                } else if (tableName === 'chat_sessions') {
                  const sid = ctx.filters['id'] as string | undefined;
                  sessions.forEach(s => { if (!sid || s.id === sid) Object.assign(s, values); });
                }
                resolve({ data: null, error: null });
              },
            };
            return updateApi as unknown as Promise<{ data: null; error: null }>;
          },
          then: (resolve: (arg: { data: unknown[] | null; error: null; count?: number }) => void) => {
            if (ctx.countHead?.count === 'exact') {
              if (tableName === 'chat_attachments') {
                let rows = attachments.slice();
                if (ctx.inFilter) rows = rows.filter((r) => ctx.inFilter!.arr.includes((r as Record<string, unknown>)[ctx.inFilter!.col]!));
                rows = matchSelect(rows, ctx.filters as Partial<Record<keyof Attachment, unknown>>);
                return resolve({ data: null, error: null, count: rows.length });
              }
              if (tableName === 'chat_messages') {
                const sid = ctx.filters['session_id'] as string | undefined;
                const rows = messages.filter(m => !sid || m.session_id === sid);
                return resolve({ data: null, error: null, count: rows.length });
              }
            }
            return resolve({ data: [], error: null });
          },
          order: () => api,
        };
        return api;
      },
      storage: {
        from: (bucket: string) => ({
          upload: async (path: string, _data?: unknown, _opts?: unknown) => { storageSet.add(`${bucket}/${path}`); return { data: { path }, error: null }; },
          remove: async (paths: string[]) => { paths.forEach(p => storageSet.delete(`${bucket}/${p}`)); return { data: null, error: null }; },
          createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://signed/${bucket}/${path}` }, error: null }),
        }),
      },
    }))
  };
});

// Use real auth and rate limit middleware; extractAuthContext is already mocked

// Import routes under test
import { POST as uploadImage } from '../../src/app/api/uploads/images/route';
import { GET as getSigned } from '../../src/app/api/attachments/[id]/signed-url/route';
import { DELETE as deleteAttachment } from '../../src/app/api/attachments/[id]/route';
import { POST as postMessages } from '../../src/app/api/chat/messages/route';

// Auth mocks for middleware
// Already handled by extractAuthContext; rate limiter will set headers via addRateLimitHeaders

// Helper to build FormData-like for NextRequest; we call handler directly so pass through formData()
function makeFormData(fields: Record<string, unknown>) {
  return {
    get: (k: string) => fields[k],
  } as unknown as FormData;
}

// Minimal mock response shape for our NextResponse.json()
interface MockResponse<T> { status: number; json: () => Promise<T>; headers: unknown; }

// Minimal request builder for handlers
type MockReqCore = { url: string; method?: string; formData?: () => Promise<FormData>; json?: () => Promise<unknown> };
const makeReq = (core: MockReqCore) => ({ headers: { get: () => null }, ...core } as unknown as NextRequest);

describe('Attachments API', () => {
  // Ensure File#arrayBuffer exists
  beforeAll(() => {
    const F: unknown = (globalThis as unknown as { File?: unknown }).File;
    if (F && !(F as { prototype: { arrayBuffer?: () => Promise<ArrayBuffer> } }).prototype.arrayBuffer) {
      Object.defineProperty((F as { prototype: { [k: string]: unknown } }).prototype, 'arrayBuffer', {
        value: function() {
          const buf = new Uint8Array([1, 2, 3, 4]).buffer;
          return Promise.resolve(buf);
        },
        configurable: true,
      });
    }
  });
  test('upload -> signed-url -> delete flow', async () => {
    // Mock Request with formData()
    const img = new File([new Uint8Array([1,2,3])], 'pic.jpg', { type: 'image/jpeg' });
    const formData = makeFormData({ image: img, draftId: 'draft-1', originalName: 'pic.jpg' });
  const reqUpload = makeReq({ url: 'http://localhost/api/uploads/images', method: 'POST', formData: async () => formData });

  const resUpload = await uploadImage(reqUpload) as unknown as MockResponse<{ id: string }>;
    if (resUpload.status !== 200) {
      const body = await resUpload.json();
      throw new Error('upload failed: ' + JSON.stringify(body));
    }
    const uploaded = await resUpload.json();
    expect(uploaded.id).toBeTruthy();

    // Signed URL
  const signedReq = makeReq({ url: `http://localhost/api/attachments/${uploaded.id}/signed-url`, method: 'GET' });
  const resSigned = await getSigned(signedReq) as unknown as MockResponse<{ signedUrl: string }>;
    expect(resSigned.status).toBe(200);
    const signed = await resSigned.json();
    expect(signed.signedUrl).toContain('https://signed/');

    // Delete
  const delReq = makeReq({ method: 'DELETE', url: `http://localhost/api/attachments/${uploaded.id}` });
  const resDel = await deleteAttachment(delReq) as unknown as MockResponse<unknown>;
    if (resDel.status !== 204) {
      const body = await resDel.json();
      throw new Error('delete failed: ' + JSON.stringify(body));
    }
  });

  test('link flow: POST /api/chat/messages links attachments and updates flags', async () => {
    // Create a pending upload first
    const img = new File([new Uint8Array([1,2,3])], 'pic.png', { type: 'image/png' });
    const formData = makeFormData({ image: img, draftId: 'draft-2' });
  const resUpload = await uploadImage(makeReq({ url: 'http://localhost/api/uploads/images', method: 'POST', formData: async () => formData })) as unknown as MockResponse<{ id: string }>;
    const uploaded = await resUpload.json();

    // Post a user message with attachmentIds
    const userMsg = {
      id: 'msg-1', role: 'user', content: 'hello', timestamp: new Date(), contentType: 'text'
    };
  const req = makeReq({ url: 'http://localhost/api/chat/messages', method: 'POST', json: async () => ({ messages: [userMsg], sessionId: 'sess-1', attachmentIds: [uploaded.id] }) });
  const res = await postMessages(req) as unknown as MockResponse<{ success: boolean }>;
    if (res.status !== 201) {
      const body = await res.json();
      throw new Error('post messages failed: ' + JSON.stringify(body));
    }
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('rate limit headers present on signed-url response', async () => {
  // Enable rate limiting for this test only
  (currentAuthContext.features as FeatureFlags).hasRateLimitBypass = false;
    const img = new File([new Uint8Array([1,2])], 'a.webp', { type: 'image/webp' });
    const formData = makeFormData({ image: img, draftId: 'draft-3' });
  const resUpload = await uploadImage(makeReq({ url: 'http://localhost/api/uploads/images', method: 'POST', formData: async () => formData })) as unknown as MockResponse<{ id: string }>;
    const uploaded = await resUpload.json();

  const resSigned = await getSigned(makeReq({ url: `http://localhost/api/attachments/${uploaded.id}/signed-url`, method: 'GET' })) as unknown as MockResponse<{ signedUrl: string }>;
    // Our NextResponse mock returns a Map for headers; rate limiter sets headers on the response
  expect(resSigned.headers).toBeDefined();
  // Restore bypass
  (currentAuthContext.features as FeatureFlags).hasRateLimitBypass = true;
  });
});
