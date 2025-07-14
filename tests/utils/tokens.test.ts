/**
 * Unit tests for token estimation and management utilities
 * Testing Phase 1: Token Management Foundation
 */

import {
  estimateTokenCount,
  estimateMessagesTokens,
  calculateTokenStrategy,
  isWithinInputBudget,
  getMaxOutputTokens,
  TokenStrategy
} from '../../lib/utils/tokens';
import { ChatMessage } from '../../lib/types/chat';

// Mock console.log to capture verification logs
const mockConsoleLog = jest.fn();
console.log = mockConsoleLog;

// Mock environment variables
const originalEnv = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...originalEnv };
});

afterAll(() => {
  process.env = originalEnv;
});

describe('Token Estimation Utilities', () => {
  describe('estimateTokenCount', () => {
    it('should return 0 for empty or null text', () => {
      expect(estimateTokenCount('')).toBe(0);
      expect(estimateTokenCount(null!)).toBe(0);
      expect(estimateTokenCount(undefined!)).toBe(0);
    });

    it('should estimate tokens using ~4 characters per token', () => {
      // 12 characters = 3 tokens
      expect(estimateTokenCount('Hello world!')).toBe(3);
      
      // 20 characters = 5 tokens
      expect(estimateTokenCount('This is a test text.')).toBe(5);
      
      // 100 characters = 25 tokens
      const longText = 'A'.repeat(100);
      expect(estimateTokenCount(longText)).toBe(25);
    });

    it('should round up for partial tokens', () => {
      // 13 characters should round up to 4 tokens
      expect(estimateTokenCount('Hello world!!')).toBe(4);
    });

    it('should log estimation details for verification', () => {
      estimateTokenCount('Hello world!');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        '[Token Estimation] Text length: 12 chars → ~3 tokens'
      );
    });
  });

  describe('estimateMessagesTokens', () => {
    it('should return 0 for empty message array', () => {
      expect(estimateMessagesTokens([])).toBe(0);
      expect(estimateMessagesTokens(null!)).toBe(0);
      expect(estimateMessagesTokens(undefined!)).toBe(0);
    });

    it('should calculate content tokens plus structural overhead', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          content: 'Hello', // 5 chars = 2 tokens
          role: 'user',
          timestamp: new Date()
        },
        {
          id: '2',
          content: 'Hi there!', // 9 chars = 3 tokens
          role: 'assistant',
          timestamp: new Date()
        }
      ];

      // Content: 2 + 3 = 5 tokens
      // Structure: 2 messages * 4 tokens = 8 tokens
      // Total: 13 tokens
      expect(estimateMessagesTokens(messages)).toBe(13);
    });

    it('should log detailed token breakdown for verification', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          content: 'Test',
          role: 'user',
          timestamp: new Date()
        }
      ];

      estimateMessagesTokens(messages);
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        '[Token Estimation] 1 messages: 1 content + 4 structure = 5 total tokens'
      );
    });
  });

  describe('calculateTokenStrategy', () => {
    it('should use environment variables when available', () => {
      process.env.CONTEXT_RATIO = '0.7';
      process.env.OUTPUT_RATIO = '0.3';
      process.env.RESERVE_TOKENS = '200';

      const strategy = calculateTokenStrategy(10000);

      expect(strategy.contextRatio).toBe(0.7);
      expect(strategy.outputRatio).toBe(0.3);
      expect(strategy.reserveTokens).toBe(200);
      expect(strategy.maxInputTokens).toBe(6860); // (10000-200) * 0.7
      expect(strategy.maxOutputTokens).toBe(2940); // (10000-200) * 0.3
    });

    it('should use defaults when environment variables are not set', () => {
      const strategy = calculateTokenStrategy(8000);

      expect(strategy.contextRatio).toBe(0.6);
      expect(strategy.outputRatio).toBe(0.4);
      expect(strategy.reserveTokens).toBe(150);
      expect(strategy.maxInputTokens).toBe(4710); // (8000-150) * 0.6
      expect(strategy.maxOutputTokens).toBe(3140); // (8000-150) * 0.4
    });

    it('should handle edge case with very small context length', () => {
      const strategy = calculateTokenStrategy(100);

      // Should not go negative
      expect(strategy.maxInputTokens).toBeGreaterThanOrEqual(0);
      expect(strategy.maxOutputTokens).toBeGreaterThanOrEqual(0);
    });

    it('should log strategy calculation for verification', () => {
      calculateTokenStrategy(8000);
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        '[Token Strategy] Model context: 8000 → Input: 4710 (60%) | Output: 3140 (40%) | Reserve: 150'
      );
    });
  });

  describe('isWithinInputBudget', () => {
    const mockStrategy: TokenStrategy = {
      maxInputTokens: 1000,
      maxOutputTokens: 500,
      contextRatio: 0.6,
      outputRatio: 0.4,
      reserveTokens: 100,
      totalContextLength: 2000
    };

    it('should return true when tokens fit within budget', () => {
      expect(isWithinInputBudget(800, mockStrategy)).toBe(true);
      expect(isWithinInputBudget(1000, mockStrategy)).toBe(true); // Exact match
    });

    it('should return false when tokens exceed budget', () => {
      expect(isWithinInputBudget(1001, mockStrategy)).toBe(false);
      expect(isWithinInputBudget(1500, mockStrategy)).toBe(false);
    });

    it('should log budget check for verification', () => {
      isWithinInputBudget(800, mockStrategy);
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        '[Token Budget] 800 tokens fits within input budget of 1000'
      );
    });
  });

  describe('getMaxOutputTokens', () => {
    it('should return max output tokens for legacy compatibility', async () => {
      // This will use the conservative default since we can't properly mock useModelStore
      const maxTokens = await getMaxOutputTokens('gpt-4');
      
      expect(typeof maxTokens).toBe('number');
      expect(maxTokens).toBeGreaterThan(0);
    });

    it('should log legacy token limit for verification', async () => {
      await getMaxOutputTokens('gpt-4');
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringMatching(/\[Legacy Token Limit\] Model .* max output tokens: \d+/)
      );
    });
  });
});

describe('Integration Tests', () => {
  it('should provide consistent token estimation flow', () => {
    const messages: ChatMessage[] = [
      {
        id: '1',
        content: 'What is the capital of France?',
        role: 'user',
        timestamp: new Date()
      },
      {
        id: '2',
        content: 'The capital of France is Paris.',
        role: 'assistant',
        timestamp: new Date()
      }
    ];

    // Estimate message tokens
    const totalTokens = estimateMessagesTokens(messages);
    
    // Get strategy for a model
    const strategy = calculateTokenStrategy(8000);
    
    // Check if messages fit in budget
    const fitsInBudget = isWithinInputBudget(totalTokens, strategy);
    
    expect(typeof totalTokens).toBe('number');
    expect(typeof strategy).toBe('object');
    expect(typeof fitsInBudget).toBe('boolean');
    
    // Should log all verification steps
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringMatching(/\[Token Estimation\]/)
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringMatching(/\[Token Strategy\]/)
    );
    expect(mockConsoleLog).toHaveBeenCalledWith(
      expect.stringMatching(/\[Token Budget\]/)
    );
  });
});
