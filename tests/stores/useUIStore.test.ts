import { renderHook, act } from '@testing-library/react';
import { useUIStore, useDetailsSidebar, useChatSidebarState, useTheme } from '../../stores/useUIStore';
import { ModelInfo } from '../../lib/types/openrouter';

// Mock model data for testing
const mockModel: ModelInfo = {
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
};

describe('useUIStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useUIStore.setState({
      selectedDetailModel: null,
      isDetailsSidebarOpen: false,
      isChatSidebarOpen: false,
      selectedTab: 'overview',
      selectedGenerationId: undefined,
      hoveredGenerationId: undefined,
      scrollToCompletionId: undefined,
  theme: 'dark',
      isMobile: false,
    });
  });

  describe('Basic state management', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useUIStore());

      expect(result.current.selectedDetailModel).toBeNull();
      expect(result.current.isDetailsSidebarOpen).toBe(false);
      expect(result.current.isChatSidebarOpen).toBe(false);
      expect(result.current.selectedTab).toBe('overview');
  expect(result.current.theme).toBe('dark');
    });

    it('should toggle chat sidebar', () => {
      const { result } = renderHook(() => useUIStore());

      act(() => {
        result.current.toggleChatSidebar();
      });

      expect(result.current.isChatSidebarOpen).toBe(true);

      act(() => {
        result.current.toggleChatSidebar();
      });

      expect(result.current.isChatSidebarOpen).toBe(false);
    });

    it('should set theme', () => {
      const { result } = renderHook(() => useUIStore());

      act(() => {
        result.current.setTheme('dark');
      });

      expect(result.current.theme).toBe('dark');
    });
  });

  describe('Model details functionality', () => {
    it('should show model details', () => {
      const { result } = renderHook(() => useUIStore());

      act(() => {
        result.current.showModelDetails(mockModel, 'pricing', 'gen-123');
      });

      expect(result.current.selectedDetailModel).toEqual(mockModel);
      expect(result.current.isDetailsSidebarOpen).toBe(true);
      expect(result.current.selectedTab).toBe('pricing');
      expect(result.current.selectedGenerationId).toBe('gen-123');
    });

    it('should close details sidebar', () => {
      const { result } = renderHook(() => useUIStore());

      // First set up some state
      act(() => {
        result.current.showModelDetails(mockModel, 'overview', 'gen-123');
      });

      expect(result.current.isDetailsSidebarOpen).toBe(true);

      // Then close it
      act(() => {
        result.current.closeDetailsSidebar();
      });

      expect(result.current.isDetailsSidebarOpen).toBe(false);
      expect(result.current.selectedDetailModel).toBeNull();
      expect(result.current.selectedGenerationId).toBeUndefined();
    });

    it('should handle generation hover', () => {
      const { result } = renderHook(() => useUIStore());

      act(() => {
        result.current.setHoveredGenerationId('gen-456');
      });

      expect(result.current.hoveredGenerationId).toBe('gen-456');

      act(() => {
        result.current.setHoveredGenerationId(undefined);
      });

      expect(result.current.hoveredGenerationId).toBeUndefined();
    });

    it('should handle generation click with auto-clear', async () => {
      const { result } = renderHook(() => useUIStore());

      act(() => {
        result.current.handleGenerationClick('gen-789');
      });

      expect(result.current.scrollToCompletionId).toBe('gen-789');

      // Wait for the auto-clear timeout
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 600));
      });

      expect(result.current.scrollToCompletionId).toBeUndefined();
    });
  });
});

describe('useDetailsSidebar', () => {
  beforeEach(() => {
    useUIStore.setState({
      selectedDetailModel: null,
      isDetailsSidebarOpen: false,
      selectedTab: 'overview',
      selectedGenerationId: undefined,
      hoveredGenerationId: undefined,
    });
  });

  it('should provide details sidebar state and actions', () => {
    const { result } = renderHook(() => useDetailsSidebar());

    expect(result.current.selectedDetailModel).toBeNull();
    expect(result.current.isDetailsSidebarOpen).toBe(false);
    expect(result.current.selectedTab).toBe('overview');

    act(() => {
      result.current.showModelDetails(mockModel);
    });

    expect(result.current.selectedDetailModel).toEqual(mockModel);
    expect(result.current.isDetailsSidebarOpen).toBe(true);
  });
});

describe('useChatSidebarState', () => {
  beforeEach(() => {
    useUIStore.setState({
      isChatSidebarOpen: false,
    });
  });

  it('should provide chat sidebar state and actions', () => {
    const { result } = renderHook(() => useChatSidebarState());

    expect(result.current.isChatSidebarOpen).toBe(false);

    act(() => {
      result.current.toggleChatSidebar();
    });

    expect(result.current.isChatSidebarOpen).toBe(true);

    act(() => {
      result.current.setIsChatSidebarOpen(false);
    });

    expect(result.current.isChatSidebarOpen).toBe(false);
  });
});

describe('useTheme', () => {
  beforeEach(() => {
    useUIStore.setState({
      theme: 'dark',
    });
  });

  it('should provide theme state and actions', () => {
    const { result } = renderHook(() => useTheme());

  expect(result.current.theme).toBe('dark');

    act(() => {
      result.current.setTheme('dark');
    });

    expect(result.current.theme).toBe('dark');
  });
});
