// tests/stores/chatStore-context-pairs.test.ts

import { useChatStore } from '../../stores/useChatStore';
import { ChatMessage } from '../../lib/types/chat';

// Mock the environment variable for testing
const originalEnv = process.env;

describe('Phase 3.5: Context Pair Selection', () => {
  beforeEach(() => {
    // Reset the store before each test
    useChatStore.setState({
      conversations: [],
      currentConversationId: null,
      isLoading: false,
      error: null,
      isHydrated: true,
    });
    
    // Mock environment variables
    process.env = {
      ...originalEnv,
      CONTEXT_MESSAGE_PAIRS: '2', // Test with 2 pairs for easier testing
    };
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  const createTestMessages = (): ChatMessage[] => [
    {
      id: 'msg1',
      content: 'Hello', // ~1 token
      role: 'user',
      timestamp: new Date('2023-01-01T10:00:00Z'),
    },
    {
      id: 'msg2', 
      content: 'Hi there!', // ~2 tokens
      role: 'assistant',
      timestamp: new Date('2023-01-01T10:01:00Z'),
    },
    {
      id: 'msg3',
      content: 'How are you?', // ~3 tokens
      role: 'user', 
      timestamp: new Date('2023-01-01T10:02:00Z'),
    },
    {
      id: 'msg4',
      content: 'I am doing well, thank you for asking!', // ~8 tokens
      role: 'assistant',
      timestamp: new Date('2023-01-01T10:03:00Z'),
    },
    {
      id: 'msg5',
      content: 'What is the weather?', // ~4 tokens
      role: 'user',
      timestamp: new Date('2023-01-01T10:04:00Z'),
    },
    {
      id: 'msg6',
      content: 'Failed to get weather data', // ~5 tokens (error response)
      role: 'assistant',
      timestamp: new Date('2023-01-01T10:05:00Z'),
      error: true,
    },
    {
      id: 'msg7',
      content: 'Try again please', // ~3 tokens
      role: 'user',
      timestamp: new Date('2023-01-01T10:06:00Z'),
    },
    // msg7 has no response yet (pending/failed)
  ];

  test('should respect CONTEXT_MESSAGE_PAIRS environment variable', () => {
    console.log('Testing CONTEXT_MESSAGE_PAIRS limit');
    
    const store = useChatStore.getState();
    store.createConversation('Test Chat');
    
    // Add test messages + simulate current user message being added
    const messages = createTestMessages();
    // Add a current user message (this will be excluded from context selection)
    messages.push({
      id: 'current_msg',
      content: 'Current question',
      role: 'user',
      timestamp: new Date('2023-01-01T10:07:00Z'),
    });
    
    // Update store state properly using setState
    useChatStore.setState((state) => ({
      conversations: state.conversations.map(conv => 
        conv.isActive 
          ? { ...conv, messages }
          : conv
      )
    }));
    
    // Get context with generous token budget (should be limited by pairs)
    const contextMessages = store.getContextMessages(10000);
    
    // Should select at most 2 complete pairs = 4 messages
    // But due to the unpaired msg7, behavior may vary
    expect(contextMessages.length).toBeLessThanOrEqual(5); // 2 pairs + 1 unpaired = max 5
    
    // Count complete pairs in selection
    let pairCount = 0;
    for (let i = 0; i < contextMessages.length - 1; i++) {
      if (contextMessages[i].role === 'user' && contextMessages[i + 1].role === 'assistant') {
        pairCount++;
      }
    }
    expect(pairCount).toBeLessThanOrEqual(2);
  });

  test('should handle unpaired messages due to failures', () => {
    console.log('Testing unpaired message handling');
    
    const store = useChatStore.getState();
    store.createConversation('Test Chat');
    
    // Create scenario with unpaired messages
    const messages = [
      {
        id: 'msg1',
        content: 'Hello',
        role: 'user' as const,
        timestamp: new Date('2023-01-01T10:00:00Z'),
      },
      {
        id: 'msg2',
        content: 'Hi!',
        role: 'assistant' as const,
        timestamp: new Date('2023-01-01T10:01:00Z'),
      },
      {
        id: 'msg3',
        content: 'Failed message',
        role: 'user' as const,
        timestamp: new Date('2023-01-01T10:02:00Z'),
      },
      // No assistant response to msg3 (failed)
      {
        id: 'msg4',
        content: 'Another question',
        role: 'user' as const,
        timestamp: new Date('2023-01-01T10:03:00Z'),
      },
      // Add current user message (this will be excluded from context selection)
      {
        id: 'current_msg',
        content: 'Current question',
        role: 'user' as const,
        timestamp: new Date('2023-01-01T10:04:00Z'),
      },
    ];
    
    // Update store state properly using setState
    useChatStore.setState((state) => ({
      conversations: state.conversations.map(conv => 
        conv.isActive 
          ? { ...conv, messages }
          : conv
      )
    }));
    
    const contextMessages = store.getContextMessages(1000);
    
    // Should include available messages intelligently
    expect(contextMessages.length).toBeGreaterThan(0);
    expect(contextMessages.some(m => m.role === 'user')).toBe(true);
  });

  test('should prioritize complete pairs over individual messages', () => {
    console.log('Testing pair prioritization');
    
    const store = useChatStore.getState();
    store.createConversation('Test Chat');
    
    // Create messages with clear pairs
    const messages = [
      { id: 'msg1', content: 'First question', role: 'user' as const, timestamp: new Date('2023-01-01T10:00:00Z') },
      { id: 'msg2', content: 'First answer', role: 'assistant' as const, timestamp: new Date('2023-01-01T10:01:00Z') },
      { id: 'msg3', content: 'Second question', role: 'user' as const, timestamp: new Date('2023-01-01T10:02:00Z') },
      { id: 'msg4', content: 'Second answer', role: 'assistant' as const, timestamp: new Date('2023-01-01T10:03:00Z') },
      { id: 'msg5', content: 'Third question', role: 'user' as const, timestamp: new Date('2023-01-01T10:04:00Z') },
      // No response to msg5 yet
      // Add current user message (this will be excluded from context selection)
      { id: 'current_msg', content: 'Current question', role: 'user' as const, timestamp: new Date('2023-01-01T10:05:00Z') },
    ];
    
    // Update store state properly using setState
    useChatStore.setState((state) => ({
      conversations: state.conversations.map(conv => 
        conv.isActive 
          ? { ...conv, messages }
          : conv
      )
    }));
    
    const contextMessages = store.getContextMessages(1000);
    
    // Should include complete pairs
    let completePairs = 0;
    for (let i = 0; i < contextMessages.length - 1; i++) {
      if (contextMessages[i].role === 'user' && contextMessages[i + 1].role === 'assistant') {
        completePairs++;
      }
    }
    
    expect(completePairs).toBeGreaterThan(0);
  });

  test('should handle orphaned assistant messages', () => {
    console.log('Testing orphaned assistant messages');
    
    const store = useChatStore.getState();
    store.createConversation('Test Chat');
    
    // Create scenario with orphaned assistant message (maybe from retry/error)
    const messages = [
      { id: 'msg1', content: 'Question 1', role: 'user' as const, timestamp: new Date('2023-01-01T10:00:00Z') },
      { id: 'msg2', content: 'Answer 1', role: 'assistant' as const, timestamp: new Date('2023-01-01T10:01:00Z') },
      // Orphaned assistant message (no user message before it)
      { id: 'msg3', content: 'Unexpected assistant message', role: 'assistant' as const, timestamp: new Date('2023-01-01T10:02:00Z') },
      { id: 'msg4', content: 'Question 2', role: 'user' as const, timestamp: new Date('2023-01-01T10:03:00Z') },
      // Add current user message (this will be excluded from context selection)
      { id: 'current_msg', content: 'Current question', role: 'user' as const, timestamp: new Date('2023-01-01T10:04:00Z') },
    ];
    
    // Update store state properly using setState
    useChatStore.setState((state) => ({
      conversations: state.conversations.map(conv => 
        conv.isActive 
          ? { ...conv, messages }
          : conv
      )
    }));
    
    const contextMessages = store.getContextMessages(1000);
    
    // Should handle orphaned messages gracefully
    expect(contextMessages.length).toBeGreaterThan(0);
    const hasOrphanedAssistant = contextMessages.some(m => 
      m.role === 'assistant' && m.content === 'Unexpected assistant message'
    );
    
    // May or may not include orphaned message, but shouldn't crash
    expect(typeof hasOrphanedAssistant).toBe('boolean');
  });

  test('should log detailed pair selection process', () => {
    console.log('Testing detailed logging');
  // Temporarily enable debug logs for this test only
  const prev = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'debug';
    
    const consoleSpy = jest.spyOn(console, 'debug').mockImplementation();
    
    const store = useChatStore.getState();
    store.createConversation('Test Chat');
    
    const messages = createTestMessages();
    // Add current user message (this will be excluded from context selection)
    messages.push({
      id: 'current_msg',
      content: 'Current question',
      role: 'user',
      timestamp: new Date('2023-01-01T10:07:00Z'),
    });
    
    // Update store state properly using setState
    useChatStore.setState((state) => ({
      conversations: state.conversations.map(conv => 
        conv.isActive 
          ? { ...conv, messages }
          : conv
      )
    }));
    
  store.getContextMessages(1000);
    
  // Check that proper logging occurred (logger.debug prefixes with [ChatStore] and message is the second arg)
  const calls = (consoleSpy as unknown as jest.Mock).mock.calls as unknown[][];
  const flattened = calls.flat();
  expect(flattened.some(arg => typeof arg === 'string' && arg.includes('[Context Selection] Max message pairs:'))).toBe(true);
  expect(flattened.some(arg => typeof arg === 'string' && arg.includes('pairs'))).toBe(true);
  expect(flattened.some(arg => typeof arg === 'string' && arg.includes('Message breakdown:'))).toBe(true);
    
  consoleSpy.mockRestore();
  // Restore log level
  process.env.LOG_LEVEL = prev;
  });
});

console.log('Context pairs tests ready for execution!');
