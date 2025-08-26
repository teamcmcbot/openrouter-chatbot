// Unit tests for server-only token utilities

// Quiet logger
jest.mock('../../../lib/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

// Mock server models helper
const mockGetServerModelConfig = jest.fn();
jest.mock('../../../lib/server/models', () => ({
  getServerModelConfig: (...args: unknown[]) => (mockGetServerModelConfig as (...a: unknown[]) => unknown)(...args),
}));

import { getModelTokenLimits, getMaxOutputTokens } from '../../../lib/utils/tokens.server';

describe('lib/utils/tokens.server', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns conservative default when modelId missing', async () => {
    const strat = await getModelTokenLimits(undefined, { tier: 'free' });
    expect(strat.totalContextLength).toBe(8000);
    expect(strat.maxOutputTokens).toBeGreaterThan(0);
  });

  it('uses DB context_length when available', async () => {
    mockGetServerModelConfig.mockResolvedValueOnce({ context_length: 32000, description: 'Test' });
    const strat = await getModelTokenLimits('openai/gpt-4o-mini', { tier: 'pro' });
    expect(strat.totalContextLength).toBe(32000);
  });

  it('falls back to default when not accessible for tier', async () => {
    mockGetServerModelConfig.mockResolvedValueOnce(null);
    const strat = await getModelTokenLimits('restricted/model', { tier: 'free' });
    expect(strat.totalContextLength).toBe(8000);
  });

  it('getMaxOutputTokens returns number from strategy', async () => {
    mockGetServerModelConfig.mockResolvedValueOnce({ context_length: 16000, description: 'X' });
    const max = await getMaxOutputTokens('x', { tier: 'pro' });
    expect(typeof max).toBe('number');
    expect(max).toBeGreaterThan(0);
  });
});
