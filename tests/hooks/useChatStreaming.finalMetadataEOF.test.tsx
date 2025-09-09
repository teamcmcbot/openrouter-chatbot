import { renderHook, act } from '@testing-library/react';
import { useChatStreaming } from '../../hooks/useChatStreaming';

// Reuse mocking approach from other tests (simplified copies) ------------------
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn(), forward: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('../../stores/useAuthStore', () => ({
  useAuth: () => ({ isAuthenticated: false }),
  useAuthStore: { getState: () => ({ user: null }) },
}));

jest.mock('../../stores/useSettingsStore', () => ({
  useSettingsStore: () => ({ getSetting: (k: string) => (k === 'streamingEnabled' ? true : true) })
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
  return { useChatStore: Object.assign(() => state, { getState: () => state, setState: (fn: (s: ChatStateMock) => Partial<ChatStateMock>) => { const next = fn(state); state = { ...state, ...next }; } }) };
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

// Build a stream that omits the trailing newline after final metadata JSON.
function buildStream(chunks: string[]) {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]));
        i++;
      } else {
        controller.close(); // Closes immediately without newline flush
      }
    }
  });
}

describe('useChatStreaming final metadata without trailing newline', () => {
  it('parses final metadata JSON (no trailing newline) without leaking raw JSON', async () => {
    const finalObj = { __FINAL_METADATA__: { response: 'done', usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 }, id: 'abc123', model: 'm-test', images: [] } };
    const chunks = [
      'Assistant partial content line.\n',
      JSON.stringify(finalObj) // intentionally no trailing \n
    ];

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: buildStream(chunks),
    });

    const { result } = renderHook(() => useChatStreaming());

    await act(async () => {
      await result.current.sendMessage('Test newline-less final metadata', 'test/model');
    });

   
  const assistant = result.current.messages.find(m => m.role === 'assistant') as any;

  // After fix: metadata should be parsed even without trailing newline and not appear as raw JSON content.
    expect(assistant).toBeTruthy();
  // Assert flattened token fields populated
   
  expect(typeof (assistant as any)?.total_tokens).toBe('number');
   
  expect((assistant as any).total_tokens).toBe(5);
   
  expect((assistant as any).input_tokens).toBe(2);
   
  expect((assistant as any).output_tokens).toBe(3);
    if (typeof assistant?.content === 'string') {
  expect(assistant.content).not.toMatch(/__FINAL_METADATA__/); // Raw JSON should be removed by fallback scrub
    }
  });
});
