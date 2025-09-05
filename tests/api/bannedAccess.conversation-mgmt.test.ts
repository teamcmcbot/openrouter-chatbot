/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Verify conversation management endpoints are allowed for banned users (chat-only ban policy):
 * - GET/POST/DELETE /api/chat/sessions
 * - GET/POST /api/chat/session
 * - DELETE /api/chat/clear-all
 */

// Minimal Next primitives
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

// Rate limit wrappers as pass-through
jest.mock('../../lib/middleware/redisRateLimitMiddleware', () => ({
  withTieredRateLimit: (handler: any) => handler,
  withRedisRateLimitEnhanced: (handler: any) => handler,
}));

// Logger: keep quiet
jest.mock('../../lib/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), debug: jest.fn(), info: jest.fn(), infoOrDebug: jest.fn() } }));

// Stable request id util
jest.mock('../../lib/utils/headers', () => ({ deriveRequestIdFromHeaders: () => 'test-req' }));

// Banned auth context; withProtectedAuth bypasses ban enforcement for these routes
const bannedAuthContext = {
  isAuthenticated: true,
  user: { id: 'u1' },
  profile: {
    id: 'u1', email: 'u1@test.dev', subscription_tier: 'free', account_type: 'user', is_banned: true,
    default_model: 'deepseek/deepseek-r1-0528:free', temperature: 0.7, system_prompt: '', credits: 0, created_at: '', updated_at: ''
  },
  accessLevel: 'authenticated' as const,
  features: {} as Record<string, unknown>,
};

jest.mock('../../lib/middleware/auth', () => ({
  withProtectedAuth: (handler: any) => (req: unknown) => handler(req, bannedAuthContext),
}));

// In-memory supabase mock with minimal session/message support
jest.mock('../../lib/supabase/server', () => {
  type SessionRow = { id: string; user_id: string; title?: string; message_count?: number; total_tokens?: number; updated_at?: string };
  type MessageRow = { id: string; session_id: string; role: string; content: string };

  let sessions: SessionRow[];
  let messages: MessageRow[];

  function resetStore() {
    sessions = [
      { id: 's1', user_id: 'u1', title: 'A' },
      { id: 's2', user_id: 'u1', title: 'B' },
      { id: 'ox', user_id: 'other', title: 'Other' },
    ];
    messages = [
      { id: 'm1', session_id: 's1', role: 'user', content: 'hi' },
      { id: 'm2', session_id: 's1', role: 'assistant', content: 'ok' },
      { id: 'm3', session_id: 's2', role: 'user', content: 'hi 2' },
    ];
  }

  // Initialize default store; re-run on module import after jest.resetModules()
  resetStore();

  return {
    __esModule: true,
    createClient: jest.fn(async () => ({
      from: (table: string) => {
        const ctx: any = { table, filters: {}, inFilter: null, updateData: null, insertData: null, deleteMode: false };
        const api: any = {
          select: () => api,
          order: () => api,
          eq: (col: string, val: any) => { ctx.filters[col] = val; return api; },
          in: (col: string, arr: any[]) => { ctx.inFilter = { col, arr }; return api; },
          insert: (payload: any) => { ctx.insertData = payload; return api; },
          update: (payload: any) => { ctx.updateData = payload; return api; },
          delete: () => { ctx.deleteMode = true; return api; },
          single: async () => {
            if (ctx.table === 'chat_sessions' && ctx.insertData) {
              const row = {
                id: ctx.insertData.id || `ns_${Date.now()}`,
                user_id: ctx.insertData.user_id,
                title: ctx.insertData.title || 'New Chat',
                message_count: 0,
                total_tokens: 0,
                updated_at: new Date().toISOString(),
              };
              sessions.push(row);
              return { data: row, error: null };
            }
            if (ctx.table === 'chat_sessions' && ctx.updateData) {
              const id = ctx.filters['id'];
              const uid = ctx.filters['user_id'];
              const idx = sessions.findIndex(s => s.id === id && s.user_id === uid);
              if (idx === -1) return { data: null, error: new Error('not found') } as any;
              sessions[idx] = { ...sessions[idx], ...ctx.updateData };
              return { data: sessions[idx], error: null };
            }
            if (ctx.table === 'chat_sessions') {
              const id = ctx.filters['id'];
              const uid = ctx.filters['user_id'];
              const row = sessions.find(s => s.id === id && s.user_id === uid);
              return row ? { data: row, error: null } : { data: null, error: new Error('not found') } as any;
            }
            return { data: null, error: new Error('unsupported single') } as any;
          },
          then: (resolve: (arg: { data: any; error: any }) => void) => {
            if (ctx.table === 'chat_sessions' && !ctx.deleteMode && !ctx.insertData && !ctx.updateData) {
              if (ctx.inFilter) {
                // Not used for sessions
              }
              if ('user_id' in ctx.filters && !('id' in ctx.filters)) {
                const uid = ctx.filters['user_id'];
                const rows = sessions.filter(s => s.user_id === uid);
                return resolve({ data: rows, error: null });
              }
              return resolve({ data: sessions.slice(), error: null });
            }
            if (ctx.table === 'chat_messages' && ctx.deleteMode) {
              if (ctx.inFilter && ctx.inFilter.col === 'session_id') {
                const set = new Set(ctx.inFilter.arr);
                messages = messages.filter(m => !set.has(m.session_id));
                return resolve({ data: null, error: null });
              }
              if ('session_id' in ctx.filters) {
                const sid = ctx.filters['session_id'];
                messages = messages.filter(m => m.session_id !== sid);
                return resolve({ data: null, error: null });
              }
            }
            if (ctx.table === 'chat_sessions' && ctx.deleteMode) {
              if ('id' in ctx.filters && 'user_id' in ctx.filters) {
                const id = ctx.filters['id'];
                const uid = ctx.filters['user_id'];
                const before = sessions.length;
                sessions = sessions.filter(s => !(s.id === id && s.user_id === uid));
                if (sessions.length === before) return resolve({ data: null, error: new Error('not found') });
                return resolve({ data: null, error: null });
              }
              if ('user_id' in ctx.filters) {
                const uid = ctx.filters['user_id'];
                sessions = sessions.filter(s => s.user_id !== uid);
                return resolve({ data: null, error: null });
              }
            }
            if (ctx.table === 'chat_sessions' && !ctx.deleteMode && ctx.insertData) {
              // handled by single()
            }
            return resolve({ data: [], error: null });
          },
        };
        return api;
      },
    })),
  };
});

async function readJson(res: any) {
  const body = res.body;
  if (!body) return {};
  if (typeof body === 'string') return JSON.parse(body);
  if (body instanceof Uint8Array) return JSON.parse(new TextDecoder().decode(body));
  try { return JSON.parse(JSON.stringify(body)); } catch { return {}; }
}

describe('Banned users can manage conversations', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('GET /api/chat/sessions returns user sessions', async () => {
    const { GET } = await import('../../src/app/api/chat/sessions/route');
    const req = { url: 'http://localhost/api/chat/sessions', method: 'GET', headers: { get: () => null } } as any;
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(Array.isArray(json.sessions)).toBe(true);
    expect(json.sessions.every((s: any) => s.user_id === 'u1')).toBe(true);
    expect(json.count).toBe(json.sessions.length);
    expect(json.sessions.length).toBeGreaterThanOrEqual(2);
  });

  test('POST /api/chat/sessions creates a session', async () => {
    const { POST } = await import('../../src/app/api/chat/sessions/route');
    const payload = { id: 's-new', title: 'Hello' };
    const req = { url: 'http://localhost/api/chat/sessions', method: 'POST', json: async () => payload, headers: { get: () => null } } as any;
    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(json.session.id).toBe('s-new');
    expect(json.session.user_id).toBe('u1');
  });

  test('DELETE /api/chat/sessions deletes a specific session', async () => {
    const { DELETE } = await import('../../src/app/api/chat/sessions/route');
    const req = { url: 'http://localhost/api/chat/sessions?id=s1', method: 'DELETE', headers: { get: () => null } } as any;
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
  });

  test('GET /api/chat/session returns a session by id', async () => {
    const { GET } = await import('../../src/app/api/chat/session/route');
    const req = { url: 'http://localhost/api/chat/session?id=s2', method: 'GET', headers: { get: () => null } } as any;
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.session.id).toBe('s2');
    expect(json.session.user_id).toBe('u1');
  });

  test('POST /api/chat/session updates fields', async () => {
    const { POST } = await import('../../src/app/api/chat/session/route');
    const payload = { id: 's2', title: 'Updated' };
    const req = { url: 'http://localhost/api/chat/session', method: 'POST', json: async () => payload, headers: { get: () => null } } as any;
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(json.session.title).toBe('Updated');
  });

  test('DELETE /api/chat/clear-all clears all user sessions and messages', async () => {
    const mod = await import('../../src/app/api/chat/clear-all/route');
    const req = { url: 'http://localhost/api/chat/clear-all', method: 'DELETE', headers: { get: () => null } } as any;
    const res = await mod.DELETE(req);
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(typeof json.deletedCount).toBe('number');
    expect(json.deletedCount).toBeGreaterThanOrEqual(1);
  });
});
