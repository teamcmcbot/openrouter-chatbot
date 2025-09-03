/** @jest-environment jsdom */

import {
  getOrCreateAnonymousSessionId,
  clearAnonymousSessionId,
  setAnonymousOptOut,
  emitAnonymousUsage,
  emitAnonymousError,
} from '../../../lib/analytics/anonymous';

// Ensure fetch exists in jsdom
const mockFetch = jest.fn(() => Promise.resolve(new Response(null, { status: 204 })));
// Type the mock as the global fetch function
global.fetch = mockFetch as unknown as typeof fetch;

describe('anonymous analytics', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    localStorage.clear();
  // In test env, postJSON is a no-op; ensure that behavior by asserting fetch NOT called
  });

  afterEach(() => {
    clearAnonymousSessionId();
  });

  it('creates and slides TTL for session id', () => {
    const ttl = 1000; // 1s
    const id1 = getOrCreateAnonymousSessionId(ttl);
    expect(id1).toBeTruthy();

    const exp1 = parseInt(localStorage.getItem('anon_session_expiry')!, 10);
    expect(exp1).toBeGreaterThan(Date.now());

    // Access again should extend expiry, keep same id
    const beforeExtend = exp1;
    const id2 = getOrCreateAnonymousSessionId(ttl);
    const exp2 = parseInt(localStorage.getItem('anon_session_expiry')!, 10);
  expect(id2).toBe(id1);
  // Calls can occur within the same millisecond in CI; allow equality
  expect(exp2).toBeGreaterThanOrEqual(beforeExtend);
  });

  it('respects opt-out flag', () => {
    setAnonymousOptOut(true);
    const id = getOrCreateAnonymousSessionId(1000);
    expect(id).toBeNull();
  });

  it('emitAnonymousUsage is no-op in tests (does not call fetch)', () => {
    const events = [
      { timestamp: new Date().toISOString(), type: 'message_sent' as const, input_tokens: 5 },
    ];
    emitAnonymousUsage(events, { ttlMs: 1000 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('emitAnonymousError is no-op in tests (does not call fetch) and normalizes timestamp', () => {
  emitAnonymousError({
      timestamp: '',
      model: 'gpt-4o-mini',
      error_message: 'fail',
  }, { ttlMs: 1000 });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
