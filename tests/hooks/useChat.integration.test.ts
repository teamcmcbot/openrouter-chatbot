import { renderHook, act } from '@testing-library/react';
import { useChat } from '../../hooks/useChat';

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

// Mock fetch for API calls
global.fetch = jest.fn();

describe('useChat integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'Mock response', id: 'completion-123' }),
    });
  });

  it('should integrate with chat history correctly', () => {
    const { result } = renderHook(() => useChat());

    // Initially no messages but should have auto-created "New Chat" conversation
    expect(result.current.messages).toEqual([]);
    expect(result.current.activeConversationId).not.toBeNull();

    // Create another new conversation
    act(() => {
      result.current.createNewConversation();
    });

    // Should still have active conversation
    expect(result.current.activeConversationId).not.toBeNull();
  });

  it('should create conversation when sending first message', async () => {
    const { result } = renderHook(() => useChat());

    // Should have auto-created conversation initially
    expect(result.current.activeConversationId).not.toBeNull();

    // Send a message
    await act(async () => {
      await result.current.sendMessage('Hello world');
    });

    // Wait for state updates
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
    });

    // Messages should be present (this is the key issue reported by user)
    expect(result.current.messages.length).toBeGreaterThan(0);
    
    // Check that user message is there
    const userMessage = result.current.messages.find(m => m.role === 'user');
    expect(userMessage).toBeTruthy();
    expect(userMessage?.content).toBe('Hello world');

    // Assistant message should also be there
    const assistantMessage = result.current.messages.find(m => m.role === 'assistant');
    expect(assistantMessage).toBeTruthy();
    expect(assistantMessage?.content).toBe('Mock response');
  });
});
