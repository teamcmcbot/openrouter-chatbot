import { renderHook, act } from '@testing-library/react';
import { useChatStreaming } from '../../hooks/useChatStreaming';

// Basic mocks required by project testing standards
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
  useSettingsStore: () => ({ getSetting: (k: string, def: unknown) => (k === 'streamingEnabled' ? true : def) }),
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  updateConversationTitle: (_id: string, _t: string) => {},
    setConversationErrorBanner: () => {},
    clearConversationErrorBanner: () => {},
    sendMessage: jest.fn(),
    retryMessage: jest.fn(),
    setState: (updater: (s: ChatStateMock) => Partial<ChatStateMock>) => { const partial = updater(state); state = { ...state, ...partial }; },
  };
  return { useChatStore: Object.assign(() => state, { getState: () => state, setState: (fn: (s: ChatStateMock) => Partial<ChatStateMock>) => { const next = fn(state); state = { ...state, ...next }; } }) };
});

// Mock token limits
jest.mock('../../lib/utils/tokens', () => ({
  getModelTokenLimits: async () => ({ maxInputTokens: 8192 })
}));

// Mock analytics
jest.mock('../../lib/analytics/anonymous', () => ({
  emitAnonymousError: jest.fn(),
  emitAnonymousUsage: jest.fn(),
}));

// Mock rate limit notifications
jest.mock('../../lib/utils/rateLimitNotifications', () => ({
  checkRateLimitHeaders: jest.fn(),
}));

// Provide a mocked fetch that simulates streaming with an image delta marker then final metadata
function buildStream(chunks: string[]) {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]));
        i++;
      } else {
        controller.close();
      }
    }
  });
}

describe('useChatStreaming image streaming', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('receives images only via final metadata (no incremental markers)', async () => {
    const base64Img = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';
    const chunks = [
      JSON.stringify({ __FINAL_METADATA__: { response: 'done', usage: { prompt_tokens:1, completion_tokens:1, total_tokens:2 }, images: [base64Img] } }) + '\n'
    ];

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: buildStream(chunks),
    });

    const { result } = renderHook(() => useChatStreaming());

    await act(async () => {
      await result.current.sendMessage('Generate an image', 'test/model', { imageOutput: true });
    });

    const messages = result.current.messages;
    const assistant = messages.find(m => m.role === 'assistant');
    expect(assistant).toBeTruthy();
    expect(assistant?.output_images).toBeDefined();
  expect(assistant?.output_images?.length).toBe(1);
  expect(assistant?.output_images?.[0]).toBe(base64Img);
  // Ensure no marker content leaked
  expect(assistant?.content).not.toMatch(/__IMAGE_DELTA_CHUNK__/);
  });
});
