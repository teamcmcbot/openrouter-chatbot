import { getGenerationFromCache, setGenerationInCache, clearGenerationCache } from '../../../lib/utils/generationCache';
import type { GenerationData } from '../../../lib/types/generation';

// jsdom provides window/localStorage

describe('generationCache', () => {
  const sample: GenerationData = {
    id: 'gen-1',
    total_cost: 0.0001,
    created_at: new Date().toISOString(),
    model: 'test/model',
    origin: '',
    usage: 0,
    is_byok: false,
    upstream_id: 'up-1',
    cache_discount: 0 as unknown as number,
    upstream_inference_cost: 0,
    app_id: null as unknown as number,
    streamed: true,
    cancelled: false,
    provider_name: 'Test',
    latency: 100,
    moderation_latency: null as unknown as number,
    generation_time: 150,
    finish_reason: 'stop',
    native_finish_reason: 'stop',
    tokens_prompt: 10,
    tokens_completion: 5,
    native_tokens_prompt: 10,
    native_tokens_completion: 5,
    native_tokens_reasoning: 0,
    num_media_prompt: null as unknown as number,
    num_media_completion: null as unknown as number,
    num_search_results: null as unknown as number,
  };

  beforeEach(() => {
    clearGenerationCache();
  });

  it('returns null on cache miss', () => {
    expect(getGenerationFromCache('missing')).toBeNull();
  });

  it('stores and retrieves an entry', () => {
    setGenerationInCache(sample.id, sample);
    const hit = getGenerationFromCache(sample.id);
    expect(hit).not.toBeNull();
    expect(hit?.id).toBe(sample.id);
  });

  it('clears cache', () => {
    setGenerationInCache(sample.id, sample);
    clearGenerationCache();
    expect(getGenerationFromCache(sample.id)).toBeNull();
  });

  it('enforces LRU capacity of 30', () => {
    // Insert 31 items; the first should be evicted
    for (let i = 0; i < 31; i++) {
      setGenerationInCache(`gen-${i}`, { ...sample, id: `gen-${i}` });
    }
    expect(getGenerationFromCache('gen-0')).toBeNull();
    expect(getGenerationFromCache('gen-30')?.id).toBe('gen-30');
  });

  it('updates MRU order on get', () => {
    // Fill to capacity 30
    for (let i = 1; i <= 30; i++) {
      setGenerationInCache(`gen-${i}`, { ...sample, id: `gen-${i}` });
    }
    // Touch gen-1 to make it MRU
    expect(getGenerationFromCache('gen-1')?.id).toBe('gen-1');
    // Add one more to cause eviction of the LRU (gen-2 becomes LRU if order was 2..30,1)
    setGenerationInCache('gen-31', { ...sample, id: 'gen-31' });
    // gen-2 should be evicted in typical shift; gen-1 should remain due to touch
    expect(getGenerationFromCache('gen-2')).toBeNull();
    expect(getGenerationFromCache('gen-1')?.id).toBe('gen-1');
  });

  it('expires entries after TTL (simulated)', () => {
    jest.useFakeTimers();
    setGenerationInCache(sample.id, sample);
    // Advance time by 24h + 1ms
    const oneDayMs = 24 * 60 * 60 * 1000;
    jest.setSystemTime(Date.now() + oneDayMs + 1);
    expect(getGenerationFromCache(sample.id)).toBeNull();
    jest.useRealTimers();
  });
});
