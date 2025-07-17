// tests/stores/chatStore-autoSync.test.ts

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// Import stores
import { useChatStore } from '../../stores/useChatStore';
import { useAuthStore } from '../../stores/useAuthStore';
import type { User } from '@supabase/supabase-js';

describe('Chat Store - Auto Sync Functionality', () => {
  let authStoreSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    // Clear all stores before each test
    useChatStore.getState().conversations.forEach(conv => {
      useChatStore.getState().deleteConversation(conv.id);
    });
    
    // Spy on the auth store's getState method
    authStoreSpy = jest.spyOn(useAuthStore, 'getState').mockReturnValue({
      user: { id: 'test-user-123' } as User,
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
      signInWithGoogle: jest.fn() as jest.MockedFunction<() => Promise<void>>,
      clearAllStores: jest.fn() as jest.MockedFunction<() => Promise<void>>,
      initialize: jest.fn() as jest.MockedFunction<() => Promise<void>>,
      signOut: jest.fn() as jest.MockedFunction<() => Promise<void>>,
    });

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
    // Restore the spy
    authStoreSpy.mockRestore();
  });

  // Test to verify the mock is working
  it('should have properly mocked auth store', () => {
    const authState = useAuthStore.getState();
    expect(authState.user?.id).toBe('test-user-123');
    expect(authState.isAuthenticated).toBe(true);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Auto-sync after successful message exchange', () => {
    it('should trigger sync after assistant response for authenticated user', async () => {
      // Setup: Create conversation with proper user context
      const store = useChatStore.getState();
      const conversationId = store.createConversation('Test Chat'); // This will now have userId automatically
      
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
      // Setup: Mock anonymous user BEFORE creating conversation
      authStoreSpy.mockReturnValue({
        user: null,
        session: null,
        isAuthenticated: false,
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
        signInWithGoogle: jest.fn() as jest.MockedFunction<() => Promise<void>>,
        clearAllStores: jest.fn() as jest.MockedFunction<() => Promise<void>>,
        initialize: jest.fn() as jest.MockedFunction<() => Promise<void>>,
        signOut: jest.fn() as jest.MockedFunction<() => Promise<void>>,
      });

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
      authStoreSpy.mockReturnValue({
        user: null,
        session: null,
        isAuthenticated: false,
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
        signInWithGoogle: jest.fn() as jest.MockedFunction<() => Promise<void>>,
        clearAllStores: jest.fn() as jest.MockedFunction<() => Promise<void>>,
        initialize: jest.fn() as jest.MockedFunction<() => Promise<void>>,
        signOut: jest.fn() as jest.MockedFunction<() => Promise<void>>,
      });

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
      // Debug: Verify the mock is working before creating conversation
      console.log('Mock before create:', useAuthStore.getState());
      
      // Setup: Create conversation with proper user context
      const store = useChatStore.getState();
      const conversationId = store.createConversation('Old Title');

      // Debug: Check what the conversation looks like after creation
      const conversation = store.getConversationById(conversationId);
      console.log('Created conversation:', conversation);
      console.log('Auth state after create:', useAuthStore.getState());

      // Act: Update conversation title
      store.updateConversationTitle(conversationId, 'New Title');

      // Debug: Check auth state during title update
      console.log('Auth state during update:', useAuthStore.getState());

      // Wait for async operations (auto-sync has 100ms timeout)
      await new Promise(resolve => setTimeout(resolve, 200));

      // Debug: Check what fetch calls were made
      console.log('Fetch call count:', mockFetch.mock.calls.length);
      console.log('Fetch calls:', mockFetch.mock.calls);

      // Assert: Verify sync was called
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('/api/chat/sync', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('test-user-123'),
      }));

      // Verify the title was actually updated
      const updatedConversation = store.getConversationById(conversationId);
      expect(updatedConversation?.title).toBe('New Title');
    });

    it('should NOT trigger sync for anonymous conversation title update', async () => {
      // Setup: Mock anonymous user BEFORE creating conversation
      authStoreSpy.mockReturnValue({
        user: null,
        session: null,
        isAuthenticated: false,
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
        signInWithGoogle: jest.fn() as jest.MockedFunction<() => Promise<void>>,
        clearAllStores: jest.fn() as jest.MockedFunction<() => Promise<void>>,
        initialize: jest.fn() as jest.MockedFunction<() => Promise<void>>,
        signOut: jest.fn() as jest.MockedFunction<() => Promise<void>>,
      });

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
      // Setup: Create conversation with proper user context
      const store = useChatStore.getState();
      const conversationId = store.createConversation('Test Title'); // This will now have userId automatically

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
      // Setup: Create conversation for current user first
      const store = useChatStore.getState();
      const conv1 = store.createConversation('User 1 Chat'); // Will have current user's ID
      
      // Now create conversation for different user by temporarily changing the mock
      authStoreSpy.mockReturnValue({
        user: { id: 'different-user' } as User,
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
        signInWithGoogle: jest.fn() as jest.MockedFunction<() => Promise<void>>,
        clearAllStores: jest.fn() as jest.MockedFunction<() => Promise<void>>,
        initialize: jest.fn() as jest.MockedFunction<() => Promise<void>>,
        signOut: jest.fn() as jest.MockedFunction<() => Promise<void>>,
      });
      const conv2 = store.createConversation('User 2 Chat'); // Will have different user's ID
      
      // Reset mock back to original user
      authStoreSpy.mockReturnValue({
        user: { id: 'test-user-123' } as User,
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
        signInWithGoogle: jest.fn() as jest.MockedFunction<() => Promise<void>>,
        clearAllStores: jest.fn() as jest.MockedFunction<() => Promise<void>>,
        initialize: jest.fn() as jest.MockedFunction<() => Promise<void>>,
        signOut: jest.fn() as jest.MockedFunction<() => Promise<void>>,
      });

      // Act: Update title for different user's conversation
      store.updateConversationTitle(conv2, 'Updated Title');

      // Wait for potential async operations
      await new Promise(resolve => setTimeout(resolve, 200));

      // Assert: No sync should be triggered for different user's conversation
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
