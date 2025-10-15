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
          isDetailsSidebarOpenMobile: false,
          isDetailsSidebarOpenDesktop: true,  // Default: visible on desktop
          isChatSidebarOpen: false,
          
          selectedTab: 'overview',
          selectedGenerationId: undefined,
          hoveredGenerationId: undefined,
          scrollToCompletionId: undefined,
          
          lastCollapseTime: null,  // Smart expansion tracking
          
          theme: 'dark',
          isMobile: false,
          
          // Basic actions
          setSelectedDetailModel: (model) => {
            set({ selectedDetailModel: model });
          },
          
          setIsDetailsSidebarOpen: (open) => {
            // Backward compatible: sets based on device type
            const isMobile = typeof window !== 'undefined' && 
              window.matchMedia('(max-width: 1023px)').matches;
            
            if (isMobile) {
              set({ isDetailsSidebarOpenMobile: open });
            } else {
              set({ isDetailsSidebarOpenDesktop: open });
            }
          },
          
          setIsChatSidebarOpen: (open) => {
            set({ isChatSidebarOpen: open });
          },
          
          toggleChatSidebar: () => {
            set((state) => ({ 
              isChatSidebarOpen: !state.isChatSidebarOpen 
            }));
          },
          
          toggleDetailsSidebar: () => {
            const state = get();
            const isMobile = typeof window !== 'undefined' && 
              window.matchMedia('(max-width: 1023px)').matches;
            
            if (isMobile) {
              set({ 
                isDetailsSidebarOpenMobile: !state.isDetailsSidebarOpenMobile 
              });
            } else {
              // Track collapse time for smart expansion
              const isCollapsing = state.isDetailsSidebarOpenDesktop;
              set({ 
                isDetailsSidebarOpenDesktop: !state.isDetailsSidebarOpenDesktop,
                lastCollapseTime: isCollapsing ? Date.now() : null,
              });
            }
          },
          
          openDetailsSidebar: () => {
            const isMobile = typeof window !== 'undefined' && 
              window.matchMedia('(max-width: 1023px)').matches;
            
            if (isMobile) {
              set({ isDetailsSidebarOpenMobile: true });
            } else {
              set({ 
                isDetailsSidebarOpenDesktop: true,
                lastCollapseTime: null,  // Clear collapse time when opening
              });
            }
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
              isDetailsSidebarOpenMobile: true,   // Open on mobile
              isDetailsSidebarOpenDesktop: true,  // Open on desktop
              lastCollapseTime: null,  // Clear collapse time when explicitly showing
            });
          },
          
          closeDetailsSidebar: () => {
            logger.info('Closing details sidebar');
            
            const isMobile = typeof window !== 'undefined' && 
              window.matchMedia('(max-width: 1023px)').matches;
            
            if (isMobile) {
              set({
                isDetailsSidebarOpenMobile: false,
                selectedDetailModel: null,
                selectedGenerationId: undefined,
              });
            } else {
              // On desktop, just collapse (keep model data for quick re-open)
              set({
                isDetailsSidebarOpenDesktop: false,
                lastCollapseTime: Date.now(),
              });
            }
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
          // Persist theme, layout preferences, and desktop sidebar collapse state
          partialize: (state) => ({
            theme: state.theme,
            isChatSidebarOpen: state.isChatSidebarOpen,
            isDetailsSidebarOpenDesktop: state.isDetailsSidebarOpenDesktop,
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
  const isDetailsSidebarOpenMobile = useUIStore((state) => state.isDetailsSidebarOpenMobile);
  const isDetailsSidebarOpenDesktop = useUIStore((state) => state.isDetailsSidebarOpenDesktop);
  const selectedTab = useUIStore((state) => state.selectedTab);
  const selectedGenerationId = useUIStore((state) => state.selectedGenerationId);
  const hoveredGenerationId = useUIStore((state) => state.hoveredGenerationId);
  const lastCollapseTime = useUIStore((state) => state.lastCollapseTime);
  const showModelDetails = useUIStore((state) => state.showModelDetails);
  const closeDetailsSidebar = useUIStore((state) => state.closeDetailsSidebar);
  const openDetailsSidebar = useUIStore((state) => state.openDetailsSidebar);
  const toggleDetailsSidebar = useUIStore((state) => state.toggleDetailsSidebar);
  const setSelectedTab = useUIStore((state) => state.setSelectedTab);
  const setHoveredGenerationId = useUIStore((state) => state.setHoveredGenerationId);

  return {
    selectedDetailModel,
    isDetailsSidebarOpenMobile,
    isDetailsSidebarOpenDesktop,
    selectedTab,
    selectedGenerationId,
    hoveredGenerationId,
    lastCollapseTime,
    showModelDetails,
    closeDetailsSidebar,
    openDetailsSidebar,
    toggleDetailsSidebar,
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
