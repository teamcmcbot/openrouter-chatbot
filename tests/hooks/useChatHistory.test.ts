import { renderHook, act } from '@testing-library/react';
import { useChatHistory } from '../../hooks/useChatHistory';
import { ChatMessage } from '../../lib/types/chat';

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

describe('useChatHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  it('should initialize with empty state', () => {
    const { result } = renderHook(() => useChatHistory());

    expect(result.current.conversations).toEqual([]);
    expect(result.current.activeConversationId).toBeNull();
  });

  it('should create a new conversation', () => {
    const { result } = renderHook(() => useChatHistory());

    act(() => {
      result.current.createConversation('Test Chat');
    });

    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0].title).toBe('Test Chat');
    expect(result.current.conversations[0].messages).toEqual([]);
    expect(result.current.activeConversationId).toBe(result.current.conversations[0].id);
  });

  it('should add messages to a conversation', () => {
    const { result } = renderHook(() => useChatHistory());

    let conversationId: string;

    act(() => {
      const conversation = result.current.createConversation();
      conversationId = conversation.id;
    });

    const testMessage: ChatMessage = {
      id: 'msg-1',
      content: 'Hello world',
      role: 'user',
      timestamp: new Date(),
    };

    act(() => {
      result.current.addMessageToConversation(conversationId, testMessage);
    });

    expect(result.current.conversations[0].messages).toHaveLength(1);
    expect(result.current.conversations[0].messages[0]).toEqual(testMessage);
    expect(result.current.conversations[0].messageCount).toBe(1);
  });

  it('should auto-generate title from first user message', () => {
    const { result } = renderHook(() => useChatHistory());

    let conversationId: string;

    act(() => {
      const conversation = result.current.createConversation();
      conversationId = conversation.id;
    });

    const testMessage: ChatMessage = {
      id: 'msg-1',
      content: 'How do I implement a React component?',
      role: 'user',
      timestamp: new Date(),
    };

    act(() => {
      result.current.addMessageToConversation(conversationId, testMessage);
    });

    expect(result.current.conversations[0].title).toBe('How do I implement a React component?');
  });

  it('should clear all conversations', () => {
    const { result } = renderHook(() => useChatHistory());

    // Create conversations separately to avoid React state batching issues
    act(() => {
      result.current.createConversation('Chat 1');
    });

    act(() => {
      result.current.createConversation('Chat 2');
    });

    expect(result.current.conversations).toHaveLength(2);
    expect(result.current.conversations[0].title).toBe('Chat 2'); // newest first
    expect(result.current.conversations[1].title).toBe('Chat 1');

    act(() => {
      result.current.clearAllConversations();
    });

    expect(result.current.conversations).toHaveLength(0);
    expect(result.current.activeConversationId).toBeNull();
  });
});
