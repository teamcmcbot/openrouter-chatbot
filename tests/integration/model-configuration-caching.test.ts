/**
 * Integration tests for model configuration caching optimization
 * 
 * Tests the complete flow of:
 * 1. Loading models (which should cache configurations)
 * 2. Getting token limits (which should use cached data)
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useModelStore, hasModelConfigsInStore, getModelConfigFromStore } from '../../stores/useModelStore';
import { getModelTokenLimits } from '../../lib/utils/tokens';
import type { ModelInfo } from '../../lib/types/openrouter';

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

// Mock fetch
global.fetch = jest.fn();

// Mock environment
jest.mock('../../lib/utils/env', () => ({
  getEnvVar: jest.fn((key: string, defaultValue: string) => defaultValue),
}));

// Test data
const mockEnhancedModels: ModelInfo[] = [
  {
    id: 'gpt-4',
    name: 'GPT-4',
    description: 'OpenAI GPT-4',
    context_length: 8192,
    pricing: {
      prompt: '0.03',
      completion: '0.06',
    },
    input_modalities: ['text'],
    output_modalities: ['text'],
    supported_parameters: ['temperature', 'max_tokens'],
    created: Date.now(),
  },
  {
    id: 'claude-3',
    name: 'Claude 3',
    description: 'Anthropic Claude 3',
    context_length: 200000,
    pricing: {
      prompt: '0.01',
      completion: '0.03',
    },
    input_modalities: ['text'],
    output_modalities: ['text'],
    supported_parameters: ['temperature', 'max_tokens'],
    created: Date.now(),
  },
  {
    id: 'mistral-small',
    name: 'Mistral Small',
    description: 'Mistral Small 3.2',
    context_length: 32768,
    pricing: {
      prompt: '0.002',
      completion: '0.006',
    },
    input_modalities: ['text'],
    output_modalities: ['text'],
    supported_parameters: ['temperature', 'max_tokens'],
    created: Date.now(),
  },
];

// Mock OpenRouter API response
const mockOpenRouterResponse = {
  data: mockEnhancedModels
};

describe('Model Configuration Caching Integration', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    mockLocalStorage.clear();
    
    // Reset the store state
    useModelStore.getState().clearCache();
    
    // Mock successful API responses
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/models')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ models: mockEnhancedModels }),
        });
      }
      if (url.includes('openrouter.ai/api/v1/models')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockOpenRouterResponse),
        });
      }
      return Promise.reject(new Error('Unexpected fetch call'));
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Client-side caching optimization', () => {
    it('should cache model configurations when fetching models', async () => {
      const { result } = renderHook(() => useModelStore());

      await act(async () => {
        await result.current.fetchModels();
      });

      // Wait for the fetch to complete
      await waitFor(() => {
        expect(result.current.models).toHaveLength(3);
      });

      // Check that model configurations are cached
      expect(hasModelConfigsInStore()).toBe(true);
      
      const allConfigs = result.current.getAllModelConfigs();
      expect(Object.keys(allConfigs)).toHaveLength(3);
      
      // Verify specific model configurations
      const gpt4Config = getModelConfigFromStore('gpt-4');
      expect(gpt4Config).toEqual({
        context_length: 8192,
        description: 'GPT-4'
      });

      const claude3Config = getModelConfigFromStore('claude-3');
      expect(claude3Config).toEqual({
        context_length: 200000,
        description: 'Claude 3'
      });
    });

    it('should use cached configurations for token limit calculations', async () => {
      const { result } = renderHook(() => useModelStore());

      // First, populate the cache
      await act(async () => {
        await result.current.fetchModels();
      });

      await waitFor(() => {
        expect(result.current.models).toHaveLength(3);
      });

      // Clear fetch mock calls to track new ones
      jest.clearAllMocks();

      // Test token limits calculation - should use cached data
      const tokenStrategy = await getModelTokenLimits('gpt-4');

      // Should use cached configuration, not make new API calls
      expect(global.fetch).not.toHaveBeenCalled();
      
      // Verify correct token strategy calculation
      expect(tokenStrategy.totalContextLength).toBe(8192);
      expect(tokenStrategy.maxInputTokens).toBeGreaterThan(0);
      expect(tokenStrategy.maxOutputTokens).toBeGreaterThan(0);
    });

    it('should fall back to API when cache is not available', async () => {
      // Don't populate cache, directly test token limits
      const tokenStrategy = await getModelTokenLimits('gpt-4');

      // Should make API call to OpenRouter when cache is empty
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('openrouter.ai/api/v1/models')
      );
      
      // Should still return valid token strategy
      expect(tokenStrategy.totalContextLength).toBeGreaterThan(0);
      expect(tokenStrategy.maxInputTokens).toBeGreaterThan(0);
      expect(tokenStrategy.maxOutputTokens).toBeGreaterThan(0);
    });

    it('should handle server-side execution gracefully', async () => {
      // Simulate server-side by removing window object temporarily
      const originalWindow = global.window;
      // @ts-expect-error - Intentionally deleting window for server-side simulation
      delete global.window;

      // Clear any previous mock calls
      jest.clearAllMocks();

      const tokenStrategy = await getModelTokenLimits('gpt-4');

      // Should still return valid token strategy (may use cached server-side data or fallback)
      expect(tokenStrategy.totalContextLength).toBeGreaterThan(0);
      expect(tokenStrategy.maxInputTokens).toBeGreaterThan(0);
      expect(tokenStrategy.maxOutputTokens).toBeGreaterThan(0);

      // Restore window object
      global.window = originalWindow;
    });
  });

  describe('Performance optimizations', () => {
    it('should cache configurations with localStorage persistence', async () => {
      const { result } = renderHook(() => useModelStore());

      await act(async () => {
        await result.current.fetchModels();
      });

      await waitFor(() => {
        expect(result.current.models).toHaveLength(3);
      });

      // Check that data is persisted in localStorage
      const cachedData = mockLocalStorage.getItem('openrouter-models-cache');
      expect(cachedData).toBeTruthy();
      
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        expect(parsed.modelConfigs).toBeDefined();
        expect(Object.keys(parsed.modelConfigs)).toHaveLength(3);
      }
    });

    it('should measure token calculation performance improvement', async () => {
      const { result } = renderHook(() => useModelStore());

      // Populate cache first
      await act(async () => {
        await result.current.fetchModels();
      });

      await waitFor(() => {
        expect(result.current.models).toHaveLength(3);
      });

      // Clear API mocks to measure cache-only performance
      jest.clearAllMocks();

      // Measure token calculation time with cache
      const startTime = Date.now();
      const tokenStrategy = await getModelTokenLimits('gpt-4');
      const endTime = Date.now();
      const cachedTime = endTime - startTime;

      // Should be reasonably fast (< 50ms) when using cache (more relaxed expectation)
      expect(cachedTime).toBeLessThan(50);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(tokenStrategy.totalContextLength).toBe(8192);
    });
  });

  describe('Error handling and fallbacks', () => {
    it('should handle fetch failures gracefully', async () => {
      // Mock fetch failure
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const tokenStrategy = await getModelTokenLimits('unknown-model');

      // Should fall back to conservative default
      expect(tokenStrategy.totalContextLength).toBe(8000);
      expect(tokenStrategy.maxInputTokens).toBeGreaterThan(0);
      expect(tokenStrategy.maxOutputTokens).toBeGreaterThan(0);
    });

    it('should handle missing model configurations', async () => {
      // First test with a model that doesn't exist in cache
      // This should use fallback behavior regardless of store state
      const tokenStrategy = await getModelTokenLimits('non-existent-model');

      // Should fall back to conservative default or API fallback
      expect(tokenStrategy.totalContextLength).toBeGreaterThan(0);
      expect(tokenStrategy.maxInputTokens).toBeGreaterThan(0);
      expect(tokenStrategy.maxOutputTokens).toBeGreaterThan(0);
    });
  });
});
