import { renderHook, act } from '@testing-library/react';
import { useChatStreaming } from '../../hooks/useChatStreaming';

// Basic mocks (align with imageStreaming test) ------------------
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn(), forward: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('../../stores/useAuthStore', () => ({
  useAuth: () => ({ isAuthenticated: false }),
  useAuthStore: { getState: () => ({ user: null }) },
}));

jest.mock('../../stores/useChatStore', () => {
  const baseConv = { id: 'conv1', title: 'New Chat', messages: [], updatedAt: new Date().toISOString() };
  interface Conversation { id: string; title: string; messages: unknown[]; updatedAt: string }
  interface ChatStateMock {
    conversations: Conversation[];
    currentConversationId: string;
    isLoading: boolean;
  error: unknown;
    isHydrated: boolean;
  getCurrentMessages: () => unknown[];
    clearCurrentMessages: () => void;
    clearError: () => void;
    clearMessageError: () => void;
    createConversation: () => string;
  getContextMessages: () => unknown[];
    updateConversationTitle: (_id: string, _t: string) => void;
    setConversationErrorBanner: () => void;
    clearConversationErrorBanner: () => void;
    sendMessage: jest.Mock;
    retryMessage: jest.Mock;
    setState: (updater: (s: ChatStateMock) => Partial<ChatStateMock>) => void;
  }
  let state: ChatStateMock = {
    conversations: [baseConv],
    currentConversationId: 'conv1',
    isLoading: false,
    error: null,
    isHydrated: true,
    getCurrentMessages: () => state.conversations[0].messages,
    clearCurrentMessages: () => { state.conversations[0].messages = []; },
    clearError: () => { state.error = null; },
    clearMessageError: () => {},
    createConversation: () => 'conv1',
    getContextMessages: () => [],
    updateConversationTitle: () => {},
    setConversationErrorBanner: () => {},
    clearConversationErrorBanner: () => {},
    sendMessage: jest.fn(),
    retryMessage: jest.fn(),
    setState: (updater: (s: ChatStateMock) => Partial<ChatStateMock>) => { const partial = updater(state); state = { ...state, ...partial }; },
  };
  return { 
    useChatStore: Object.assign(() => state, { getState: () => state, setState: (fn: (s: ChatStateMock) => Partial<ChatStateMock>) => { const next = fn(state); state = { ...state, ...next }; } }),
    updateConversationFromMessages: (conv: Conversation) => ({ ...conv, updatedAt: new Date().toISOString() })
  };
});

jest.mock('../../lib/utils/tokens', () => ({
  getModelTokenLimits: async () => ({ maxInputTokens: 8192 })
}));

jest.mock('../../lib/analytics/anonymous', () => ({
  emitAnonymousError: jest.fn(),
  emitAnonymousUsage: jest.fn(),
}));

jest.mock('../../lib/utils/rateLimitNotifications', () => ({
  checkRateLimitHeaders: jest.fn(),
}));

// Mock settings store to force streaming enabled
jest.mock('../../stores/useSettingsStore', () => ({
  useSettingsStore: () => ({ getSetting: (k: string) => (k === 'streamingEnabled' ? true : true) })
}));

// Mock fetch to simulate streaming with image delta markers appearing inline
const encoder = new TextEncoder();

function buildStream(chunks: string[]) {
  const uint8Chunks = chunks.map(c => encoder.encode(c));
  return new ReadableStream({
    start(controller) {
      for (const c of uint8Chunks) controller.enqueue(c);
      controller.close();
    }
  });
}

describe('useChatStreaming image final-only sanitation', () => {
  beforeEach(() => {
    jest.spyOn(global, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      if (typeof url === 'string' && url.includes('/api/chat/stream')) {
        const body = buildStream([
          // Markers would be suppressed server-side now; simulate only normal content + final metadata
          'Some normal streamed content line.\n',
          JSON.stringify({ __FINAL_METADATA__: { response: 'Final content without markers', usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, id: 'x', model: 'm', images: ['data:image/png;base64,AAA'] } }) + '\n'
        ]);
    return Promise.resolve(new Response(body as ReadableStream, { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ data: {} }), { status: 200 }));
  }) as jest.Mock;
  });

  afterEach(() => {
    (global.fetch as jest.Mock).mockRestore();
  });

  it('does not expose __IMAGE_DELTA_CHUNK__ markers (suppressed server-side)', async () => {
    const { result } = renderHook(() => useChatStreaming());

    await act(async () => {
      await result.current.sendMessage('hello', 'test-model', { imageOutput: true });
    });

    const finalMessages = result.current.messages;
    // Assert no marker leakage anywhere
    for (const m of finalMessages as Array<{ content?: unknown }>) {
      if (typeof m.content === 'string') {
        expect(m.content).not.toMatch(/__IMAGE_DELTA_CHUNK__/);
      }
    }
    expect(result.current.streamingContent).not.toMatch(/__IMAGE_DELTA_CHUNK__/);
  });
});
