/**
 * Unit tests for enhanced chat request validation (Phase 2)
 * Testing backward compatibility and new message array format
 */

import { validateChatRequest } from '../../lib/utils/validation';
import { ChatMessage } from '../../lib/types/chat';

// Mock console.log to capture verification logs
const mockConsoleLog = jest.fn();
console.log = mockConsoleLog;

// Mock environment variables
const originalEnv = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { 
    ...originalEnv,
    OPENROUTER_API_MODEL: 'test-model',
    OPENROUTER_MODELS_LIST: 'test-model,another-model'
  };
});

afterAll(() => {
  process.env = originalEnv;
});

describe('Enhanced Chat Request Validation (Phase 2)', () => {
  describe('Legacy Format Support', () => {
    it('should validate legacy single message format', () => {
      const legacyRequest = {
        message: 'Hello, world!',
        model: 'test-model'
      };

      const result = validateChatRequest(legacyRequest);

      expect(result.error).toBeNull();
      expect(result.data).toEqual({
        message: 'Hello, world!',
        model: 'test-model',
        messages: undefined
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        '[Request Validation] No messages array provided, using single message format'
      );
    });

    it('should handle legacy format without model', () => {
      const legacyRequest = {
        message: 'Hello without model'
      };

      const result = validateChatRequest(legacyRequest);

      expect(result.error).toBeNull();
      expect(result.data?.model).toBe('test-model'); // Should use default
    });
  });

  describe('New Messages Array Format', () => {
    it('should validate new format with messages array', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          content: 'Previous message',
          role: 'user',
          timestamp: new Date()
        },
        {
          id: '2',
          content: 'Previous response',
          role: 'assistant',
          timestamp: new Date()
        }
      ];

      const newRequest = {
        message: 'Current message',
        model: 'test-model',
        messages
      };

      const result = validateChatRequest(newRequest);

      expect(result.error).toBeNull();
      expect(result.data).toEqual({
        message: 'Current message',
        model: 'test-model',
        messages
      });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        '[Request Validation] Successfully validated 2 context messages'
      );
    });

    it('should handle invalid messages array gracefully', () => {
      const invalidMessages = [
        { invalid: 'message' },
        { role: 'user' } // Missing content
      ];

      const newRequest = {
        message: 'Current message',
        model: 'test-model',
        messages: invalidMessages
      };

      const result = validateChatRequest(newRequest);

      // Should not fail the request, just ignore invalid messages
      expect(result.error).toBeNull();
      expect(result.data?.messages).toBeUndefined();

      expect(mockConsoleLog).toHaveBeenCalledWith(
        '[Request Validation] Invalid messages array format, ignoring'
      );
    });

    it('should validate message roles correctly', () => {
      const invalidRoleMessages = [
        {
          id: '1',
          content: 'Message',
          role: 'invalid-role', // Invalid role
          timestamp: new Date()
        }
      ];

      const newRequest = {
        message: 'Current message',
        messages: invalidRoleMessages
      };

      const result = validateChatRequest(newRequest);

      expect(result.error).toBeNull();
      expect(result.data?.messages).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should reject empty message', () => {
      const invalidRequest = {
        message: '',
        model: 'test-model'
      };

      const result = validateChatRequest(invalidRequest);

      expect(result.error).toBe('Message is required and must be a non-empty string.');
      expect(result.data).toBeNull();
    });

    it('should reject overly long message', () => {
      const longMessage = 'a'.repeat(4001);
      const invalidRequest = {
        message: longMessage,
        model: 'test-model'
      };

      const result = validateChatRequest(invalidRequest);

      expect(result.error).toBe('Message cannot exceed 4000 characters.');
      expect(result.data).toBeNull();
    });

    it('should reject request without message field', () => {
      const invalidRequest = {
        model: 'test-model'
        // No message field
      };

      const result = validateChatRequest(invalidRequest);

      expect(result.error).toBe('Message is required and must be a non-empty string.');
      expect(result.data).toBeNull();
    });
  });

  describe('Logging Verification', () => {
    it('should log format detection correctly', () => {
      // Test legacy format
      validateChatRequest({ message: 'test' });
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringMatching(/Final request: LEGACY format/)
      );

      jest.clearAllMocks();

      // Test new format
      const messages: ChatMessage[] = [{
        id: '1',
        content: 'test',
        role: 'user',
        timestamp: new Date()
      }];

      validateChatRequest({ message: 'test', messages });
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringMatching(/Final request: NEW format/)
      );
    });
  });
});
