/**
 * Validate TTL selection precedence in setAuthSnapshot:
 * env AUTH_SNAPSHOT_CACHE_TTL_SECONDS > explicit ttlSec param > default 900
 */

// Mock Upstash Redis client
class FakeRedis {
  public setCalls: Array<{ key: string; value: string; ex?: number }> = [];
  async set(key: string, value: string, opts?: { ex?: number }) {
    this.setCalls.push({ key, value, ex: opts?.ex });
  }
}

const fake = new FakeRedis();

jest.mock('../../lib/utils/logger', () => ({ logger: { warn: jest.fn() } }));
jest.mock('@upstash/redis', () => ({ Redis: { fromEnv: jest.fn(() => fake) } }));

describe('authSnapshot TTL precedence', () => {
  let mod: typeof import('../../lib/utils/authSnapshot');
  const realEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...realEnv, UPSTASH_REDIS_REST_URL: 'x', UPSTASH_REDIS_REST_TOKEN: 'y' };
    fake.setCalls.length = 0;
  });
  afterAll(() => { process.env = realEnv; });

  test('uses env when set', async () => {
    process.env.AUTH_SNAPSHOT_CACHE_TTL_SECONDS = '300';
    mod = await import('../../lib/utils/authSnapshot');
    await mod.setAuthSnapshot('u1', { v:1, isBanned:false, bannedUntil:null, tier:'free', accountType:'user', updatedAt:new Date().toISOString() });
    expect(fake.setCalls[0].ex).toBe(300);
  });

  test('uses explicit param when env unset', async () => {
    delete process.env.AUTH_SNAPSHOT_CACHE_TTL_SECONDS;
    mod = await import('../../lib/utils/authSnapshot');
    await mod.setAuthSnapshot('u2', { v:1, isBanned:false, bannedUntil:null, tier:'free', accountType:'user', updatedAt:new Date().toISOString() }, 1200);
    expect(fake.setCalls[0].ex).toBe(1200);
  });

  test('falls back to 900 by default', async () => {
    delete process.env.AUTH_SNAPSHOT_CACHE_TTL_SECONDS;
    mod = await import('../../lib/utils/authSnapshot');
    await mod.setAuthSnapshot('u3', { v:1, isBanned:false, bannedUntil:null, tier:'free', accountType:'user', updatedAt:new Date().toISOString() });
    expect(fake.setCalls[0].ex).toBe(900);
  });
});
