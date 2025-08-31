/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for loadConversationMessages inflight dedupe and incremental append
 */

import { act } from '@testing-library/react';

jest.mock('../../stores/useAuthStore', () => ({ useAuthStore: { getState: () => ({ user: { id: 'u1' } }) } }));

// Mock fetch
const fetchMock = jest.fn();
(global as any).fetch = fetchMock;

// Import store after mocks
import { useChatStore } from '../../stores/useChatStore';

const setupStore = () => {
  // Reset store state for each test
  const initial = useChatStore.getState();
  useChatStore.setState({
    ...initial,
    conversations: [
      { id: 'sess-1', title: 't', messages: [], userId: 'u1', createdAt: '', updatedAt: '', messageCount: 0, totalTokens: 0, isActive: false },
    ],
    currentConversationId: 'sess-1',
  }, true);
};

describe('useChatStore loadConversationMessages inflight dedupe', () => {
  beforeEach(() => { jest.resetAllMocks(); setupStore(); });

  it('only fires one network call when called twice rapidly for empty session', async () => {
    // First call response (full list)
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [{ id: 'u1', role: 'user', content: 'a', timestamp: new Date('2025-01-01T00:00:00Z') }, { id: 'a1', role: 'assistant', content: 'b', timestamp: new Date('2025-01-01T00:00:10Z') }] }) });

    await act(async () => {
      const { loadConversationMessages } = useChatStore.getState();
      // Kick two loads without awaiting between
      const p1 = loadConversationMessages!('sess-1');
      const p2 = loadConversationMessages!('sess-1');
      await Promise.all([p1, p2]);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const state = useChatStore.getState();
    expect(state.getCurrentMessages().length).toBe(2);
  });

  it('uses since_ts and appends newer messages on subsequent call', async () => {
    // First: full fetch
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [{ id: 'u1', role: 'user', content: 'a', timestamp: new Date('2025-01-01T00:00:00Z') }] }) });
    await act(async () => { await useChatStore.getState().loadConversationMessages!('sess-1'); });

    // Second: incremental fetch returns one newer message
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ up_to_date: false, messages: [{ id: 'a1', role: 'assistant', content: 'b', timestamp: new Date('2025-01-01T00:01:00Z') }] }) });
    await act(async () => { await useChatStore.getState().loadConversationMessages!('sess-1'); });

    // Should have appended a1
    const msgs = useChatStore.getState().getCurrentMessages();
    expect(msgs.map(m => m.id)).toEqual(['u1','a1']);
    const url = (fetchMock.mock.calls[1][0] as string);
    expect(url).toContain('since_ts=');
  });
});
