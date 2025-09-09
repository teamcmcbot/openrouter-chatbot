import { act } from '@testing-library/react';
import { useChatStore } from '../../stores/useChatStore';

// Extend minimal options interface locally to satisfy TS without exporting from store
interface SendOptionsTest {
  attachmentIds?: string[];
  draftId?: string;
  webSearch?: boolean;
  webMaxResults?: number;
  reasoning?: { effort?: 'low' | 'medium' | 'high' };
  imageOutput?: boolean;
}

// Minimal mock for fetch capturing body
const originalFetch = global.fetch;

describe('useChatStore non-stream imageOutput flag', () => {
  beforeEach(() => {
    const mockFn = jest.fn(async (_url: string | Request | URL, init?: RequestInit) => {
      // Echo back body for assertion
      const parsed = init && typeof init.body === 'string' ? JSON.parse(init.body) : {};
      return {
        ok: true,
        json: async () => ({
          response: 'ok',
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
          request_id: parsed.current_message_id,
          id: 'cmp_123',
          model: parsed.model || 'test-model',
          contentType: 'text',
          elapsed_ms: 10,
        }),
      } as unknown as Response;
    });
    // Cast through unknown to satisfy the overloaded fetch signature
    global.fetch = mockFn as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('includes imageOutput true in POST body when option enabled', async () => {
    const send = useChatStore.getState().sendMessage;
    await act(async () => {
      await send('hello world', 'dummy-model', { imageOutput: true } as SendOptionsTest);
    });

    // Inspect last fetch call body
    const fetchMock = global.fetch as unknown as jest.Mock;
    expect(fetchMock).toHaveBeenCalled();
    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    const body = JSON.parse(lastCall[1].body as string);
    expect(body.imageOutput).toBe(true);
    expect(body.message).toBe('hello world');
  });
});
