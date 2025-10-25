import { useChatStore } from '../../stores/useChatStore';

// Mock the auth store completely
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({
      user: null, // Default to unauthenticated
    })),
  },
}));

// Mock fetch globally
global.fetch = jest.fn();

describe('Chat Store - deleteConversation Sync Functionality', () => {
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    // Reset mocks
    mockFetch.mockClear();
    
    // Reset chat store
    useChatStore.setState({
      conversations: [],
      currentConversationId: null,
      error: null,
      isHydrated: true,
    });
  });

  describe('Local deletion for unauthenticated users', () => {
    it('should delete conversation locally without backend sync', async () => {
      // Setup: Create a conversation
      const conversationId = useChatStore.getState().createConversation('Test Chat');
      expect(useChatStore.getState().conversations).toHaveLength(1);

      // Act: Delete the conversation
      await useChatStore.getState().deleteConversation(conversationId);

      // Assert: Backend API was NOT called
      expect(mockFetch).not.toHaveBeenCalled();

      // Assert: Conversation was removed from local store
      const state = useChatStore.getState();
      expect(state.conversations).toHaveLength(0);
      expect(state.currentConversationId).toBeNull();
      expect(state.error).toBeNull();
    });

    it('should switch to next available conversation when deleting current conversation', async () => {
      // Setup: Create multiple conversations with messages to prevent aggressive cleanup
      // Note: Conversations are prepended (LIFO), so array order is [conv3, conv2, conv1]
      // IMPORTANT: Add messages IMMEDIATELY after each createConversation to prevent cleanup
      
      const store = useChatStore.getState();
      
      const conv1Id = store.createConversation('Chat 1');
      useChatStore.setState(state => ({
        conversations: state.conversations.map(c => 
          c.id === conv1Id ? { ...c, messages: [{ id: `msg-${c.id}`, role: 'user', content: 'test', timestamp: new Date() } as any] } : c
        )
      }));
      
      const conv2Id = store.createConversation('Chat 2');
      useChatStore.setState(state => ({
        conversations: state.conversations.map(c => 
          c.id === conv2Id ? { ...c, messages: [{ id: `msg-${c.id}`, role: 'user', content: 'test', timestamp: new Date() } as any] } : c
        )
      }));
      
      const conv3Id = store.createConversation('Chat 3');
      useChatStore.setState(state => ({
        conversations: state.conversations.map(c => 
          c.id === conv3Id ? { ...c, messages: [{ id: `msg-${c.id}`, role: 'user', content: 'test', timestamp: new Date() } as any] } : c
        )
      }));
      
      // Verify the order: [conv3, conv2, conv1]
      const conversationsBefore = useChatStore.getState().conversations;
      expect(conversationsBefore[0].id).toBe(conv3Id);
      expect(conversationsBefore[1].id).toBe(conv2Id);
      expect(conversationsBefore[2].id).toBe(conv1Id);
      
      // Switch to the middle conversation (conv2Id at index 1)
      useChatStore.getState().switchConversation(conv2Id);
      expect(useChatStore.getState().currentConversationId).toBe(conv2Id);

      // Act: Delete the current conversation (conv2Id at index 1)
      await useChatStore.getState().deleteConversation(conv2Id);

      // Assert: Should switch to the next conversation at the same index
      // After deletion, array becomes [conv3, conv1], so index 1 is now conv1Id
      const state = useChatStore.getState();
      const remainingConversations = state.conversations;
      expect(remainingConversations).toHaveLength(2);
      expect(remainingConversations.find(c => c.id === conv2Id)).toBeUndefined();
      
      // Should switch to conv1Id (which moved to index 1 after conv2 was removed)
      expect(state.currentConversationId).toBe(conv1Id);
      
      // Verify it's one of the expected remaining conversations
      expect([conv1Id, conv3Id]).toContain(state.currentConversationId);
    });

    it('should set currentConversationId to null when deleting the last conversation', async () => {
      // Setup: Create one conversation
      const conversationId = useChatStore.getState().createConversation('Only Chat');
      useChatStore.getState().switchConversation(conversationId);

      // Act: Delete the only conversation
      await useChatStore.getState().deleteConversation(conversationId);

      // Assert: Should set currentConversationId to null
      const state = useChatStore.getState();
      expect(state.currentConversationId).toBeNull();
      expect(state.conversations).toHaveLength(0);
    });
  });

  describe('Search mode deletion', () => {
    it('should remove conversation from both conversations and searchResults arrays', async () => {
      // Setup: Create conversations with messages to prevent aggressive cleanup
      const conv1Id = useChatStore.getState().createConversation('React Tutorial');
      useChatStore.setState(state => ({
        conversations: state.conversations.map(c => 
          c.id === conv1Id ? { ...c, messages: [{ id: 'msg1', role: 'user', content: 'test', timestamp: new Date() } as any] } : c
        )
      }));
      
      const conv2Id = useChatStore.getState().createConversation('Vue Guide');
      useChatStore.setState(state => ({
        conversations: state.conversations.map(c => 
          c.id === conv2Id ? { ...c, messages: [{ id: 'msg2', role: 'user', content: 'test', timestamp: new Date() } as any] } : c
        )
      }));
      
      const conv3Id = useChatStore.getState().createConversation('React Hooks');
      useChatStore.setState(state => ({
        conversations: state.conversations.map(c => 
          c.id === conv3Id ? { ...c, messages: [{ id: 'msg3', role: 'user', content: 'test', timestamp: new Date() } as any] } : c
        )
      }));
      
      // Manually set search state (simulating a search result)
      useChatStore.setState({
        searchMode: 'server',
        searchQuery: 'react',
        searchResults: [
          useChatStore.getState().conversations.find(c => c.id === conv1Id)!,
          useChatStore.getState().conversations.find(c => c.id === conv3Id)!,
        ],
      });
      
      // Switch to a search result
      useChatStore.getState().switchConversation(conv1Id);
      
      // Act: Delete the conversation
      await useChatStore.getState().deleteConversation(conv1Id);
      
      // Assert: Should be removed from both arrays
      const state = useChatStore.getState();
      expect(state.conversations.find(c => c.id === conv1Id)).toBeUndefined();
      expect(state.searchResults.find(c => c.id === conv1Id)).toBeUndefined();
      expect(state.searchResults).toHaveLength(1);
      expect(state.searchResults[0].id).toBe(conv3Id);
    });

    it('should navigate to next search result when deleting in search mode', async () => {
      // Setup: Create multiple conversations with matching messages
      // IMPORTANT: Add messages IMMEDIATELY after each createConversation to prevent cleanup
      const store = useChatStore.getState();
      
      const conv1Id = store.createConversation('Test Chat 1');
      useChatStore.setState(state => ({
        conversations: state.conversations.map(c => 
          c.id === conv1Id ? { ...c, messages: [{ id: `msg-${c.id}`, role: 'user', content: 'test', timestamp: new Date() } as any] } : c
        )
      }));
      
      const conv2Id = store.createConversation('Test Chat 2');
      useChatStore.setState(state => ({
        conversations: state.conversations.map(c => 
          c.id === conv2Id ? { ...c, messages: [{ id: `msg-${c.id}`, role: 'user', content: 'test', timestamp: new Date() } as any] } : c
        )
      }));
      
      const conv3Id = store.createConversation('Test Chat 3');
      useChatStore.setState(state => ({
        conversations: state.conversations.map(c => 
          c.id === conv3Id ? { ...c, messages: [{ id: `msg-${c.id}`, role: 'user', content: 'test', timestamp: new Date() } as any] } : c
        )
      }));
      
      // Set search state with these conversations as results
      useChatStore.setState({
        searchMode: 'server',
        searchQuery: 'test',
        searchResults: useChatStore.getState().conversations,
      });
      
      useChatStore.getState().switchConversation(conv3Id);
      
      // Act: Delete conv3 (current search result)
      await useChatStore.getState().deleteConversation(conv3Id);
      
      // Assert: Should navigate to next search result (conv2)
      const state = useChatStore.getState();
      expect(state.currentConversationId).toBe(conv2Id);
      expect(state.searchResults).toHaveLength(2);
      expect(state.searchResults.find(c => c.id === conv3Id)).toBeUndefined();
    });

    it('should clear search when deleting the last search result', async () => {
      // Setup: Create one conversation
      const conv1Id = useChatStore.getState().createConversation('Only Match');
      
      // Set search state with one result
      useChatStore.setState({
        searchMode: 'server',
        searchQuery: 'match',
        searchResults: [useChatStore.getState().conversations[0]],
      });
      
      useChatStore.getState().switchConversation(conv1Id);
      
      // Act: Delete the only search result
      await useChatStore.getState().deleteConversation(conv1Id);
      
      // Assert: Search should be cleared
      const state = useChatStore.getState();
      expect(state.searchMode).toBe('inactive');
      expect(state.searchQuery).toBe('');
      expect(state.searchResults).toHaveLength(0);
    });
  });

  describe('Integration with existing functionality', () => {
    it('should maintain async compatibility with existing code', async () => {
      // Test that the method can be called with await as expected
      const conversationId = useChatStore.getState().createConversation('Test Chat');
      
      // This should not throw or cause issues
      await expect(
        useChatStore.getState().deleteConversation(conversationId)
      ).resolves.toBeUndefined();
      
      expect(useChatStore.getState().conversations).toHaveLength(0);
    });
  });
});
