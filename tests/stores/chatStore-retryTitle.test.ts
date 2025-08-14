import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { useChatStore } from '../../stores/useChatStore';
import { useAuthStore } from '../../stores/useAuthStore';
import type { ChatMessage } from '../../lib/types/chat';
import type { User } from '@supabase/supabase-js';

const mockFetch = jest.fn();
// @ts-ignore
global.fetch = mockFetch;

describe('ChatStore retry title update', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Authenticate user for persistence logic
    useAuthStore.setState({
      user: { id: 'user-1' } as User,
      session: null,
      isAuthenticated: true,
      isLoading: false,
      isInitialized: true,
      isHydrated: true,
      error: null,
      lastUpdated: new Date(),
      _hasHydrated: jest.fn(),
      clearError: jest.fn(),
      reset: jest.fn(),
      setUser: jest.fn(),
      setSession: jest.fn(),
      clearAuth: jest.fn(),
      setLoading: jest.fn(),
      setInitialized: jest.fn(),
      signInWithGoogle: jest.fn(),
      clearAllStores: jest.fn(),
      initialize: jest.fn(),
      signOut: jest.fn(),
    } as any);

    // Reset store state
    useChatStore.setState({
      conversations: [],
      currentConversationId: null,
      isLoading: false,
      error: null,
      isHydrated: true,
      isSyncing: false,
      lastSyncTime: null,
      syncError: null,
      syncInProgress: false,
    });
    process.env.NEXT_PUBLIC_ENABLE_CONTEXT_AWARE = 'false';
  });

  it('auto-generates title after successful retry and persists it', async () => {
    const store = useChatStore.getState();
    const convId = store.createConversation();

    // Insert failed user message
    const failedMessage: ChatMessage = {
      id: 'm1',
      content: 'Hello world',
      role: 'user',
      timestamp: new Date(),
      error: true,
    };
    useChatStore.setState((state) => ({
      conversations: state.conversations.map((conv) =>
        conv.id === convId ? { ...conv, messages: [failedMessage] } : conv
      ),
    }));

    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/chat') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                response: 'Hi there',
                request_id: 'm1',
                usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
              },
            }),
        } as Response);
      }
      if (url === '/api/chat/messages') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        } as Response);
      }
      return Promise.reject(new Error('unknown url'));
    });

    await store.retryMessage('m1', 'Hello world');
    await new Promise((resolve) => setTimeout(resolve, 100));

    const updatedConv = useChatStore.getState().conversations.find((c) => c.id === convId);
    expect(updatedConv?.title).toBe('Hello world');

    const messagesCall = mockFetch.mock.calls.find((call) => call[0] === '/api/chat/messages');
    expect(messagesCall).toBeTruthy();
    const body = JSON.parse(messagesCall![1].body as string);
    expect(body.sessionTitle).toBe('Hello world');
  });
});
