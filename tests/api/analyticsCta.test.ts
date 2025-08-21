/**
 * Tests for CTA analytics endpoint
 */

// Polyfills first: Buffer, Headers, Request, Response
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
      this._body = body; this.status = init?.status ?? 200; this.statusText = init?.statusText ?? '';
      this.headers = init?.headers || new (globalThis as unknown as { Headers: { new(): unknown } }).Headers(); this.url = '';
    }
    static json(data: unknown, init?: { status?: number; statusText?: string; headers?: Record<string, string> }) {
      type HeaderSetter = { set: (k: string, v: string) => void };
      const HeadersCtor = (globalThis as unknown as { Headers?: new () => HeaderSetter }).Headers;
      const headers = HeadersCtor ? new (HeadersCtor as unknown as new () => HeaderSetter)() : undefined;
      if (headers) {
        headers.set('content-type', 'application/json');
        if (init?.headers) for (const [k, v] of Object.entries(init.headers)) headers.set(k, v);
      }
      return new ResponsePolyfill(JSON.stringify(data), { status: init?.status, statusText: init?.statusText, headers });
    }
    async json() { try { return typeof this._body === 'string' ? JSON.parse(this._body as string) : this._body; } catch { return this._body; } }
    async text() { return typeof this._body === 'string' ? (this._body as string) : JSON.stringify(this._body); }
  }
  (globalThis as unknown as { Response: unknown }).Response = ResponsePolyfill as unknown;
}

// Mock next/server's NextResponse
jest.mock('next/server', () => {
  class MockNextResponse {
    status: number;
    headers: unknown;
    private _body: unknown;
    constructor(body?: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.status = init?.status ?? 200;
      type HeaderSetter = { set: (k: string, v: string) => void };
      const HeadersCtor = (globalThis as unknown as { Headers?: new () => HeaderSetter }).Headers;
      this.headers = HeadersCtor ? new (HeadersCtor as unknown as new () => HeaderSetter)() : {};
      if (init?.headers && this.headers && 'set' in (this.headers as Record<string, unknown>)) {
        const hs = this.headers as unknown as HeaderSetter;
        for (const [k, v] of Object.entries(init.headers)) hs.set(k, v);
      }
      this._body = body;
    }
    static json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) { return new MockNextResponse(body, init); }
    async json() { return this._body; }
  }
  return { NextResponse: MockNextResponse, NextRequest: class { url = ''; constructor(u: string){ this.url = u; } } };
});

import type { AuthContext, FeatureFlags } from '../../lib/types/auth';

// Mock auth/rate limit/logger wrappers
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
const currentAuthContext: AuthContext = { isAuthenticated: false, user: null, profile: null, accessLevel: 'anonymous', features: featureFlags };

jest.mock('/Users/zhenwei.seo/github/openrouter-chatbot/lib/middleware/auth', () => ({
  withEnhancedAuth: (handler: (req: unknown, ctx: AuthContext) => unknown) => (req: unknown) => handler(req, currentAuthContext),
}));

type RLHandler = (req: unknown, ctx: AuthContext) => Promise<unknown> | unknown;

jest.mock('/Users/zhenwei.seo/github/openrouter-chatbot/lib/middleware/rateLimitMiddleware', () => ({
  withRateLimit: (handler: RLHandler) => (req: unknown, ctx: AuthContext) => handler(req, ctx),
  addRateLimitHeaders: (res: unknown) => res,
}));

jest.mock('../../lib/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

// Import handler
import { POST as trackCta } from '../../src/app/api/analytics/cta/route';

// Minimal request builder for handler
const makeReq = (body: unknown) => ({
  method: 'POST',
  headers: new (globalThis as unknown as { Headers: new () => { set: (k: string, v: string) => void } }).Headers(),
  json: async () => body,
});

describe('CTA analytics API', () => {
  test('accepts minimal payload and returns ok with auth flag', async () => {
    const res = await (trackCta as unknown as (req: unknown) => Promise<{ status: number; json: () => Promise<unknown> }>)(makeReq({ page: 'landing', cta_id: 'start_chat' }));
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean; auth: boolean };
    expect(data.ok).toBe(true);
    expect(data.auth).toBe(false);
  });

  test('rejects missing fields', async () => {
    const res = await (trackCta as unknown as (req: unknown) => Promise<{ status: number; json: () => Promise<unknown> }>)(makeReq({ cta_id: 'x' }));
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toMatch(/Missing required/);
  });
});
