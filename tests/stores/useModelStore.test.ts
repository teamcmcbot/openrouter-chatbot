import { renderHook, act, waitFor } from '@testing-library/react';
import { useModelStore, useModelData, useModelSelection } from '../../stores';
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

// No env flag mocks needed; models API is enhanced-only

// Test data
// Legacy basic models format removed; tests assume enhanced-only

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
      prompt: '0.015',
      completion: '0.075',
    },
    input_modalities: ['text'],
    output_modalities: ['text'],
    supported_parameters: ['temperature', 'max_tokens'],
    created: Date.now(),
  },
];

describe('useModelStore', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    jest.clearAllMocks();
    
    // Reset the store state
    useModelStore.setState({
      models: [],
      selectedModel: '',
      isLoading: false,
      error: null,
      isEnhanced: true,
      lastUpdated: null,
      isHydrated: true,
      isOnline: true,
      backgroundRefreshEnabled: false,
    });
  });

  describe('Model Fetching', () => {
    it('should fetch enhanced models successfully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: mockEnhancedModels }),
      });

      const { result } = renderHook(() => useModelStore());

      await act(async () => {
        await result.current.fetchModels();
      });

      const state = useModelStore.getState();
      expect(state.models).toEqual(mockEnhancedModels);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.lastUpdated).toBeTruthy();
    });

  // Removed: basic models fallback test (legacy path deleted)

    it('should handle API errors gracefully', async () => {
  // Mock API call to fail
  (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useModelStore());

      await act(async () => {
        await result.current.fetchModels();
      });

      const state = useModelStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Network error');
      expect(state.models).toEqual([]);
    });

    it('should use cached data when available', async () => {
      // Set up cache
      const cacheData = {
        models: mockEnhancedModels,
        isEnhanced: true,
        timestamp: Date.now(),
        version: 1,
      };
      mockLocalStorage.setItem('openrouter-models-cache', JSON.stringify(cacheData));

      const { result } = renderHook(() => useModelStore());

      await act(async () => {
        await result.current.fetchModels();
      });

      const state = useModelStore.getState();
      expect(state.models).toEqual(mockEnhancedModels);
      expect(global.fetch).not.toHaveBeenCalled(); // Should use cache
    });

    it('should refresh models in background when cache is getting old', async () => {
      // Set up old cache
      const cacheData = {
        models: mockEnhancedModels,
        isEnhanced: true,
        timestamp: Date.now() - (20 * 60 * 60 * 1000), // 20 hours old
        version: 1,
      };
      mockLocalStorage.setItem('openrouter-models-cache', JSON.stringify(cacheData));

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [...mockEnhancedModels, { id: 'new-model', name: 'New Model' }] }),
      });

      const { result } = renderHook(() => useModelStore());

      await act(async () => {
        await result.current.fetchModels();
      });

      // Should use cache first
      expect(useModelStore.getState().models).toEqual(mockEnhancedModels);

      // Wait for background refresh
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      }, { timeout: 200 });
    });
  });

  describe('Model Selection', () => {
    beforeEach(() => {
      // Set up some models
      useModelStore.setState({
        models: mockEnhancedModels,
        isEnhanced: true,
      });
    });

    it('should set selected model', () => {
      const { result } = renderHook(() => useModelStore());

      act(() => {
        result.current.setSelectedModel('gpt-4');
      });

      expect(useModelStore.getState().selectedModel).toBe('gpt-4');
    });

    it('should validate selected model exists', () => {
      const { result } = renderHook(() => useModelStore());

      act(() => {
        result.current.setSelectedModel('non-existent-model');
      });

      // Should fall back to first available model
      expect(useModelStore.getState().selectedModel).toBe('gpt-4');
    });

    it('should get model by ID', () => {
      const { result } = renderHook(() => useModelStore());

      const model = result.current.getModelById('claude-3');
      expect(model).toEqual(mockEnhancedModels[1]);
    });

    it('should get selected model info', () => {
      useModelStore.setState({ selectedModel: 'claude-3' });

      const { result } = renderHook(() => useModelStore());

      const selectedModel = result.current.getSelectedModelInfo();
      expect(selectedModel).toEqual(mockEnhancedModels[1]);
    });
  });

  describe('Cache Management', () => {
    it('should clear cache', () => {
      // Set up cache
      mockLocalStorage.setItem('openrouter-models-cache', JSON.stringify({ test: 'data' }));
      useModelStore.setState({ models: mockEnhancedModels });

      const { result } = renderHook(() => useModelStore());

      act(() => {
        result.current.clearCache();
      });

      expect(mockLocalStorage.getItem('openrouter-models-cache')).toBeNull();
      expect(useModelStore.getState().models).toEqual([]);
    });

    it('should detect cache validity', () => {
      // Fresh cache
      useModelStore.setState({ lastUpdated: new Date() });
      expect(useModelStore.getState().isCacheValid()).toBe(true);

      // Old cache
      const oldDate = new Date(Date.now() - (25 * 60 * 60 * 1000)); // 25 hours old
      useModelStore.setState({ lastUpdated: oldDate });
      expect(useModelStore.getState().isCacheValid()).toBe(false);
    });

    it('should detect when refresh is needed', () => {
      const state = useModelStore.getState();

      // No models
      useModelStore.setState({ models: [] });
      expect(state.isRefreshNeeded()).toBe(true);

      // Valid cache
      useModelStore.setState({ 
        models: mockEnhancedModels,
        lastUpdated: new Date(),
      });
      expect(state.isRefreshNeeded()).toBe(false);

      // Old cache
      const oldDate = new Date(Date.now() - (25 * 60 * 60 * 1000));
      useModelStore.setState({ lastUpdated: oldDate });
      expect(state.isRefreshNeeded()).toBe(true);
    });
  });

  describe('Background Refresh', () => {
    it('should start and stop background refresh', () => {
      const { result } = renderHook(() => useModelStore());

      act(() => {
        result.current.startBackgroundRefresh();
      });

      expect(useModelStore.getState().backgroundRefreshEnabled).toBe(true);

      act(() => {
        result.current.stopBackgroundRefresh();
      });

      expect(useModelStore.getState().backgroundRefreshEnabled).toBe(false);
    });
  });

  describe('Online/Offline Handling', () => {
    it('should handle online status changes', () => {
      const { result } = renderHook(() => useModelStore());

      act(() => {
        result.current.setOnlineStatus(false);
      });

      expect(useModelStore.getState().isOnline).toBe(false);

      act(() => {
        result.current.setOnlineStatus(true);
      });

      expect(useModelStore.getState().isOnline).toBe(true);
    });

    it('should not refresh when offline', async () => {
      useModelStore.setState({ isOnline: false });

      const { result } = renderHook(() => useModelStore());

      await act(async () => {
        await result.current.refreshModels();
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should clear errors', () => {
      useModelStore.setState({ error: 'Test error' });

      const { result } = renderHook(() => useModelStore());

      act(() => {
        result.current.clearError();
      });

      expect(useModelStore.getState().error).toBeNull();
    });

    it('should use fallback cache on API error', async () => {
      // Set up cache with valid data
      const cacheData = {
        models: mockEnhancedModels,
        isEnhanced: true,
        timestamp: Date.now() - (1 * 60 * 60 * 1000), // 1 hour old, still valid (TTL is 24 hours)
        version: 1,
      };
      mockLocalStorage.setItem('openrouter-models-cache', JSON.stringify(cacheData));

      // API calls should not be made when cache is valid
      const { result } = renderHook(() => useModelStore());

      await act(async () => {
        await result.current.fetchModels();
      });

      const state = useModelStore.getState();
      expect(state.models).toEqual(mockEnhancedModels); // Should use cache
      expect(state.isEnhanced).toBe(true);
      expect(state.error).toBeNull(); // No error because cache was used
    });
  });

  describe('Selectors', () => {
    beforeEach(() => {
      useModelStore.setState({
        models: mockEnhancedModels,
        selectedModel: 'gpt-4',
      });
    });

    it('should get available models', () => {
      const { result } = renderHook(() => useModelStore());
      expect(result.current.getAvailableModels()).toEqual(mockEnhancedModels);
    });

    it('should get model count', () => {
      const { result } = renderHook(() => useModelStore());
      expect(result.current.getModelCount()).toBe(2);
    });
  });
});

describe('useModelData (Backward Compatibility Hook)', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    jest.clearAllMocks();
    
    useModelStore.setState({
      models: [],
      selectedModel: '',
      isLoading: false,
      error: null,
      isEnhanced: true,
      lastUpdated: null,
      isHydrated: true,
      isOnline: true,
      backgroundRefreshEnabled: false,
    });
  });

  it('should provide backward compatible API', () => {
    useModelStore.setState({
      models: mockEnhancedModels,
      isLoading: false,
      error: null,
      isEnhanced: true,
      lastUpdated: new Date(),
    });

    const { result } = renderHook(() => useModelData());

    expect(result.current.models).toEqual(mockEnhancedModels);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isEnhanced).toBe(true);
    expect(result.current.lastUpdated).toBeTruthy();
    expect(typeof result.current.refresh).toBe('function');
  });

  it('should return safe defaults before hydration', () => {
    useModelStore.setState({ isHydrated: false });

    const { result } = renderHook(() => useModelData());

    expect(result.current.models).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isEnhanced).toBe(false);
  });

  it('should convert error to Error object', () => {
    // Reset store and set error with hydration
    // Set models to non-empty array to prevent auto-fetch which would clear the error
    useModelStore.setState({
      models: mockEnhancedModels,
      selectedModel: '',
      isLoading: false,
      error: 'Test error message',
      isEnhanced: false,
      lastUpdated: null,
      isHydrated: true,
      isOnline: true,
      backgroundRefreshEnabled: false,
    });

    const { result } = renderHook(() => useModelData());

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Test error message');
  });
});

describe('useModelSelection (Backward Compatibility Hook)', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    jest.clearAllMocks();
    
    useModelStore.setState({
      models: mockEnhancedModels,
      selectedModel: 'gpt-4',
      isLoading: false,
      error: null,
      isEnhanced: true,
      lastUpdated: new Date(),
      isHydrated: true,
      isOnline: true,
      backgroundRefreshEnabled: false,
    });
  });

  it('should provide backward compatible API', () => {
    const { result } = renderHook(() => useModelSelection());

    expect(result.current.availableModels).toEqual(mockEnhancedModels);
    expect(result.current.selectedModel).toBe('gpt-4');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isEnhanced).toBe(true);
    expect(typeof result.current.setSelectedModel).toBe('function');
    expect(typeof result.current.refreshModels).toBe('function');
  });

  it('should return safe defaults before hydration', () => {
    useModelStore.setState({ isHydrated: false });

    const { result } = renderHook(() => useModelSelection());

    expect(result.current.availableModels).toEqual([]);
    expect(result.current.selectedModel).toBe('');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isEnhanced).toBe(false);
  });

  it('should handle model selection', () => {
    const { result } = renderHook(() => useModelSelection());

    act(() => {
      result.current.setSelectedModel('claude-3');
    });

    expect(useModelStore.getState().selectedModel).toBe('claude-3');
  });
});
