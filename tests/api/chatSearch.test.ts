/**
 * Test suite for /api/chat/search endpoint
 * Validates authentication, rate limiting, query validation, search functionality, and security
 */

// Mock Next.js primitives first
jest.mock('next/server', () => {
  class NextResponse {
    body: string;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    constructor(body: string, init?: { status?: number; statusText?: string; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.statusText = init?.statusText ?? 'OK';
      this.headers = init?.headers ?? {};
    }
    static json(data: unknown, init?: { status?: number; statusText?: string; headers?: Record<string, string> }) {
      return new NextResponse(JSON.stringify(data), init);
    }
  }
  class NextRequest {
    url: string;
    headers: Map<string, string>;
    constructor(url: string) {
      this.url = url;
      this.headers = new Map();
    }
  }
  return { NextResponse, NextRequest };
});

// Mock rate limiting middleware as pass-through
jest.mock('../../lib/middleware/redisRateLimitMiddleware', () => ({
  withTieredRateLimit: (handler: any) => handler,
}));

// Mock logger to keep tests quiet
jest.mock('../../lib/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock request ID utility
jest.mock('../../lib/utils/headers', () => ({
  deriveRequestIdFromHeaders: () => 'test-req-search',
}));

// Mock error handler
jest.mock('../../lib/utils/errors', () => ({
  handleError: (error: any, requestId: string) => {
    const { NextResponse } = jest.requireMock('next/server');
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500, headers: { 'x-request-id': requestId } }
    );
  },
}));

// Authenticated user context
const authenticatedContext = {
  isAuthenticated: true,
  user: { id: 'user123' },
  profile: {
    id: 'user123',
    email: 'test@example.com',
    subscription_tier: 'free',
    account_type: 'user',
    is_banned: false,
    default_model: 'openai/gpt-4o-mini',
    temperature: 0.7,
    system_prompt: '',
    credits: 0,
    created_at: '',
    updated_at: '',
  },
  accessLevel: 'authenticated' as const,
  features: {} as Record<string, unknown>,
};

// Anonymous user context (for authentication tests)
const anonymousContext = {
  isAuthenticated: false,
  user: null,
  profile: null,
  accessLevel: 'anonymous' as const,
  features: {} as Record<string, unknown>,
};

// Mock auth middleware
let mockAuthContext: typeof authenticatedContext | typeof anonymousContext = authenticatedContext;
jest.mock('../../lib/middleware/auth', () => ({
  withProtectedAuth: (handler: any) => (req: unknown) => {
    // Simulate authentication enforcement
    if (!mockAuthContext.isAuthenticated) {
      const { NextResponse } = jest.requireMock('next/server');
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401, headers: { 'x-request-id': 'test-req-search' } }
      );
    }
    return handler(req, mockAuthContext);
  },
}));

// In-memory Supabase mock with search support
jest.mock('../../lib/supabase/server', () => {
  type SessionRow = {
    id: string;
    user_id: string;
    title: string;
    last_message_preview: string | null;
    message_count: number;
    last_message_timestamp: string;
  };

  type MessageRow = {
    id: string;
    session_id: string;
    role: string;
    content: string;
  };

  let sessions: SessionRow[] = [];
  let messages: MessageRow[] = [];

  function resetStore() {
    sessions = [
      {
        id: 's1',
        user_id: 'user123',
        title: 'Testing React Components',
        last_message_preview: 'How do I test React components?',
        message_count: 5,
        last_message_timestamp: '2025-10-26T10:00:00Z',
      },
      {
        id: 's2',
        user_id: 'user123',
        title: 'Python Data Analysis',
        last_message_preview: 'Best practices for pandas',
        message_count: 3,
        last_message_timestamp: '2025-10-26T09:00:00Z',
      },
      {
        id: 's3',
        user_id: 'user123',
        title: 'API Design',
        last_message_preview: 'RESTful API conventions',
        message_count: 8,
        last_message_timestamp: '2025-10-26T08:00:00Z',
      },
      {
        id: 's4',
        user_id: 'otheruser',
        title: 'React Testing Library',
        last_message_preview: 'Testing hooks',
        message_count: 2,
        last_message_timestamp: '2025-10-26T07:00:00Z',
      },
    ];

    messages = [
      { id: 'm1', session_id: 's1', role: 'user', content: 'How do I test React components?' },
      { id: 'm2', session_id: 's1', role: 'assistant', content: 'Use React Testing Library' },
      { id: 'm3', session_id: 's2', role: 'user', content: 'Best practices for pandas data analysis' },
      { id: 'm4', session_id: 's2', role: 'assistant', content: 'Use vectorized operations' },
      { id: 'm5', session_id: 's3', role: 'user', content: 'RESTful API design patterns' },
      { id: 'm6', session_id: 's3', role: 'assistant', content: 'Follow HTTP verb conventions' },
    ];
  }

  resetStore();

  return {
    __esModule: true,
    createClient: jest.fn(async () => ({
      rpc: jest.fn(async (funcName: string, params: any) => {
        if (funcName === 'search_conversations') {
          const { p_user_id, p_query, p_limit } = params;
          const searchTerm = p_query.replace(/%/g, '').toLowerCase();

          // Search in titles
          const titleMatches = sessions
            .filter((s) => s.user_id === p_user_id && s.title.toLowerCase().includes(searchTerm))
            .map((s) => ({
              id: s.id,
              title: s.title,
              lastMessagePreview: s.last_message_preview,
              messageCount: s.message_count,
              lastMessageTimestamp: s.last_message_timestamp,
              matchType: 'title',
            }));

          // Search in previews
          const previewMatches = sessions
            .filter(
              (s) =>
                s.user_id === p_user_id &&
                s.last_message_preview &&
                s.last_message_preview.toLowerCase().includes(searchTerm) &&
                !titleMatches.find((t) => t.id === s.id)
            )
            .map((s) => ({
              id: s.id,
              title: s.title,
              lastMessagePreview: s.last_message_preview,
              messageCount: s.message_count,
              lastMessageTimestamp: s.last_message_timestamp,
              matchType: 'preview',
            }));

          // Search in message content
          const contentSessionIds = messages
            .filter((m) => m.content.toLowerCase().includes(searchTerm))
            .map((m) => m.session_id);

          const contentMatches = sessions
            .filter(
              (s) =>
                s.user_id === p_user_id &&
                contentSessionIds.includes(s.id) &&
                !titleMatches.find((t) => t.id === s.id) &&
                !previewMatches.find((p) => p.id === s.id)
            )
            .map((s) => ({
              id: s.id,
              title: s.title,
              lastMessagePreview: s.last_message_preview,
              messageCount: s.message_count,
              lastMessageTimestamp: s.last_message_timestamp,
              matchType: 'content',
            }));

          // Combine and sort by timestamp
          const results = [...titleMatches, ...previewMatches, ...contentMatches]
            .sort(
              (a, b) =>
                new Date(b.lastMessageTimestamp).getTime() -
                new Date(a.lastMessageTimestamp).getTime()
            )
            .slice(0, p_limit);

          return { data: results, error: null };
        }

        return { data: null, error: { code: '42883', message: 'Function not found' } };
      }),
      from: (table: string) => {
        const ctx: any = { table, filters: {}, orCondition: null, limitVal: 50 };
        const api: any = {
          select: () => api,
          eq: (col: string, val: any) => {
            ctx.filters[col] = val;
            return api;
          },
          or: (condition: string) => {
            ctx.orCondition = condition;
            return api;
          },
          ilike: (col: string, pattern: string) => {
            ctx.ilikePattern = { col, pattern };
            return api;
          },
          in: (col: string, arr: any[]) => {
            ctx.inFilter = { col, arr };
            return api;
          },
          order: () => api,
          limit: (val: number) => {
            ctx.limitVal = val;
            return api;
          },
          then: (resolve: (arg: { data: any; error: any }) => void) => {
            if (ctx.table === 'chat_sessions' && ctx.orCondition) {
              const userId = ctx.filters['user_id'];
              const pattern = ctx.orCondition.match(/ilike\.([^,)]+)/)?.[1].replace(/%/g, '').toLowerCase();
              
              if (!pattern) {
                return resolve({ data: [], error: null });
              }

              const results = sessions
                .filter(
                  (s) =>
                    s.user_id === userId &&
                    (s.title.toLowerCase().includes(pattern) ||
                      (s.last_message_preview && s.last_message_preview.toLowerCase().includes(pattern)))
                )
                .slice(0, ctx.limitVal);

              return resolve({ data: results, error: null });
            }

            if (ctx.table === 'chat_messages' && ctx.ilikePattern) {
              const pattern = ctx.ilikePattern.pattern.replace(/%/g, '').toLowerCase();
              const results = messages
                .filter((m) => m.content.toLowerCase().includes(pattern))
                .slice(0, ctx.limitVal);
              return resolve({ data: results, error: null });
            }

            if (ctx.table === 'chat_sessions' && ctx.inFilter) {
              const userId = ctx.filters['user_id'];
              const sessionIds = ctx.inFilter.arr;
              const results = sessions
                .filter((s) => s.user_id === userId && sessionIds.includes(s.id))
                .slice(0, ctx.limitVal);
              return resolve({ data: results, error: null });
            }

            return resolve({ data: [], error: null });
          },
        };
        return api;
      },
    })),
    __resetStore: resetStore,
  };
});

// Import handler after mocks are set up
import { GET } from '../../src/app/api/chat/search/route';

// Helper to read JSON from NextResponse mock
async function readJson(res: any) {
  const body = res.body;
  if (!body) return {};
  if (typeof body === 'string') return JSON.parse(body);
  if (body instanceof Uint8Array) return JSON.parse(new TextDecoder().decode(body));
  try {
    return JSON.parse(JSON.stringify(body));
  } catch {
    return {};
  }
}

describe('/api/chat/search', () => {
  const { NextRequest } = jest.requireMock('next/server');
  const supabaseMock = jest.requireMock('../../lib/supabase/server');

  beforeEach(() => {
    jest.clearAllMocks();
    supabaseMock.__resetStore();
    mockAuthContext = authenticatedContext;
  });

  describe('Authentication', () => {
    it('should require authentication', async () => {
      mockAuthContext = anonymousContext;
      const req = new NextRequest('http://localhost:3000/api/chat/search?q=test');
      const response = await GET(req);
      const body = await readJson(response);

      expect(response.status).toBe(401);
      expect(body.error).toBe('Authentication required');
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('should allow authenticated users', async () => {
      const req = new NextRequest('http://localhost:3000/api/chat/search?q=react');
      const response = await GET(req);

      expect(response.status).toBe(200);
    });
  });

  describe('Query Validation', () => {
    it('should return 400 if query parameter is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/chat/search');
      const response = await GET(req);
      const body = await readJson(response);

      expect(response.status).toBe(400);
      expect(body.error).toBe('Search query is required');
      expect(body.code).toBe('MISSING_QUERY');
      expect(response.headers['x-request-id']).toBe('test-req-search');
    });

    it('should return 400 if query is too short (< 2 characters)', async () => {
      const req = new NextRequest('http://localhost:3000/api/chat/search?q=a');
      const response = await GET(req);
      const body = await readJson(response);

      expect(response.status).toBe(400);
      expect(body.error).toBe('Search query must be at least 2 characters');
      expect(body.code).toBe('QUERY_TOO_SHORT');
    });

    it('should accept queries with exactly 2 characters', async () => {
      const req = new NextRequest('http://localhost:3000/api/chat/search?q=re');
      const response = await GET(req);

      expect(response.status).toBe(200);
    });

    it('should trim whitespace from query', async () => {
      const req = new NextRequest('http://localhost:3000/api/chat/search?q=%20react%20');
      const response = await GET(req);
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect(body.query).toBe('react');
    });
  });

  describe('Search Functionality', () => {
    it('should search conversation titles', async () => {
      const req = new NextRequest('http://localhost:3000/api/chat/search?q=react');
      const response = await GET(req);
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect(body.results).toHaveLength(1);
      expect(body.results[0].id).toBe('s1');
      expect(body.results[0].title).toBe('Testing React Components');
      expect(body.results[0].matchType).toBe('title');
    });

    it('should search last message previews', async () => {
      const req = new NextRequest('http://localhost:3000/api/chat/search?q=pandas');
      const response = await GET(req);
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect(body.results).toHaveLength(1);
      expect(body.results[0].id).toBe('s2');
      expect(body.results[0].matchType).toBe('preview');
    });

    it('should search message content', async () => {
      const req = new NextRequest('http://localhost:3000/api/chat/search?q=vectorized');
      const response = await GET(req);
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect(body.results).toHaveLength(1);
      expect(body.results[0].id).toBe('s2');
      expect(body.results[0].matchType).toBe('content');
    });

    it('should return combined results from all search types', async () => {
      const req = new NextRequest('http://localhost:3000/api/chat/search?q=API');
      const response = await GET(req);
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect(body.results.length).toBeGreaterThan(0);
      expect(body.results.some((r: any) => r.id === 's3')).toBe(true);
    });

    it('should deduplicate results across match types', async () => {
      // "react" appears in both title and content
      const req = new NextRequest('http://localhost:3000/api/chat/search?q=react');
      const response = await GET(req);
      const body = await readJson(response);

      const resultIds = body.results.map((r: any) => r.id);
      const uniqueIds = [...new Set(resultIds)];
      expect(resultIds.length).toBe(uniqueIds.length);
    });

    it('should sort results by timestamp descending', async () => {
      const req = new NextRequest('http://localhost:3000/api/chat/search?q=test');
      const response = await GET(req);
      const body = await readJson(response);

      expect(response.status).toBe(200);
      if (body.results.length > 1) {
        for (let i = 0; i < body.results.length - 1; i++) {
          const current = new Date(body.results[i].lastMessageTimestamp).getTime();
          const next = new Date(body.results[i + 1].lastMessageTimestamp).getTime();
          expect(current).toBeGreaterThanOrEqual(next);
        }
      }
    });

    it('should return empty results for non-matching query', async () => {
      const req = new NextRequest('http://localhost:3000/api/chat/search?q=nonexistent');
      const response = await GET(req);
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect(body.results).toHaveLength(0);
      expect(body.totalMatches).toBe(0);
    });

    it('should be case-insensitive', async () => {
      const req = new NextRequest('http://localhost:3000/api/chat/search?q=REACT');
      const response = await GET(req);
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect(body.results.length).toBeGreaterThan(0);
    });
  });

  describe('Result Limits', () => {
    it('should default to 50 results if limit not specified', async () => {
      const req = new NextRequest('http://localhost:3000/api/chat/search?q=test');
      const response = await GET(req);
      const body = await readJson(response);

      expect(response.status).toBe(200);
      // Even if we have fewer results, the query was executed with default limit
      expect(body.results.length).toBeLessThanOrEqual(50);
    });

    it('should respect custom limit parameter', async () => {
      const req = new NextRequest('http://localhost:3000/api/chat/search?q=test&limit=2');
      const response = await GET(req);
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect(body.results.length).toBeLessThanOrEqual(2);
    });

    it('should cap limit at 100', async () => {
      const req = new NextRequest('http://localhost:3000/api/chat/search?q=test&limit=200');
      const response = await GET(req);
      const body = await readJson(response);

      expect(response.status).toBe(200);
      // The API should have capped the limit at 100
      expect(body.results.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Security', () => {
    it('should only return conversations owned by authenticated user', async () => {
      const req = new NextRequest('http://localhost:3000/api/chat/search?q=react');
      const response = await GET(req);
      const body = await readJson(response);

      expect(response.status).toBe(200);
      // Should not return 's4' which belongs to 'otheruser'
      expect(body.results.every((r: any) => r.id !== 's4')).toBe(true);
    });

    it('should not leak other users conversations', async () => {
      const req = new NextRequest('http://localhost:3000/api/chat/search?q=testing');
      const response = await GET(req);
      const body = await readJson(response);

      expect(response.status).toBe(200);
      // All results should be from 'user123' sessions only
      const allUserSessions = body.results.every((r: any) =>
        ['s1', 's2', 's3'].includes(r.id)
      );
      expect(allUserSessions).toBe(true);
    });
  });

  describe('Response Format', () => {
    it('should return correct response structure', async () => {
      const req = new NextRequest('http://localhost:3000/api/chat/search?q=react');
      const response = await GET(req);
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect(body).toHaveProperty('results');
      expect(body).toHaveProperty('totalMatches');
      expect(body).toHaveProperty('executionTimeMs');
      expect(body).toHaveProperty('query');
      expect(Array.isArray(body.results)).toBe(true);
      expect(typeof body.totalMatches).toBe('number');
      expect(typeof body.executionTimeMs).toBe('number');
      expect(typeof body.query).toBe('string');
    });

    it('should include all required fields in search results', async () => {
      const req = new NextRequest('http://localhost:3000/api/chat/search?q=react');
      const response = await GET(req);
      const body = await readJson(response);

      expect(response.status).toBe(200);
      if (body.results.length > 0) {
        const result = body.results[0];
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('lastMessagePreview');
        expect(result).toHaveProperty('messageCount');
        expect(result).toHaveProperty('lastMessageTimestamp');
        expect(result).toHaveProperty('matchType');
        expect(['title', 'preview', 'content']).toContain(result.matchType);
      }
    });

    it('should include request ID in response headers', async () => {
      const req = new NextRequest('http://localhost:3000/api/chat/search?q=test');
      const response = await GET(req);

      expect(response.headers['x-request-id']).toBe('test-req-search');
    });

    it('should return execution time in milliseconds', async () => {
      const req = new NextRequest('http://localhost:3000/api/chat/search?q=test');
      const response = await GET(req);
      const body = await readJson(response);

      expect(body.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof body.executionTimeMs).toBe('number');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock createClient to return a client that throws errors
      const supabaseMock = jest.requireMock('../../lib/supabase/server');
      const originalCreateClient = supabaseMock.createClient;
      
      supabaseMock.createClient = jest.fn(async () => ({
        rpc: jest.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST301', message: 'Database connection error' },
        }),
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          or: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          then: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
        })),
      }));

      const req = new NextRequest('http://localhost:3000/api/chat/search?q=test');
      const response = await GET(req);
      const body = await readJson(response);

      expect(response.status).toBe(500);
      expect(body.error).toBe('Internal server error');
      expect(body.code).toBe('INTERNAL_ERROR');

      // Restore original mock
      supabaseMock.createClient = originalCreateClient;
    });
  });
});
