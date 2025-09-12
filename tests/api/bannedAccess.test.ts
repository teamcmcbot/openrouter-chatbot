 
/**
 * Verify chat-only ban enforcement:
 * - Banned users are blocked on POST /api/chat and POST /api/chat/stream (403 account_banned)
 * - Banned users can read history via GET /api/chat/messages (200)
 */

// Polyfill minimal Next primitives used by routes/middleware
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
import { NextResponse } from 'next/server';

// Global minimal mocks for rate limit wrappers (pass-through)
jest.mock('../../lib/middleware/redisRateLimitMiddleware', () => ({
  withTieredRateLimit: (handler: any) => handler,
  withRedisRateLimitEnhanced: (handler: any) => handler,
}));

// Mock logger to keep test output clean
jest.mock('../../lib/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn() } }));

// Banned auth context used by our auth middleware mock
type FeatureFlags = Record<string, unknown>;
const bannedAuthContext = {
  isAuthenticated: true,
  user: { id: 'u1' },
  profile: {
    id: 'u1',
    email: 'u1@test.dev',
    subscription_tier: 'free',
    account_type: 'user',
    is_banned: true,
    default_model: 'deepseek/deepseek-r1-0528:free',
    temperature: 0.7,
    system_prompt: '',
    credits: 0,
    created_at: '',
    updated_at: '',
  },
  accessLevel: 'authenticated' as const,
  features: {} as FeatureFlags,
};

// Mock auth middleware: enforce ban only when options.enforceBan !== false
jest.mock('../../lib/middleware/auth', () => ({
  withAuth: (handler: any, options?: { enforceBan?: boolean }) => async (req: unknown) => {
    if (options?.enforceBan !== false && bannedAuthContext.profile?.is_banned) {
      // Simulate standardized auth error response used by handleAuthError
      const payload = {
        error: 'Your account is banned. Contact support if you believe this is a mistake',
        code: 'account_banned',
        timestamp: new Date().toISOString(),
      };
  return NextResponse.json(payload, { status: 403 });
    }
    return handler(req as any, bannedAuthContext);
  },
  withProtectedAuth: (handler: any) => (req: unknown) => handler(req, bannedAuthContext),
  withEnhancedAuth: (handler: any) => (req: unknown) => handler(req, bannedAuthContext),
}));

// Avoid hitting network in chat routes
jest.mock('../../lib/utils/openrouter', () => ({
  getOpenRouterCompletion: jest.fn(async () => ({ id: 'r1', model: 'deepseek/deepseek-r1-0528:free', choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } })),
  getOpenRouterCompletionStream: jest.fn(async () => new ReadableStream<Uint8Array>({ start(c){ c.enqueue(new TextEncoder().encode('ok\n')); c.close(); } })),
  fetchOpenRouterModels: jest.fn(async () => []),
}));

// In-memory supabase mock for messages GET
jest.mock('../../lib/supabase/server', () => {
  type SessionRow = { id: string; user_id: string; title?: string };
  type MessageRow = { id: string; session_id: string; role: string; content: string; model?: string | null; input_tokens?: number; output_tokens?: number; total_tokens?: number; message_timestamp: string; content_type?: string | null };
  type AttachmentRow = { id: string; message_id: string; status: 'ready'|'failed'|'processing' };
  type AnnotationRow = { message_id: string; annotation_type: 'url_citation'; url: string; title?: string | null; content?: string | null; start_index?: number | null; end_index?: number | null };
  const sessions: SessionRow[] = [ { id: 'sess-1', user_id: 'u1', title: 'Test' } ];
  const messages: MessageRow[] = [
    { id: 'u-1', session_id: 'sess-1', role: 'user', content: 'hi', model: 'deepseek/deepseek-r1-0528:free', message_timestamp: new Date('2025-08-30T10:00:00Z').toISOString() },
    { id: 'a-1', session_id: 'sess-1', role: 'assistant', content: 'ok', model: 'deepseek/deepseek-r1-0528:free', message_timestamp: new Date('2025-08-30T10:00:10Z').toISOString(), content_type: 'markdown', total_tokens: 1, input_tokens: 1, output_tokens: 0 },
  ];
  const attachments: AttachmentRow[] = [ { id: 'att-1', message_id: 'u-1', status: 'ready' } ];
  const annotations: AnnotationRow[] = [ { message_id: 'a-1', annotation_type: 'url_citation', url: 'https://ex.com', title: 't', content: 'c', start_index: 0, end_index: 1 } ];
  return {
    createClient: jest.fn(async () => ({
      from: (table: string) => {
        const ctx: { filters: Record<string, unknown>; inFilter?: { col: string; arr: unknown[] } } = { filters: {} };
        const api = {
          select: () => api,
          eq: (col: string, val: unknown) => { ctx.filters[col] = val; return api; },
          gt: () => api,
          in: (col: string, arr: unknown[]) => { ctx.inFilter = { col, arr }; return api; },
          order: () => api,
          single: async () => {
            if (table === 'chat_sessions') {
              const sid = ctx.filters['id'] as string | undefined;
              const uid = ctx.filters['user_id'] as string | undefined;
              const row = sessions.find(s => (!sid || s.id === sid) && (!uid || s.user_id === uid));
              return row ? { data: row, error: null } : { data: null, error: new Error('not found') } as any;
            }
            return { data: null, error: new Error('unsupported single') } as any;
          },
          then: (resolve: (arg: { data: unknown[] | null; error: null }) => void) => {
            if (table === 'chat_messages') {
              const sid = ctx.filters['session_id'] as string | undefined;
              const rows = messages.filter(m => !sid || m.session_id === sid);
              return resolve({ data: rows as any, error: null });
            }
            if (table === 'chat_attachments') {
              let rows = attachments;
              if (ctx.inFilter && ctx.inFilter.col === 'message_id') rows = rows.filter(r => (ctx.inFilter as any).arr.includes(r.message_id));
              if ('status' in ctx.filters) rows = rows.filter(r => r.status === ctx.filters['status']);
              return resolve({ data: rows as any, error: null });
            }
            if (table === 'chat_message_annotations') {
              let rows = annotations as any[];
              if (ctx.inFilter && ctx.inFilter.col === 'message_id') rows = rows.filter(r => (ctx.inFilter as any).arr.includes(r.message_id));
              return resolve({ data: rows as any, error: null });
            }
            return resolve({ data: [], error: null });
          },
        };
        return api;
      },
      storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'http://example.com' }, error: null }) }) },
    })),
  };
});

// Helpers
async function readTextBody(res: { body?: unknown }): Promise<string> {
  const body = (res as any).body;
  if (!body) return '';
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  if (typeof (body as any).getReader === 'function') {
    const reader = (body as ReadableStream<any>).getReader();
    let out = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (typeof value === 'string') out += value;
      else if (value instanceof Uint8Array) out += new TextDecoder().decode(value);
      else out += String(value);
    }
    return out;
  }
  try { return JSON.stringify(body); } catch { return String(body); }
}

describe('Banned user chat-only enforcement', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('POST /api/chat returns 403 account_banned for banned users', async () => {
    const { POST } = await import('../../src/app/api/chat/route');
    const req = { 
      json: async () => ({ messages: [{ role: 'user', content: 'hi' }], model: 'deepseek/deepseek-r1-0528:free' }),
      headers: new Map()  // Add proper headers object
    } as any;
    const res = await POST(req as any);
    expect(res.status).toBe(403);
    const text = await readTextBody(res as any);
    const parsed = JSON.parse(text);
    expect(parsed.code).toBe('account_banned');
  });

  test('POST /api/chat/stream returns 403 account_banned for banned users', async () => {
    const { POST } = await import('../../src/app/api/chat/stream/route');
    const req = { json: async () => ({ messages: [{ role: 'user', content: 'hi' }], model: 'deepseek/deepseek-r1-0528:free' }) } as any;
    const res = await POST(req as any);
    expect(res.status).toBe(403);
    const text = await readTextBody(res as any);
    const parsed = JSON.parse(text);
    expect(parsed.code).toBe('account_banned');
  });

  test('GET /api/chat/messages allows banned users (200)', async () => {
    const { GET } = await import('../../src/app/api/chat/messages/route');
    const req = { url: 'http://localhost/api/chat/messages?session_id=sess-1', method: 'GET', headers: { get: () => null } } as any;
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = JSON.parse(await readTextBody(res as any));
    expect(json).toHaveProperty('messages');
    expect(Array.isArray(json.messages)).toBe(true);
  });
});
