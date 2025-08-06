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
      // Setup: Create multiple conversations
      const conv1Id = useChatStore.getState().createConversation('Chat 1');
      const conv2Id = useChatStore.getState().createConversation('Chat 2');
      const conv3Id = useChatStore.getState().createConversation('Chat 3');
      
      // Switch to the second conversation
      useChatStore.getState().switchConversation(conv2Id);
      expect(useChatStore.getState().currentConversationId).toBe(conv2Id);

      // Act: Delete the current conversation (conv2Id)
      await useChatStore.getState().deleteConversation(conv2Id);

      // Assert: Should switch to first available conversation (which should be conv1Id)
      const state = useChatStore.getState();
      const remainingConversations = state.conversations;
      expect(remainingConversations).toHaveLength(2);
      expect(remainingConversations.find(c => c.id === conv2Id)).toBeUndefined();
      
      // Should switch to the first remaining conversation
      expect(state.currentConversationId).toBe(remainingConversations[0].id);
      
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
