import { ModelInfo } from '../../lib/types/openrouter';

export interface UIState {
  // Sidebar states
  selectedDetailModel: ModelInfo | null;
  isDetailsSidebarOpen: boolean;
  isChatSidebarOpen: boolean;
  
  // Model details sidebar state
  selectedTab: 'overview' | 'pricing' | 'capabilities';
  selectedGenerationId: string | undefined;
  hoveredGenerationId: string | undefined;
  scrollToCompletionId: string | undefined;
  
  // Theme and layout preferences
  theme: 'light' | 'dark' | 'system';
  isMobile: boolean;
  
  // Actions
  setSelectedDetailModel: (model: ModelInfo | null) => void;
  setIsDetailsSidebarOpen: (open: boolean) => void;
  setIsChatSidebarOpen: (open: boolean) => void;
  toggleChatSidebar: () => void;
  
  setSelectedTab: (tab: 'overview' | 'pricing' | 'capabilities') => void;
  setSelectedGenerationId: (id: string | undefined) => void;
  setHoveredGenerationId: (id: string | undefined) => void;
  setScrollToCompletionId: (id: string | undefined) => void;
  
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setIsMobile: (mobile: boolean) => void;
  
  // Complex actions
  showModelDetails: (model: ModelInfo, tab?: 'overview' | 'pricing' | 'capabilities', generationId?: string) => void;
  closeDetailsSidebar: () => void;
  handleModelClickFromMessage: (modelId: string, tab?: 'overview' | 'pricing' | 'capabilities', generationId?: string) => void;
  handleGenerationClick: (generationId: string) => void;
}
