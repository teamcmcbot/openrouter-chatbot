import { renderHook, act } from '@testing-library/react';
import { useUIStore, useDetailsSidebar, useChatSidebarState, useTheme } from '../../stores/useUIStore';
import { ModelInfo } from '../../lib/types/openrouter';

// Mock window.matchMedia for device detection
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false, // Default to desktop (not mobile)
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

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
      isDetailsSidebarOpenMobile: false,
      isDetailsSidebarOpenDesktop: true,
      isChatSidebarOpen: false,
      selectedTab: 'overview',
      selectedGenerationId: undefined,
      hoveredGenerationId: undefined,
      scrollToCompletionId: undefined,
      lastCollapseTime: null,
      theme: 'dark',
      isMobile: false,
    });
  });

  describe('Basic state management', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useUIStore());

      expect(result.current.selectedDetailModel).toBeNull();
      expect(result.current.isDetailsSidebarOpenMobile).toBe(false);
      expect(result.current.isDetailsSidebarOpenDesktop).toBe(true);
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
      // Both mobile and desktop sidebars should be open after showModelDetails
      expect(result.current.isDetailsSidebarOpenMobile).toBe(true);
      expect(result.current.isDetailsSidebarOpenDesktop).toBe(true);
      expect(result.current.selectedTab).toBe('pricing');
      expect(result.current.selectedGenerationId).toBe('gen-123');
    });

    it('should close details sidebar', () => {
      const { result } = renderHook(() => useUIStore());

      // First set up some state
      act(() => {
        result.current.showModelDetails(mockModel, 'overview', 'gen-123');
      });

      // Both should be open after showing model details
      expect(result.current.isDetailsSidebarOpenMobile).toBe(true);
      expect(result.current.isDetailsSidebarOpenDesktop).toBe(true);

      // Then close it
      act(() => {
        result.current.closeDetailsSidebar();
      });

      // On desktop (matchMedia returns false), only desktop sidebar closes
      // Mobile sidebar stays true but that's expected behavior
      expect(result.current.isDetailsSidebarOpenDesktop).toBe(false);
      // Desktop close doesn't clear model data (for quick re-open)
      expect(result.current.selectedDetailModel).toEqual(mockModel);
      // Generation ID is preserved on desktop close
      expect(result.current.selectedGenerationId).toBe('gen-123');
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
      isDetailsSidebarOpenMobile: false,
      isDetailsSidebarOpenDesktop: true,
      selectedTab: 'overview',
      selectedGenerationId: undefined,
      hoveredGenerationId: undefined,
      lastCollapseTime: null,
    });
  });

  it('should provide details sidebar state and actions', () => {
    const { result } = renderHook(() => useDetailsSidebar());

    expect(result.current.selectedDetailModel).toBeNull();
    expect(result.current.isDetailsSidebarOpenMobile).toBe(false);
    expect(result.current.isDetailsSidebarOpenDesktop).toBe(true);
    expect(result.current.selectedTab).toBe('overview');

    act(() => {
      result.current.showModelDetails(mockModel);
    });

    expect(result.current.selectedDetailModel).toEqual(mockModel);
    // showModelDetails sets both mobile and desktop to true
    expect(result.current.isDetailsSidebarOpenMobile).toBe(true);
    expect(result.current.isDetailsSidebarOpenDesktop).toBe(true);
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
