// tests/stores/chatStore-autoSync.test.ts

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { useChatStore } from '../../stores/useChatStore';
import { useAuthStore } from '../../stores/useAuthStore';

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// Mock auth store
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: {
    getState: jest.fn(),
  },
}));

const mockAuthStore = useAuthStore as jest.Mocked<typeof useAuthStore>;

describe('Chat Store - Auto Sync Functionality', () => {
  beforeEach(() => {
    // Clear all stores before each test
    useChatStore.getState().conversations.forEach(conv => {
      useChatStore.getState().deleteConversation(conv.id);
    });
    
    // Mock authenticated user
    mockAuthStore.getState.mockReturnValue({
      user: { id: 'test-user-123' },
      isAuthenticated: true,
    } as any);

    // Mock successful fetch response
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        results: { synced: 1, errors: 0 },
        syncTime: new Date().toISOString(),
      }),
    } as Response);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Auto-sync after successful message exchange', () => {
    it('should trigger sync after assistant response for authenticated user', async () => {
      // Setup: Create a conversation with user ID
      const store = useChatStore.getState();
      const conversationId = store.createConversation('Test Chat');
      
      // Manually set userId to simulate authenticated user conversation
      const updatedConversations = store.conversations.map(conv => 
        conv.id === conversationId 
          ? { ...conv, userId: 'test-user-123' }
          : conv
      );
      useChatStore.setState({ conversations: updatedConversations });

      // Mock the chat API response first, then sync response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            data: {
              response: 'Test assistant response',
              elapsed_time: 1000,
              usage: { total_tokens: 50 },
              model: 'test-model',
              id: 'completion-123',
            },
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            results: { synced: 1, errors: 0 },
            syncTime: new Date().toISOString(),
          }),
        } as Response);

      // Act: Send a message (this should trigger auto-sync after response)
      await store.sendMessage('Hello test message');

      // Wait for async operations (auto-sync has 100ms timeout)
      await new Promise(resolve => setTimeout(resolve, 200));

      // Assert: Verify sync was called
      expect(mockFetch).toHaveBeenCalledTimes(2);
      
      // First call: chat API
      expect(mockFetch).toHaveBeenNthCalledWith(1, '/api/chat', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }));

      // Second call: sync API (auto-sync)
      expect(mockFetch).toHaveBeenNthCalledWith(2, '/api/chat/sync', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('test-user-123'),
      }));
    });

    it('should NOT trigger sync for anonymous user conversations', async () => {
      // Setup: Create anonymous conversation (no userId)
      const store = useChatStore.getState();
      store.createConversation('Anonymous Chat'); // Keep conversation anonymous (no userId)

      // Mock the chat API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            response: 'Test assistant response',
            elapsed_time: 1000,
            usage: { total_tokens: 50 },
            model: 'test-model',
            id: 'completion-123',
          },
        }),
      } as Response);

      // Act: Send a message in anonymous conversation
      await store.sendMessage('Hello anonymous message');

      // Wait for potential async operations
      await new Promise(resolve => setTimeout(resolve, 200));

      // Assert: Only chat API should be called, not sync API
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('/api/chat', expect.any(Object));
    });

    it('should NOT trigger sync when user is not authenticated', async () => {
      // Setup: Mock unauthenticated state
      mockAuthStore.getState.mockReturnValue({
        user: null,
        isAuthenticated: false,
      } as any);

      const store = useChatStore.getState();
      store.createConversation('Test Chat');

      // Mock the chat API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: {
            response: 'Test assistant response',
            elapsed_time: 1000,
            usage: { total_tokens: 50 },
            model: 'test-model',
            id: 'completion-123',
          },
        }),
      } as Response);

      // Act: Send a message
      await store.sendMessage('Hello test message');

      // Wait for potential async operations
      await new Promise(resolve => setTimeout(resolve, 200));

      // Assert: Only chat API should be called, not sync API
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('/api/chat', expect.any(Object));
    });
  });

  describe('Auto-sync after conversation title update', () => {
    it('should trigger sync after title update for authenticated user conversation', async () => {
      // Setup: Create conversation with user ID
      const store = useChatStore.getState();
      const conversationId = store.createConversation('Old Title');
      
      // Manually set userId to simulate authenticated user conversation
      const updatedConversations = store.conversations.map(conv => 
        conv.id === conversationId 
          ? { ...conv, userId: 'test-user-123' }
          : conv
      );
      useChatStore.setState({ conversations: updatedConversations });

      // Act: Update conversation title
      store.updateConversationTitle(conversationId, 'New Title');

      // Wait for async operations (auto-sync has 100ms timeout)
      await new Promise(resolve => setTimeout(resolve, 200));

      // Assert: Verify sync was called
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('/api/chat/sync', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('test-user-123'),
      }));

      // Verify the title was actually updated
      const conversation = store.getConversationById(conversationId);
      expect(conversation?.title).toBe('New Title');
    });

    it('should NOT trigger sync for anonymous conversation title update', async () => {
      // Setup: Create anonymous conversation
      const store = useChatStore.getState();
      const conversationId = store.createConversation('Anonymous Title');

      // Act: Update conversation title
      store.updateConversationTitle(conversationId, 'Updated Anonymous Title');

      // Wait for potential async operations
      await new Promise(resolve => setTimeout(resolve, 200));

      // Assert: No sync should be triggered
      expect(mockFetch).not.toHaveBeenCalled();

      // Verify the title was still updated locally
      const conversation = store.getConversationById(conversationId);
      expect(conversation?.title).toBe('Updated Anonymous Title');
    });

    it('should handle sync failure silently', async () => {
      // Setup: Create conversation with user ID
      const store = useChatStore.getState();
      const conversationId = store.createConversation('Test Title');
      
      const updatedConversations = store.conversations.map(conv => 
        conv.id === conversationId 
          ? { ...conv, userId: 'test-user-123' }
          : conv
      );
      useChatStore.setState({ conversations: updatedConversations });

      // Mock sync failure
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Act: Update conversation title
      store.updateConversationTitle(conversationId, 'New Title');

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 200));

      // Assert: Should not throw error, failure should be silent
      expect(mockFetch).toHaveBeenCalledTimes(1);
      
      // Title should still be updated locally
      const conversation = store.getConversationById(conversationId);
      expect(conversation?.title).toBe('New Title');
    });
  });

  describe('Auto-sync trigger conditions', () => {
    it('should only sync conversations belonging to current user', async () => {
      // Setup: Create multiple conversations with different users
      const store = useChatStore.getState();
      const conv1 = store.createConversation('User 1 Chat');
      const conv2 = store.createConversation('User 2 Chat');
      
      const updatedConversations = store.conversations.map(conv => {
        if (conv.id === conv1) return { ...conv, userId: 'test-user-123' };
        if (conv.id === conv2) return { ...conv, userId: 'different-user' };
        return conv;
      });
      useChatStore.setState({ conversations: updatedConversations });

      // Act: Update title for different user's conversation
      store.updateConversationTitle(conv2, 'Updated Title');

      // Wait for potential async operations
      await new Promise(resolve => setTimeout(resolve, 200));

      // Assert: No sync should be triggered for different user's conversation
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
