import { act } from '@testing-library/react';
import { useChatStore } from '../../stores/useChatStore';

// Minimal interface for send options
interface SendOptionsTest {
  attachmentIds?: string[];
  draftId?: string;
  webSearch?: boolean;
  webMaxResults?: number;
  reasoning?: { effort?: 'low' | 'medium' | 'high' };
  imageOutput?: boolean;
}

describe('useChatStore maps output_images to assistant message', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    const mockFn = jest.fn(async (_url: string | Request | URL, init?: RequestInit) => {
      const parsed = init && typeof init.body === 'string' ? JSON.parse(init.body) : {};
      return {
        ok: true,
        json: async () => ({
          data: {
            response: 'Here is an image',
            usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
            request_id: parsed.current_message_id,
            id: 'cmp_img_123',
            model: parsed.model || 'image-model',
            contentType: 'markdown',
            elapsed_ms: 1234,
            output_images: [
              'data:image/png;base64,AAAA',
              'data:image/png;base64,BBBB'
            ],
          }
        }),
      } as unknown as Response;
    });
    global.fetch = mockFn as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('assigns output_images array to assistant message', async () => {
    const send = useChatStore.getState().sendMessage;
    await act(async () => {
      await send('generate an image', 'dummy-model', { imageOutput: true } as SendOptionsTest);
    });

    const state = useChatStore.getState();
    const convId = state.currentConversationId!;
    const conv = state.conversations.find(c => c.id === convId)!;
    // Last message should be assistant
    const last = conv.messages[conv.messages.length - 1];
    expect(last.role).toBe('assistant');
    expect(Array.isArray(last.output_images)).toBe(true);
    expect(last.output_images).toHaveLength(2);
    expect(last.output_images?.[0]).toBe('data:image/png;base64,AAAA');
  });
});
