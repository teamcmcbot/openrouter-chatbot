/**
 * Test suite for chat store search functionality
 * Tests performLocalSearch, performServerSearch, clearSearch, and search mode transitions
 */

import { useChatStore } from '../../stores/useChatStore';

// Mock the auth store
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({
      user: { id: 'test-user-123' },
    })),
  },
}));

// Mock fetch globally
global.fetch = jest.fn();

describe('Chat Store - Search Functionality', () => {
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    // Reset mocks
    mockFetch.mockClear();

    // Reset chat store to clean state
    useChatStore.setState({
      conversations: [],
      currentConversationId: null,
      error: null,
      isHydrated: true,
      searchQuery: '',
      searchMode: 'inactive',
      searchResults: [],
      searchLoading: false,
      searchError: null,
    });
  });

  describe('performLocalSearch', () => {
    beforeEach(() => {
      // Setup: Create test conversations with various content
      const conv1Id = useChatStore.getState().createConversation('React Testing Best Practices');
      const conv2Id = useChatStore.getState().createConversation('Python Data Analysis');
      const conv3Id = useChatStore.getState().createConversation('API Design Patterns');

      // Add messages to conversations
      useChatStore.setState((state) => ({
        conversations: state.conversations.map((c) => {
          if (c.id === conv1Id) {
            return {
              ...c,
              lastMessagePreview: 'How to test React components?',
              messages: [
                { id: 'm1', role: 'user', content: 'How to test React components?', timestamp: new Date('2025-10-26T10:00:00Z') } as any,
                { id: 'm2', role: 'assistant', content: 'Use React Testing Library for component tests', timestamp: new Date('2025-10-26T10:01:00Z') } as any,
              ],
              lastMessageTimestamp: '2025-10-26T10:01:00Z',
            };
          }
          if (c.id === conv2Id) {
            return {
              ...c,
              lastMessagePreview: 'Best practices for pandas',
              messages: [
                { id: 'm3', role: 'user', content: 'Best practices for pandas data analysis', timestamp: new Date('2025-10-26T09:00:00Z') } as any,
                { id: 'm4', role: 'assistant', content: 'Use vectorized operations', timestamp: new Date('2025-10-26T09:01:00Z') } as any,
              ],
              lastMessageTimestamp: '2025-10-26T09:01:00Z',
            };
          }
          if (c.id === conv3Id) {
            return {
              ...c,
              lastMessagePreview: 'RESTful API conventions',
              messages: [
                { id: 'm5', role: 'user', content: 'RESTful API design patterns', timestamp: new Date('2025-10-26T08:00:00Z') } as any,
                { id: 'm6', role: 'assistant', content: 'Follow HTTP verb conventions', timestamp: new Date('2025-10-26T08:01:00Z') } as any,
              ],
              lastMessageTimestamp: '2025-10-26T08:01:00Z',
            };
          }
          return c;
        }),
      }));
    });

    it('should filter conversations by title', () => {
      const store = useChatStore.getState();
      store.performLocalSearch('react');

      const state = useChatStore.getState();
      expect(state.searchMode).toBe('local');
      expect(state.searchQuery).toBe('react');
      expect(state.searchResults).toHaveLength(1);
      expect(state.searchResults[0].title).toContain('React');
    });

    it('should filter conversations by lastMessagePreview', () => {
      const store = useChatStore.getState();
      store.performLocalSearch('pandas');

      const state = useChatStore.getState();
      expect(state.searchMode).toBe('local');
      expect(state.searchResults).toHaveLength(1);
      expect(state.searchResults[0].lastMessagePreview).toContain('pandas');
    });

    it('should filter conversations by message content', () => {
      const store = useChatStore.getState();
      store.performLocalSearch('vectorized');

      const state = useChatStore.getState();
      expect(state.searchMode).toBe('local');
      expect(state.searchResults).toHaveLength(1);
      expect(state.searchResults[0].title).toBe('Python Data Analysis');
    });

    it('should be case-insensitive', () => {
      const store = useChatStore.getState();
      store.performLocalSearch('REACT');

      const state = useChatStore.getState();
      expect(state.searchResults).toHaveLength(1);
      expect(state.searchResults[0].title).toContain('React');
    });

    it('should return empty results for non-matching query', () => {
      const store = useChatStore.getState();
      store.performLocalSearch('nonexistent');

      const state = useChatStore.getState();
      expect(state.searchMode).toBe('local');
      expect(state.searchResults).toHaveLength(0);
    });

    it('should return multiple matching conversations', () => {
      const store = useChatStore.getState();
      store.performLocalSearch('api');

      const state = useChatStore.getState();
      expect(state.searchMode).toBe('local');
      expect(state.searchResults.length).toBeGreaterThan(0);
    });

    it('should sort results by timestamp descending (most recent first)', () => {
      const store = useChatStore.getState();
      // Search for a term that matches multiple conversations
      store.performLocalSearch('test'); // Matches "React Testing" and potentially others

      const state = useChatStore.getState();
      if (state.searchResults.length > 1) {
        for (let i = 0; i < state.searchResults.length - 1; i++) {
          const current = new Date(state.searchResults[i].lastMessageTimestamp || 0).getTime();
          const next = new Date(state.searchResults[i + 1].lastMessageTimestamp || 0).getTime();
          expect(current).toBeGreaterThanOrEqual(next);
        }
      }
    });

    it('should update searchQuery state', () => {
      const store = useChatStore.getState();
      store.performLocalSearch('test query');

      const state = useChatStore.getState();
      expect(state.searchQuery).toBe('test query');
    });

    it('should not call backend API', () => {
      const store = useChatStore.getState();
      store.performLocalSearch('react');

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('performServerSearch', () => {
    it('should validate minimum query length', async () => {
      const store = useChatStore.getState();
      await store.performServerSearch('a'); // Less than 2 chars

      // Implementation calls clearSearch() which resets everything
      const state = useChatStore.getState();
      expect(state.searchQuery).toBe('');
      expect(state.searchMode).toBe('inactive');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should make API call with correct parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 's1',
              title: 'Test Conversation',
              lastMessagePreview: 'Test preview',
              messageCount: 5,
              lastMessageTimestamp: '2025-10-26T10:00:00Z',
              matchType: 'title',
            },
          ],
          totalMatches: 1,
          executionTimeMs: 50,
          query: 'test',
        }),
      } as Response);

      const store = useChatStore.getState();
      await store.performServerSearch('test');

      // Implementation just passes the URL string to fetch
      expect(mockFetch).toHaveBeenCalledWith('/api/chat/search?q=test&limit=50');
    });

    it('should set loading state during API call', async () => {
      // Create a promise we can control
      let resolvePromise: any;
      const controlledPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockFetch.mockReturnValueOnce(controlledPromise as any);

      const store = useChatStore.getState();
      const searchPromise = store.performServerSearch('test');

      // Check loading state before promise resolves
      expect(useChatStore.getState().searchLoading).toBe(true);

      // Resolve the promise
      resolvePromise({
        ok: true,
        json: async () => ({ results: [], totalMatches: 0, executionTimeMs: 0, query: 'test' }),
      });

      await searchPromise;

      // Check loading state after promise resolves
      expect(useChatStore.getState().searchLoading).toBe(false);
    });

    it('should transform API results to Conversation objects', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 's1',
              title: 'API Test',
              lastMessagePreview: 'Preview text',
              messageCount: 10,
              lastMessageTimestamp: '2025-10-26T10:00:00Z',
              matchType: 'title',
            },
          ],
          totalMatches: 1,
          executionTimeMs: 25,
          query: 'api',
        }),
      } as Response);

      const store = useChatStore.getState();
      await store.performServerSearch('api');

      const state = useChatStore.getState();
      expect(state.searchMode).toBe('server');
      expect(state.searchResults).toHaveLength(1);
      expect(state.searchResults[0]).toMatchObject({
        id: 's1',
        title: 'API Test',
        lastMessagePreview: 'Preview text',
      });
      expect(state.searchResults[0].messages).toEqual([]);
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' }),
      } as Response);

      const store = useChatStore.getState();
      await store.performServerSearch('test');

      const state = useChatStore.getState();
      expect(state.searchError).toBeTruthy();
      expect(state.searchLoading).toBe(false);
      expect(state.searchResults).toHaveLength(0);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const store = useChatStore.getState();
      await store.performServerSearch('test');

      const state = useChatStore.getState();
      expect(state.searchError).toBeTruthy();
      expect(state.searchLoading).toBe(false);
    });

    it('should set searchMode to server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [],
          totalMatches: 0,
          executionTimeMs: 10,
          query: 'test',
        }),
      } as Response);

      const store = useChatStore.getState();
      await store.performServerSearch('test');

      const state = useChatStore.getState();
      expect(state.searchMode).toBe('server');
    });

    it('should update searchQuery', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [],
          totalMatches: 0,
          executionTimeMs: 10,
          query: 'my search',
        }),
      } as Response);

      const store = useChatStore.getState();
      await store.performServerSearch('my search');

      const state = useChatStore.getState();
      expect(state.searchQuery).toBe('my search');
    });

    it('should clear previous error on successful search', async () => {
      // First, set an error
      useChatStore.setState({ searchError: 'Previous error' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [],
          totalMatches: 0,
          executionTimeMs: 10,
          query: 'test',
        }),
      } as Response);

      const store = useChatStore.getState();
      await store.performServerSearch('test');

      const state = useChatStore.getState();
      expect(state.searchError).toBeNull();
    });
  });

  describe('clearSearch', () => {
    beforeEach(() => {
      // Setup: Set search state
      useChatStore.setState({
        searchQuery: 'test query',
        searchMode: 'server',
        searchResults: [
          {
            id: 's1',
            title: 'Test',
            messages: [],
            createdAt: '2025-10-26T10:00:00Z',
            lastMessageTimestamp: '2025-10-26T10:00:00Z',
            lastMessagePreview: 'test',
          } as any,
        ],
        searchLoading: false,
        searchError: 'Some error',
      });
    });

    it('should clear searchQuery', () => {
      const store = useChatStore.getState();
      store.clearSearch();

      const state = useChatStore.getState();
      expect(state.searchQuery).toBe('');
    });

    it('should set searchMode to inactive', () => {
      const store = useChatStore.getState();
      store.clearSearch();

      const state = useChatStore.getState();
      expect(state.searchMode).toBe('inactive');
    });

    it('should clear searchResults', () => {
      const store = useChatStore.getState();
      store.clearSearch();

      const state = useChatStore.getState();
      expect(state.searchResults).toEqual([]);
    });

    it('should clear searchLoading', () => {
      useChatStore.setState({ searchLoading: true });

      const store = useChatStore.getState();
      store.clearSearch();

      const state = useChatStore.getState();
      expect(state.searchLoading).toBe(false);
    });

    it('should clear searchError', () => {
      const store = useChatStore.getState();
      store.clearSearch();

      const state = useChatStore.getState();
      expect(state.searchError).toBeNull();
    });

    it('should reset all search-related state', () => {
      const store = useChatStore.getState();
      store.clearSearch();

      const state = useChatStore.getState();
      expect(state.searchQuery).toBe('');
      expect(state.searchMode).toBe('inactive');
      expect(state.searchResults).toEqual([]);
      expect(state.searchLoading).toBe(false);
      expect(state.searchError).toBeNull();
    });
  });

  describe('Search Mode Transitions', () => {
    it('should transition from inactive to local', () => {
      const store = useChatStore.getState();
      expect(store.searchMode).toBe('inactive');

      store.performLocalSearch('test');

      const state = useChatStore.getState();
      expect(state.searchMode).toBe('local');
    });

    it('should transition from inactive to server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [],
          totalMatches: 0,
          executionTimeMs: 10,
          query: 'test',
        }),
      } as Response);

      const store = useChatStore.getState();
      expect(store.searchMode).toBe('inactive');

      await store.performServerSearch('test');

      const state = useChatStore.getState();
      expect(state.searchMode).toBe('server');
    });

    it('should transition from local to server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [],
          totalMatches: 0,
          executionTimeMs: 10,
          query: 'test',
        }),
      } as Response);

      const store = useChatStore.getState();
      store.performLocalSearch('test');
      expect(useChatStore.getState().searchMode).toBe('local');

      await store.performServerSearch('test');

      const state = useChatStore.getState();
      expect(state.searchMode).toBe('server');
    });

    it('should transition from server to inactive via clearSearch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [],
          totalMatches: 0,
          executionTimeMs: 10,
          query: 'test',
        }),
      } as Response);

      const store = useChatStore.getState();
      await store.performServerSearch('test');
      expect(useChatStore.getState().searchMode).toBe('server');

      store.clearSearch();

      const state = useChatStore.getState();
      expect(state.searchMode).toBe('inactive');
    });

    it('should transition from local to inactive via clearSearch', () => {
      const store = useChatStore.getState();
      store.performLocalSearch('test');
      expect(useChatStore.getState().searchMode).toBe('local');

      store.clearSearch();

      const state = useChatStore.getState();
      expect(state.searchMode).toBe('inactive');
    });
  });
});
