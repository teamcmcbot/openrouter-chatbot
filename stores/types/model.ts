import { ModelInfo } from '../../lib/types/openrouter';

export interface CachedModelData {
  models: ModelInfo[] | string[];
  isEnhanced: boolean;
  timestamp: number;
  version: number;
}

export interface ModelState {
  // State
  models: ModelInfo[] | string[];
  selectedModel: string;
  isLoading: boolean;
  error: string | null;
  isEnhanced: boolean;
  lastUpdated: Date | null;
  isHydrated: boolean;
  isOnline: boolean;
  backgroundRefreshEnabled: boolean;

  // Actions
  fetchModels: () => Promise<void>;
  refreshModels: () => Promise<void>;
  setSelectedModel: (modelId: string) => void;
  clearError: () => void;
  setOnlineStatus: (online: boolean) => void;
  startBackgroundRefresh: () => void;
  stopBackgroundRefresh: () => void;
  clearCache: () => void;

  // Internal
  _hasHydrated: () => void;
}

export interface ModelSelectors {
  // Computed state selectors
  getModelById: (id: string) => ModelInfo | string | undefined;
  getAvailableModels: () => ModelInfo[] | string[];
  getSelectedModelInfo: () => ModelInfo | string | undefined;
  getModelCount: () => number;
  isCacheValid: () => boolean;
  isRefreshNeeded: () => boolean;
}

// Type guards
export const isEnhancedModels = (models: ModelInfo[] | string[]): models is ModelInfo[] => {
  return models.length > 0 && typeof models[0] === 'object' && 'name' in models[0];
};

export const isModelInfo = (model: ModelInfo | string | undefined): model is ModelInfo => {
  return typeof model === 'object' && model !== null && 'name' in model;
};
