import { create } from 'zustand';
import { 
  persist, 
  createJSONStorage, 
  subscribeWithSelector, 
  devtools 
} from 'zustand/middleware';
import { UIState } from './types/ui';
import { STORAGE_KEYS } from '../lib/constants';
import { createLogger } from './storeUtils';

const logger = createLogger('UIStore');

export const useUIStore = create<UIState>()(
  devtools(
    subscribeWithSelector(
      persist(
        (set, get) => ({
          // Initial state
          selectedDetailModel: null,
          isDetailsSidebarOpen: false,
          isChatSidebarOpen: false,
          
          selectedTab: 'overview',
          selectedGenerationId: undefined,
          hoveredGenerationId: undefined,
          scrollToCompletionId: undefined,
          
          theme: 'dark',
          isMobile: false,
          
          // Basic actions
          setSelectedDetailModel: (model) => {
            set({ selectedDetailModel: model });
          },
          
          setIsDetailsSidebarOpen: (open) => {
            set({ isDetailsSidebarOpen: open });
          },
          
          setIsChatSidebarOpen: (open) => {
            set({ isChatSidebarOpen: open });
          },
          
          toggleChatSidebar: () => {
            set((state) => ({ 
              isChatSidebarOpen: !state.isChatSidebarOpen 
            }));
          },
          
          setSelectedTab: (tab) => {
            set({ selectedTab: tab });
          },
          
          setSelectedGenerationId: (id) => {
            set({ selectedGenerationId: id });
          },
          
          setHoveredGenerationId: (id) => {
            set({ hoveredGenerationId: id });
          },
          
          setScrollToCompletionId: (id) => {
            set({ scrollToCompletionId: id });
            // Clear the scroll trigger after a short delay
            if (id) {
              setTimeout(() => {
                const currentState = get();
                if (currentState.scrollToCompletionId === id) {
                  set({ scrollToCompletionId: undefined });
                }
              }, 500);
            }
          },
          
          setTheme: (theme) => {
            set({ theme });
            logger.info('Theme changed', { theme });
          },
          
          setIsMobile: (mobile) => {
            set({ isMobile: mobile });
          },
          
          // Complex actions
          showModelDetails: (model, tab = 'overview', generationId) => {
            logger.info('Showing model details', { modelId: model.id, tab, generationId });
            
            set({
              selectedDetailModel: model,
              selectedTab: tab,
              selectedGenerationId: generationId,
              isDetailsSidebarOpen: true,
            });
          },
          
          closeDetailsSidebar: () => {
            logger.info('Closing details sidebar');
            
            set({
              isDetailsSidebarOpen: false,
              selectedDetailModel: null,
              selectedGenerationId: undefined,
            });
          },
          
          handleModelClickFromMessage: (modelId, tab = 'overview', generationId) => {
            // This will be handled by the component since it needs access to availableModels
            // We'll keep this as a placeholder for consistency
            logger.info('Model click from message', { modelId, tab, generationId });
          },
          
          handleGenerationClick: (generationId) => {
            logger.info('Generation clicked', { generationId });
            
            get().setScrollToCompletionId(generationId);
          },
        }),
        {
          name: STORAGE_KEYS.UI_PREFERENCES,
          storage: createJSONStorage(() => localStorage),
          // Only persist theme and layout preferences, not transient UI state
          partialize: (state) => ({
            theme: state.theme,
            isChatSidebarOpen: state.isChatSidebarOpen,
          }),
          migrate: (persistedState: unknown) => {
            try {
              const s = persistedState as { state?: { theme?: 'light' | 'dark' | 'system' } }
              if (s?.state?.theme === 'system') {
                s.state.theme = 'dark'
              }
              return s as unknown
            } catch {
              return persistedState
            }
          },
        }
      )
    ),
    {
      name: 'ui-store',
    }
  )
);

// Convenience hooks for common UI patterns
export const useDetailsSidebar = () => {
  const selectedDetailModel = useUIStore((state) => state.selectedDetailModel);
  const isDetailsSidebarOpen = useUIStore((state) => state.isDetailsSidebarOpen);
  const selectedTab = useUIStore((state) => state.selectedTab);
  const selectedGenerationId = useUIStore((state) => state.selectedGenerationId);
  const hoveredGenerationId = useUIStore((state) => state.hoveredGenerationId);
  const showModelDetails = useUIStore((state) => state.showModelDetails);
  const closeDetailsSidebar = useUIStore((state) => state.closeDetailsSidebar);
  const setSelectedTab = useUIStore((state) => state.setSelectedTab);
  const setHoveredGenerationId = useUIStore((state) => state.setHoveredGenerationId);

  return {
    selectedDetailModel,
    isDetailsSidebarOpen,
    selectedTab,
    selectedGenerationId,
    hoveredGenerationId,
    showModelDetails,
    closeDetailsSidebar,
    setSelectedTab,
    setHoveredGenerationId,
  };
};

export const useChatSidebarState = () => {
  const isChatSidebarOpen = useUIStore((state) => state.isChatSidebarOpen);
  const setIsChatSidebarOpen = useUIStore((state) => state.setIsChatSidebarOpen);
  const toggleChatSidebar = useUIStore((state) => state.toggleChatSidebar);

  return {
    isChatSidebarOpen,
    setIsChatSidebarOpen,
    toggleChatSidebar,
  };
};

export const useTheme = () => {
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);

  return {
    theme,
    setTheme,
  };
};
