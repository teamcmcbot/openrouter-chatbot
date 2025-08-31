/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests strict top-page revalidation behavior in loadUserConversations
 * - The top 20 list is reset to the server ordering
 * - Cached messages for matching conversations are preserved
 * - Local conversations not in the server page remain after the top page
 */

import { act } from '@testing-library/react';

// Minimal auth store mock to simulate authenticated user
jest.mock('../../stores/useAuthStore', () => ({ useAuthStore: { getState: () => ({ user: { id: 'u1' } }) } }));

// Mock fetch for /api/chat/sync
const fetchMock = jest.fn();
(global as any).fetch = fetchMock;

import { useChatStore } from '../../stores/useChatStore';

const makeMsg = (id: string, role: 'user'|'assistant', content: string, ts: string) => ({ id, role, content, timestamp: new Date(ts) });

const resetStore = () => {
  const init = useChatStore.getState();
  // Seed with two conversations, one with cached messages
  const conv1 = {
    id: 'sess-1',
    title: 'Local 1',
    messages: [
      makeMsg('u-1', 'user', 'Hello', '2025-08-31T10:00:00Z'),
    ],
    userId: 'u1',
    createdAt: '2025-08-20T00:00:00Z',
    updatedAt: '2025-08-31T10:00:00Z',
    messageCount: 1,
    totalTokens: 0,
    isActive: false,
    lastMessagePreview: undefined,
    lastMessageTimestamp: '2025-08-31T10:00:00Z',
  };
  const conv2 = {
    id: 'sess-2',
    title: 'Local 2',
    messages: [],
    userId: 'u1',
    createdAt: '2025-08-20T00:00:00Z',
    updatedAt: '2025-08-30T01:00:00Z',
    messageCount: 0,
    totalTokens: 0,
    isActive: false,
    lastMessagePreview: undefined,
    lastMessageTimestamp: '2025-08-30T01:00:00Z',
  };
  useChatStore.setState({
    ...init,
    conversations: [conv1 as any, conv2 as any],
    currentConversationId: 'sess-1',
    isLoading: false,
    sidebarPaging: { pageSize: 20, loading: false, hasMore: false, nextCursor: null, initialized: false },
  }, true);
};

describe('useChatStore top-page revalidation', () => {
  beforeEach(() => { jest.resetAllMocks(); resetStore(); });

  it('resets top page to server, preserves messages, and keeps others', async () => {
    // Server returns sess-1 (no messages in payload) and a new sess-3
    const serverConversations = [
      {
        id: 'sess-1', title: 'Server 1', messages: [], userId: 'u1',
        createdAt: '2025-08-20T00:00:00Z', updatedAt: '2025-08-31T10:00:00Z', lastMessageTimestamp: '2025-08-31T10:00:00Z',
        messageCount: 10, totalTokens: 100, isActive: false,
      },
      {
        id: 'sess-3', title: 'Server 3', messages: [], userId: 'u1',
        createdAt: '2025-08-31T09:00:00Z', updatedAt: '2025-08-31T09:00:00Z', lastMessageTimestamp: '2025-08-31T09:00:00Z',
        messageCount: 1, totalTokens: 0, isActive: false,
      },
    ];
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ conversations: serverConversations, meta: { hasMore: false, nextCursor: null, pageSize: 20 }, syncTime: new Date().toISOString() }) });

    await act(async () => {
      await useChatStore.getState().loadUserConversations('u1');
    });

    const state = useChatStore.getState();

    // sess-1 should still have its cached messages preserved
    const sess1 = state.conversations.find(c => c.id === 'sess-1')!;
    expect(sess1.messages.length).toBe(1);
    expect(sess1.messages[0].id).toBe('u-1');

    // sess-2 should still be present after merging (not in top page but kept after)
    expect(state.conversations.some(c => c.id === 'sess-2')).toBe(true);

    // sess-3 should be present from server
    expect(state.conversations.some(c => c.id === 'sess-3')).toBe(true);

    // Ordering should be by lastMessageTimestamp desc: sess-1 (10:00), sess-3 (09:00), sess-2 (01:00)
    const orderedIds = state.conversations.map(c => c.id);
    expect(orderedIds.indexOf('sess-1')).toBeLessThan(orderedIds.indexOf('sess-3'));
    expect(orderedIds.indexOf('sess-3')).toBeLessThan(orderedIds.indexOf('sess-2'));
  });
});
