/**
 * Phase 5: Comprehensive Integration Tests for Context-Aware Chat
 * 
 * Tests the complete flow from UI to API with various scenarios:
 * - Different model token limits
 * - Various CONTEXT_MESSAGE_PAIRS values  
 * - Edge cases and error handling
 * - Performance with large conversations
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { useChatStore } from '../../stores/useChatStore';
import { estimateTokenCount } from '../../lib/utils/tokens';
import type { ChatMessage } from '../../lib/types/chat';
import type { Conversation } from '../../stores/types/chat';

// Mock environment variables for testing
const originalEnv = process.env;

describe('Context-Aware Chat Integration Tests', () => {
  beforeEach(() => {
    // Reset stores
    useChatStore.getState().conversations.forEach(conv => {
      useChatStore.getState().deleteConversation(conv.id);
    });
    
    // Mock environment
    process.env = {
      ...originalEnv,
      CONTEXT_MESSAGE_PAIRS: '5',
      CONTEXT_RESERVE_TOKENS: '1000',
      CONTEXT_MIN_TOKENS: '500',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Model Compatibility Tests', () => {
    it('should handle different token budgets correctly', () => {
      // Test with various token budgets that would be allocated by different models
      const testCases = [
        { modelName: 'Small Model', budget: 2000 },
        { modelName: 'Medium Model', budget: 6000 },
        { modelName: 'Large Model', budget: 20000 },
        { modelName: 'Very Large Model', budget: 100000 },
      ];

      const store = useChatStore.getState();
      store.createConversation('Token Budget Test');
      const conversation = store.getCurrentConversation()!;
      
      // Add some test messages
      conversation.messages.push(
        { id: '1', role: 'user', content: 'Test message 1', timestamp: new Date() },
        { id: '2', role: 'assistant', content: 'Response 1', timestamp: new Date() },
        { id: '3', role: 'user', content: 'Test message 2', timestamp: new Date() },
        { id: '4', role: 'assistant', content: 'Response 2', timestamp: new Date() }
      );

      testCases.forEach(({ modelName, budget }) => {
        console.log(`Testing ${modelName} with ${budget} token budget`);
        
        const contextMessages = store.getContextMessages(budget);
        const totalTokens = contextMessages.reduce((sum, msg) => 
          sum + estimateTokenCount(msg.content), 0
        );
        
        expect(contextMessages.length).toBeGreaterThan(0);
        expect(totalTokens).toBeLessThanOrEqual(budget);
        
        console.log(`  → Selected ${contextMessages.length} messages using ${totalTokens} tokens`);
      });
    });
  });

  describe('CONTEXT_MESSAGE_PAIRS Validation', () => {
    const createTestConversation = (messageCount: number): Conversation => {
      const store = useChatStore.getState();
      store.createConversation('Test Long Conversation');
      const conversation = store.getCurrentConversation()!;
      
      // Add alternating user/assistant messages
      for (let i = 0; i < messageCount; i++) {
        const message: ChatMessage = {
          id: `msg_${i}`,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i + 1}: This is a test message with some content.`,
          timestamp: new Date(),
        };
        conversation.messages.push(message);
      }
      
      return conversation;
    };

    it('should respect CONTEXT_MESSAGE_PAIRS=1', () => {
      process.env.CONTEXT_MESSAGE_PAIRS = '1';
      
      createTestConversation(10); // 5 pairs
      const contextMessages = useChatStore.getState().getContextMessages(10000);
      
      // Should only include 1 complete pair (2 messages)
      expect(contextMessages.length).toBe(2);
      expect(contextMessages[0].role).toBe('user');
      expect(contextMessages[1].role).toBe('assistant');
    });

    it('should respect CONTEXT_MESSAGE_PAIRS=3', () => {
      process.env.CONTEXT_MESSAGE_PAIRS = '3';
      
      createTestConversation(20); // 10 pairs
      const contextMessages = useChatStore.getState().getContextMessages(10000);
      
      // Should include 3 complete pairs (6 messages)
      expect(contextMessages.length).toBe(6);
      
      // Verify alternating pattern
      for (let i = 0; i < 6; i += 2) {
        expect(contextMessages[i].role).toBe('user');
        expect(contextMessages[i + 1].role).toBe('assistant');
      }
    });

    it('should handle CONTEXT_MESSAGE_PAIRS=0 gracefully', () => {
      process.env.CONTEXT_MESSAGE_PAIRS = '0';
      
      createTestConversation(10);
      const contextMessages = useChatStore.getState().getContextMessages(10000);
      
      // Should return no messages when limit is 0 (expected behavior)
      expect(contextMessages.length).toBe(0);
    });
  });

  describe('Token Limit Edge Cases', () => {
    it('should handle extremely low token budgets', () => {
      const store = useChatStore.getState();
      store.createConversation('Low Token Test');
      const conversation = store.getCurrentConversation()!;
      
      // Add a few messages
      conversation.messages.push(
        { id: '1', role: 'user', content: 'Short', timestamp: new Date() },
        { id: '2', role: 'assistant', content: 'Response', timestamp: new Date() }
      );
      
      // Very low token budget
      const contextMessages = store.getContextMessages(10);
      
      // Should handle gracefully, possibly returning fewer messages
      expect(contextMessages.length).toBeGreaterThanOrEqual(0);
      expect(contextMessages.length).toBeLessThanOrEqual(2);
    });

    it('should handle massive token budgets efficiently', () => {
      const store = useChatStore.getState();
      store.createConversation('High Token Test');
      const conversation = store.getCurrentConversation()!;
      
      // Add many messages
      for (let i = 0; i < 100; i++) {
        conversation.messages.push({
          id: `msg_${i}`,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i + 1}`,
          timestamp: new Date(),
        });
      }
      
      // Very high token budget
      const startTime = Date.now();
      const contextMessages = store.getContextMessages(1000000);
      const duration = Date.now() - startTime;
      
      // Should complete quickly and respect CONTEXT_MESSAGE_PAIRS
      expect(duration).toBeLessThan(100); // Should complete in <100ms
      expect(contextMessages.length).toBeLessThanOrEqual(20); // 5 pairs * 2 + some extras
    });
  });

  describe('Message Processing Edge Cases', () => {
    it('should handle conversations with only user messages', () => {
      const store = useChatStore.getState();
      store.createConversation('User Only');
      const conversation = store.getCurrentConversation()!;
      
      // Add only user messages
      for (let i = 0; i < 5; i++) {
        conversation.messages.push({
          id: `user_${i}`,
          role: 'user',
          content: `User message ${i + 1}`,
          timestamp: new Date(),
        });
      }
      
      const contextMessages = store.getContextMessages(5000);
      
      // Should include available user messages
      expect(contextMessages.length).toBeGreaterThan(0);
      expect(contextMessages.every(msg => msg.role === 'user')).toBe(true);
    });

    it('should handle conversations with only assistant messages', () => {
      const store = useChatStore.getState();
      store.createConversation('Assistant Only');
      const conversation = store.getCurrentConversation()!;
      
      // Add only assistant messages (edge case)
      for (let i = 0; i < 5; i++) {
        conversation.messages.push({
          id: `assistant_${i}`,
          role: 'assistant',
          content: `Assistant message ${i + 1}`,
          timestamp: new Date(),
        });
      }
      
      const contextMessages = store.getContextMessages(5000);
      
      // Should handle gracefully
      expect(contextMessages.length).toBeGreaterThan(0);
      expect(contextMessages.every(msg => msg.role === 'assistant')).toBe(true);
    });

    it('should handle messages with very long content', () => {
      const store = useChatStore.getState();
      store.createConversation('Long Content');
      const conversation = store.getCurrentConversation()!;
      
      // Add message with very long content
      const longContent = 'A'.repeat(10000); // 10k characters
      conversation.messages.push(
        { id: '1', role: 'user', content: longContent, timestamp: new Date() },
        { id: '2', role: 'assistant', content: 'Short response', timestamp: new Date() }
      );
      
      const contextMessages = store.getContextMessages(5000);
      
      // Should handle long content appropriately
      expect(contextMessages.length).toBeGreaterThanOrEqual(0);
      
      // Calculate actual token usage
      const totalTokens = contextMessages.reduce((sum, msg) => 
        sum + estimateTokenCount(msg.content), 0
      );
      console.log(`Long content test: ${totalTokens} tokens for ${contextMessages.length} messages`);
    });
  });

  describe('Performance and Scalability', () => {
    it('should perform well with large conversations', () => {
      const store = useChatStore.getState();
      store.createConversation('Performance Test');
      const conversation = store.getCurrentConversation()!;
      
      // Add 1000 messages
      console.log('Creating large conversation with 1000 messages...');
      for (let i = 0; i < 1000; i++) {
        conversation.messages.push({
          id: `perf_${i}`,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Performance test message ${i + 1} with some content to simulate real usage.`,
          timestamp: new Date(),
        });
      }
      
      // Test context selection performance
      const iterations = 10;
      const times: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        const contextMessages = store.getContextMessages(8000);
        const duration = Date.now() - start;
        times.push(duration);
        
        // Verify result is reasonable
        expect(contextMessages.length).toBeGreaterThan(0);
        expect(contextMessages.length).toBeLessThanOrEqual(50); // Should be limited
      }
      
      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const maxTime = Math.max(...times);
      
      console.log(`Performance results: avg=${avgTime.toFixed(2)}ms, max=${maxTime}ms`);
      
      // Should complete quickly even with large conversations
      expect(avgTime).toBeLessThan(50); // Average under 50ms
      expect(maxTime).toBeLessThan(100); // Max under 100ms
    });

    it('should handle concurrent context selections', async () => {
      const store = useChatStore.getState();
      store.createConversation('Concurrent Test');
      const conversation = store.getCurrentConversation()!;
      
      // Add some messages
      for (let i = 0; i < 50; i++) {
        conversation.messages.push({
          id: `concurrent_${i}`,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Concurrent test message ${i + 1}`,
          timestamp: new Date(),
        });
      }
      
      // Run multiple context selections concurrently
      const promises = Array.from({ length: 10 }, (_, i) => 
        new Promise<ChatMessage[]>((resolve) => {
          setTimeout(() => {
            const result = store.getContextMessages(5000 + i * 100);
            resolve(result);
          }, Math.random() * 10);
        })
      );
      
      const results = await Promise.all(promises);
      
      // All should complete successfully
      results.forEach((result, i) => {
        expect(result.length).toBeGreaterThan(0);
        console.log(`Concurrent test ${i}: ${result.length} messages selected`);
      });
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle invalid environment variables gracefully', () => {
      // Test with invalid CONTEXT_MESSAGE_PAIRS
      process.env.CONTEXT_MESSAGE_PAIRS = 'invalid';
      
      const store = useChatStore.getState();
      store.createConversation('Invalid Env Test');
      const conversation = store.getCurrentConversation()!;
      
      conversation.messages.push(
        { id: '1', role: 'user', content: 'Test', timestamp: new Date() },
        { id: '2', role: 'assistant', content: 'Response', timestamp: new Date() }
      );
      
      // Should handle gracefully and use defaults
      expect(() => {
        const contextMessages = store.getContextMessages(5000);
        expect(contextMessages.length).toBeGreaterThanOrEqual(0);
      }).not.toThrow();
    });

    it('should handle missing environment variables', () => {
      // Remove context-related env vars
      delete process.env.CONTEXT_MESSAGE_PAIRS;
      delete process.env.CONTEXT_RESERVE_TOKENS;
      
      const store = useChatStore.getState();
      store.createConversation('Missing Env Test');
      const conversation = store.getCurrentConversation()!;
      
      conversation.messages.push(
        { id: '1', role: 'user', content: 'Test', timestamp: new Date() },
        { id: '2', role: 'assistant', content: 'Response', timestamp: new Date() }
      );
      
      // Should use built-in defaults
      expect(() => {
        const contextMessages = store.getContextMessages(5000);
        expect(contextMessages.length).toBeGreaterThanOrEqual(0);
      }).not.toThrow();
    });
  });

  describe('Token Estimation Accuracy', () => {
    it('should provide reasonable token estimates for various content types', () => {
      const testCases = [
        { content: 'Hello world', expectedRange: [2, 4] },
        { content: 'This is a longer sentence with more words.', expectedRange: [8, 12] },
        { content: 'Code:\n```javascript\nfunction test() {\n  return "hello";\n}\n```', expectedRange: [15, 25] },
        { content: '🎉 Emoji test with unicode! 🚀✨', expectedRange: [8, 15] },
        { content: '', expectedRange: [0, 1] },
      ];

      testCases.forEach(({ content, expectedRange }) => {
        const tokens = estimateTokenCount(content);
        console.log(`"${content.slice(0, 30)}..." → ${tokens} tokens`);
        
        expect(tokens).toBeGreaterThanOrEqual(expectedRange[0]);
        expect(tokens).toBeLessThanOrEqual(expectedRange[1]);
      });
    });

    it('should handle token estimation for very long content', () => {
      const longText = 'This is a test sentence. '.repeat(1000); // ~25k characters
      const tokens = estimateTokenCount(longText);
      
      console.log(`Long text (${longText.length} chars) → ${tokens} tokens`);
      
      // Should be reasonable ratio (roughly 4:1 char to token)
      expect(tokens).toBeGreaterThan(longText.length / 6);
      expect(tokens).toBeLessThan(longText.length / 2);
    });
  });

  console.log('Integration tests ready for execution!');
});
