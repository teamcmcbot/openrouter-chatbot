"use client";

import { create } from 'zustand';
import { persist, createJSONStorage, subscribeWithSelector, devtools } from 'zustand/middleware';
import { useEffect } from 'react';
import { ModelInfo } from '../lib/types/openrouter';
import { ModelState, ModelSelectors, CachedModelData, isEnhancedModels } from './types/model';
import { STORAGE_KEYS, CACHE_CONFIG } from '../lib/constants';
import { createLogger } from './storeUtils';
import { useAuth } from './useAuthStore';
import { useUserData } from '../hooks/useUserData';

const logger = createLogger('ModelStore');

// Utility function to reorder models putting user's default model first
const reorderModelsWithDefault = (
  models: ModelInfo[] | string[],
  defaultModel: string | null
): ModelInfo[] | string[] => {
  if (!defaultModel || models.length === 0) {
    return models;
  }

  // Check if default model exists in the current model list
  const modelExists = isEnhancedModels(models)
    ? models.some(model => model.id === defaultModel)
    : models.includes(defaultModel);

  if (!modelExists) {
    logger.info('User default model not found in current model list', { 
      defaultModel, 
      availableModels: models.length 
    });
    return models;
  }

  // Move default model to the front
  if (isEnhancedModels(models)) {
    const enhancedModels = models as ModelInfo[];
    const defaultModelData = enhancedModels.find(model => model.id === defaultModel);
    const otherModels = enhancedModels.filter(model => model.id !== defaultModel);
    
    if (defaultModelData) {
      logger.info('Reordered models with user default model first', { defaultModel });
      return [defaultModelData, ...otherModels];
    }
    return models;
  } else {
    const stringModels = models as string[];
    const otherModels = stringModels.filter(modelId => modelId !== defaultModel);
    logger.info('Reordered models with user default model first', { defaultModel });
    return [defaultModel, ...otherModels];
  }
};

// Cache utilities
const getCachedData = (): CachedModelData | null => {
  if (typeof window === 'undefined') return null;
  
  try {
    const cached = localStorage.getItem(STORAGE_KEYS.MODELS);
    if (!cached) return null;
    
    const data: CachedModelData = JSON.parse(cached);
    
    // Check version compatibility
    if (data.version !== CACHE_CONFIG.CACHE_VERSION) {
      logger.info('Cache version mismatch, invalidating cache');
      localStorage.removeItem(STORAGE_KEYS.MODELS);
      return null;
    }
    
    // Check if cache is still valid
    const now = Date.now();
    const cacheAge = now - data.timestamp;
    const cacheTTL = CACHE_CONFIG.MODEL_TTL_HOURS * 60 * 60 * 1000;
    
    if (cacheAge > cacheTTL) {
      logger.info('Cache expired, invalidating cache');
      localStorage.removeItem(STORAGE_KEYS.MODELS);
      return null;
    }
    
    return data;
  } catch (error) {
    logger.error('Failed to read cached model data', { error });
    localStorage.removeItem(STORAGE_KEYS.MODELS);
    return null;
  }
};

const setCachedData = (models: ModelInfo[] | string[], isEnhanced: boolean): void => {
  if (typeof window === 'undefined') return;
  
  try {
    // Extract model configurations for token limit caching
    const modelConfigs: Record<string, { context_length: number; description: string }> = {};
    
    if (isEnhanced && isEnhancedModels(models)) {
      // Enhanced models contain full model info including context_length
      models.forEach(model => {
        modelConfigs[model.id] = {
          context_length: model.context_length || 8192,
          description: model.name || model.id
        };
      });
      logger.info('Extracted model configurations for token limits', { configCount: Object.keys(modelConfigs).length });
    }
    
    const cacheData: CachedModelData = {
      models,
      isEnhanced,
      timestamp: Date.now(),
      version: CACHE_CONFIG.CACHE_VERSION,
      modelConfigs,
    };
    
    localStorage.setItem(STORAGE_KEYS.MODELS, JSON.stringify(cacheData));
    logger.info('Model data cached successfully', { 
      modelCount: models.length, 
      isEnhanced,
      configCount: Object.keys(modelConfigs).length,
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    logger.error('Failed to cache model data', { error });
  }
};

// Background refresh management
let refreshInterval: NodeJS.Timeout | null = null;

const setupBackgroundRefresh = (refreshFn: () => Promise<void>) => {
  if (typeof window === 'undefined') return;
  
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  
  refreshInterval = setInterval(() => {
    logger.debug('Background refresh triggered');
    refreshFn().catch((error) => {
      logger.error('Background refresh failed', { error });
    });
  }, CACHE_CONFIG.BACKGROUND_REFRESH_INTERVAL);
  
  logger.info('Background refresh started', {
    interval: CACHE_CONFIG.BACKGROUND_REFRESH_INTERVAL
  });
};

const stopBackgroundRefresh = () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
    logger.info('Background refresh stopped');
  }
};

// API fetch function with enhanced mode detection
const fetchModelsFromAPI = async (): Promise<{ models: ModelInfo[] | string[], isEnhanced: boolean }> => {
  logger.debug('Fetching models from API');
  
  // First, try enhanced mode
  try {
    const enhancedResponse = await fetch('/api/models?enhanced=true');
    if (enhancedResponse.ok) {
      const enhancedData = await enhancedResponse.json();
      if (enhancedData.models && enhancedData.models.length > 0) {
        // Check if the first model has enhanced properties
        const firstModel = enhancedData.models[0];
        if (typeof firstModel === 'object' && firstModel.description) {
          logger.info('Enhanced mode detected and working');
          return { models: enhancedData.models, isEnhanced: true };
        }
      }
    }
  } catch (error) {
    logger.warn('Enhanced mode failed, falling back to basic mode', { error });
  }
  
  // Fall back to basic mode
  logger.info('Using basic mode');
  const response = await fetch('/api/models');
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  const data = await response.json();
  return { models: data.models || [], isEnhanced: false };
};

// Create the store
export const useModelStore = create<ModelState & ModelSelectors>()(
  devtools(
    subscribeWithSelector(
      persist(
        (set, get) => ({
          // Initial state
          models: [],
          selectedModel: '',
          isLoading: false,
          error: null,
          isEnhanced: false, // Will be determined by API response
          lastUpdated: null,
          isHydrated: false,
          isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
          backgroundRefreshEnabled: false,
          modelConfigs: {},

          // Actions
          fetchModels: async (userDefaultModel?: string | null) => {
            const state = get();
            if (state.isLoading) {
              logger.info('Fetch already in progress, skipping duplicate request');
              return;
            }

            set({ isLoading: true, error: null });

            try {
              // Try to use cached data if available and valid
              const cachedData = getCachedData();
              
              if (cachedData && cachedData.isEnhanced === state.isEnhanced) {
                logger.info('Using cached model data');
                
                // Apply user default model reordering to cached data
                let orderedModels = cachedData.models;
                if (userDefaultModel) {
                  orderedModels = reorderModelsWithDefault(cachedData.models, userDefaultModel);
                  logger.info('Applied user default model ordering to cached data', { userDefaultModel });
                }
                
                // Auto-select user's default model if authenticated and model exists, otherwise first model
                let selectedModelId = state.selectedModel;
                
                if (userDefaultModel && orderedModels.length > 0) {
                  // Check if user's default model exists in the list
                  const defaultModelExists = isEnhancedModels(orderedModels)
                    ? orderedModels.some(model => model.id === userDefaultModel)
                    : orderedModels.includes(userDefaultModel);
                  
                  if (defaultModelExists) {
                    selectedModelId = userDefaultModel;
                    logger.info('Auto-selected user default model', { defaultModel: userDefaultModel });
                  }
                } else if (!selectedModelId && orderedModels.length > 0) {
                  // Fallback to first model if no selection exists
                  selectedModelId = typeof orderedModels[0] === 'string' ? orderedModels[0] : orderedModels[0].id;
                  logger.info('Auto-selected first model from cache', { modelId: selectedModelId });
                }
                
                set({
                  models: orderedModels,
                  selectedModel: selectedModelId,
                  isLoading: false,
                  lastUpdated: new Date(cachedData.timestamp),
                  modelConfigs: cachedData.modelConfigs || {},
                });
                
                // If we have cached data but it's getting old, refresh in background
                const cacheAge = Date.now() - cachedData.timestamp;
                const refreshThreshold = (CACHE_CONFIG.MODEL_TTL_HOURS * 60 * 60 * 1000) * 0.8; // 80% of TTL
                
                if (cacheAge > refreshThreshold && state.isOnline) {
                  logger.info('Cache is getting old, refreshing in background');
                  setTimeout(() => get().refreshModels(userDefaultModel), 100); // Pass userDefaultModel to refresh too
                }
                
                return;
              }

              // Fetch fresh data
              logger.info('Fetching fresh model data');
              const result = await fetchModelsFromAPI();
              
              // Apply user default model reordering to fresh data
              let orderedModels = result.models;
              if (userDefaultModel) {
                orderedModels = reorderModelsWithDefault(result.models, userDefaultModel);
                logger.info('Applied user default model ordering to fresh data', { userDefaultModel });
              }
              
              // Cache the original (non-reordered) data to maintain consistency
              setCachedData(result.models, result.isEnhanced);
              
              // Auto-select user's default model if authenticated and model exists, otherwise first model
              let selectedModelId = state.selectedModel;
              
              if (userDefaultModel && orderedModels.length > 0) {
                // Check if user's default model exists in the list
                const defaultModelExists = isEnhancedModels(orderedModels)
                  ? orderedModels.some(model => model.id === userDefaultModel)
                  : orderedModels.includes(userDefaultModel);
                
                if (defaultModelExists) {
                  selectedModelId = userDefaultModel;
                  logger.info('Auto-selected user default model', { defaultModel: userDefaultModel });
                }
              } else if (!selectedModelId && orderedModels.length > 0) {
                // Fallback to first model if no selection exists
                selectedModelId = typeof orderedModels[0] === 'string' ? orderedModels[0] : orderedModels[0].id;
                logger.info('Auto-selected first model', { modelId: selectedModelId });
              }
              
              // Extract model configurations for token limits from fresh data
              const modelConfigs: Record<string, { context_length: number; description: string }> = {};
              if (result.isEnhanced && isEnhancedModels(result.models)) {
                result.models.forEach(model => {
                  modelConfigs[model.id] = {
                    context_length: model.context_length || 8192,
                    description: model.name || model.id
                  };
                });
              }
              
              set({
                models: orderedModels, // Use reordered models for display
                selectedModel: selectedModelId,
                isEnhanced: result.isEnhanced,
                isLoading: false,
                lastUpdated: new Date(),
                error: null,
                modelConfigs,
              });

              logger.info('Models fetched successfully', {
                count: orderedModels.length,
                isEnhanced: result.isEnhanced,
                selectedModel: selectedModelId,
                userDefaultApplied: !!userDefaultModel
              });

            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              logger.error('Failed to fetch models', { error });
              
              // If we have cached data (even if expired), use it as fallback
              const cachedData = getCachedData();
              if (cachedData) {
                logger.info('Using expired cache as fallback');
                
                // Apply user default model reordering to fallback cached data
                let orderedModels = cachedData.models;
                if (userDefaultModel) {
                  orderedModels = reorderModelsWithDefault(cachedData.models, userDefaultModel);
                  logger.info('Applied user default model ordering to fallback cache', { userDefaultModel });
                }
                
                // Auto-select user's default model if authenticated and model exists, otherwise first model
                let selectedModelId = state.selectedModel;
                
                if (userDefaultModel && orderedModels.length > 0) {
                  const defaultModelExists = isEnhancedModels(orderedModels)
                    ? orderedModels.some(model => model.id === userDefaultModel)
                    : orderedModels.includes(userDefaultModel);
                  
                  if (defaultModelExists) {
                    selectedModelId = userDefaultModel;
                    logger.info('Auto-selected user default model from fallback', { defaultModel: userDefaultModel });
                  }
                } else if (!selectedModelId && orderedModels.length > 0) {
                  selectedModelId = typeof orderedModels[0] === 'string' ? orderedModels[0] : orderedModels[0].id;
                  logger.info('Auto-selected first model from fallback cache', { modelId: selectedModelId });
                }
                
                set({
                  models: orderedModels,
                  selectedModel: selectedModelId,
                  isLoading: false,
                  error: errorMessage,
                  lastUpdated: new Date(cachedData.timestamp),
                  modelConfigs: cachedData.modelConfigs || {},
                });
              } else {
                set({
                  isLoading: false,
                  error: errorMessage,
                });
              }
            }
          },

          refreshModels: async (userDefaultModel?: string | null) => {
            const state = get();
            
            if (!state.isOnline) {
              logger.warn('Cannot refresh models while offline');
              return;
            }

            logger.info('Refreshing models data');
            set({ error: null });

            try {
              const result = await fetchModelsFromAPI();
              
              // Apply user default model reordering to refreshed data
              let orderedModels = result.models;
              if (userDefaultModel) {
                orderedModels = reorderModelsWithDefault(result.models, userDefaultModel);
                logger.info('Applied user default model ordering to refreshed data', { userDefaultModel });
              }
              
              // Cache the original (non-reordered) data
              setCachedData(result.models, result.isEnhanced);
              
              // Extract model configurations for token limits from refresh data
              const modelConfigs: Record<string, { context_length: number; description: string }> = {};
              if (result.isEnhanced && isEnhancedModels(result.models)) {
                result.models.forEach(model => {
                  modelConfigs[model.id] = {
                    context_length: model.context_length || 8192,
                    description: model.name || model.id
                  };
                });
              }
              
              set({
                models: orderedModels, // Use reordered models for display
                isEnhanced: result.isEnhanced,
                lastUpdated: new Date(),
                error: null,
                modelConfigs,
              });

              logger.info('Models refreshed successfully', {
                count: orderedModels.length,
                userDefaultApplied: !!userDefaultModel
              });

            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              logger.error('Failed to refresh models', { error });
              
              set({ error: errorMessage });
            }
          },

          setSelectedModel: (modelId: string) => {
            const state = get();
            
            // Validate that the model exists in available models
            const modelExists = isEnhancedModels(state.models)
              ? state.models.some(model => model.id === modelId)
              : state.models.includes(modelId);

            if (!modelExists && state.models.length > 0) {
              logger.warn('Selected model not found, falling back to first available', {
                selectedModel: modelId,
                availableCount: state.models.length
              });
              
              const firstModelId = isEnhancedModels(state.models) 
                ? state.models[0].id 
                : state.models[0];
              
              set({ selectedModel: firstModelId });
              return;
            }

            set({ selectedModel: modelId });
            logger.debug('Model selected', { modelId });
          },

          clearError: () => {
            set({ error: null });
          },

          setOnlineStatus: (online: boolean) => {
            const wasOffline = !get().isOnline;
            set({ isOnline: online });
            
            if (wasOffline && online) {
              logger.info('Back online, checking for model updates');
              // When coming back online, check if we need to refresh
              if (get().isRefreshNeeded()) {
                setTimeout(() => get().refreshModels(), 1000);
              }
            }
          },

          startBackgroundRefresh: () => {
            const state = get();
            if (!state.backgroundRefreshEnabled) {
              set({ backgroundRefreshEnabled: true });
              setupBackgroundRefresh(get().refreshModels);
            }
          },

          stopBackgroundRefresh: () => {
            set({ backgroundRefreshEnabled: false });
            stopBackgroundRefresh();
          },

          clearCache: () => {
            if (typeof window !== 'undefined') {
              localStorage.removeItem(STORAGE_KEYS.MODELS);
              logger.info('Model cache cleared');
            }
            set({ 
              models: [], 
              lastUpdated: null,
              error: null,
              modelConfigs: {},
            });
          },

          _hasHydrated: () => {
            set({ isHydrated: true });
          },

          // Selectors
          getModelById: (id: string) => {
            const { models } = get();
            if (isEnhancedModels(models)) {
              return models.find(model => model.id === id);
            } else {
              return models.find(modelId => modelId === id);
            }
          },

          getAvailableModels: () => {
            return get().models;
          },

          getSelectedModelInfo: () => {
            const { selectedModel } = get();
            if (!selectedModel) return undefined;
            return get().getModelById(selectedModel);
          },

          getModelCount: () => {
            return get().models.length;
          },

          isCacheValid: () => {
            const { lastUpdated } = get();
            if (!lastUpdated) return false;
            
            const now = Date.now();
            const updateTime = lastUpdated.getTime();
            const cacheAge = now - updateTime;
            const cacheTTL = CACHE_CONFIG.MODEL_TTL_HOURS * 60 * 60 * 1000;
            
            return cacheAge < cacheTTL;
          },

          isRefreshNeeded: () => {
            const state = get();
            if (!state.isOnline) return false;
            if (state.models.length === 0) return true;
            if (!state.isCacheValid()) return true;
            
            // Check if cache is getting old (80% of TTL)
            if (state.lastUpdated) {
              const cacheAge = Date.now() - state.lastUpdated.getTime();
              const refreshThreshold = (CACHE_CONFIG.MODEL_TTL_HOURS * 60 * 60 * 1000) * 0.8;
              return cacheAge > refreshThreshold;
            }
            
            return false;
          },

          getModelConfig: (modelId: string) => {
            const { modelConfigs } = get();
            return modelConfigs[modelId];
          },

          getAllModelConfigs: () => {
            return get().modelConfigs;
          },
        }),
        {
          name: STORAGE_KEYS.MODELS,
          storage: createJSONStorage(() => localStorage),
          partialize: (state) => ({
            selectedModel: state.selectedModel,
            isEnhanced: state.isEnhanced,
            backgroundRefreshEnabled: state.backgroundRefreshEnabled,
          }),
          onRehydrateStorage: () => (state) => {
            state?._hasHydrated();
          },
        }
      )
    ),
    {
      name: 'model-store',
    }
  )
);

// Online/offline detection
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useModelStore.getState().setOnlineStatus(true);
  });
  
  window.addEventListener('offline', () => {
    useModelStore.getState().setOnlineStatus(false);
  });
}

// Auto-start background refresh when store is created (client-side only)
if (typeof window !== 'undefined') {
  // Delay to ensure store is properly initialized
  setTimeout(() => {
    const state = useModelStore.getState();
    if (state.backgroundRefreshEnabled) {
      state.startBackgroundRefresh();
    }
  }, 1000);
}

// Backward compatibility hooks
export const useModelData = () => {
  const {
    models,
    isLoading,
    error,
    isEnhanced,
    lastUpdated,
    refreshModels,
    isHydrated,
    fetchModels,
  } = useModelStore();

  const { user } = useAuth();
  const { data: userData } = useUserData({ enabled: !!user });

  // Get user's default model from profile
  const userDefaultModel = userData?.preferences?.model?.default_model || null;

  // Initialize models when hydrated with user default model consideration
  useEffect(() => {
    if (isHydrated && models.length === 0 && !isLoading) {
      logger.info('Initializing model data on mount', { 
        isAuthenticated: !!user, 
        userDefaultModel 
      });
      fetchModels(userDefaultModel);
    }
  }, [isHydrated, models.length, isLoading, fetchModels, user, userDefaultModel]);

  // Re-fetch and reorder when user's default model changes
  useEffect(() => {
    if (isHydrated && models.length > 0 && user && userDefaultModel) {
      logger.info('User default model changed, re-ordering models', { userDefaultModel });
      fetchModels(userDefaultModel);
    }
  }, [userDefaultModel, isHydrated, user, fetchModels, models.length]);

  // Don't return data until hydrated to prevent SSR mismatch
  if (!isHydrated) {
    return {
      models: [],
      loading: false,
      error: null,
      isEnhanced: false,
      refresh: async () => {},
      lastUpdated: null,
    };
  }

  return {
    models,
    loading: isLoading,
    error: error ? new Error(error) : null,
    isEnhanced,
    refresh: () => refreshModels(userDefaultModel),
    lastUpdated,
  };
};

export const useModelSelection = () => {
  const {
    models: availableModels,
    selectedModel,
    setSelectedModel,
    isLoading,
    error,
    isEnhanced,
    refreshModels,
    lastUpdated,
    isHydrated,
    fetchModels,
  } = useModelStore();

  const { user } = useAuth();
  const { data: userData } = useUserData({ enabled: !!user });

  // Get user's default model from profile
  const userDefaultModel = userData?.preferences?.model?.default_model || null;

  // Auto-fetch models when hydrated with user default model consideration
  useEffect(() => {
    if (isHydrated && availableModels.length === 0 && !isLoading) {
      logger.info('Initializing model data on mount', { 
        isAuthenticated: !!user, 
        userDefaultModel 
      });
      fetchModels(userDefaultModel);
    }
  }, [isHydrated, availableModels.length, isLoading, fetchModels, user, userDefaultModel]);

  // Re-fetch and reorder when user's default model changes
  useEffect(() => {
    if (isHydrated && availableModels.length > 0 && user && userDefaultModel) {
      logger.info('User default model changed, re-ordering models', { userDefaultModel });
      fetchModels(userDefaultModel);
    }
  }, [userDefaultModel, isHydrated, user, fetchModels, availableModels.length]);

  // Don't return data until hydrated to prevent SSR mismatch
  if (!isHydrated) {
    return {
      availableModels: [],
      selectedModel: '',
      setSelectedModel: () => {},
      isLoading: false,
      error: null,
      isEnhanced: false,
      refreshModels: async () => {},
      lastUpdated: null,
    };
  }

  return {
    availableModels,
    selectedModel,
    setSelectedModel,
    isLoading,
    error: error ? new Error(error) : null,
    isEnhanced,
    refreshModels: () => refreshModels(userDefaultModel),
    lastUpdated,
  };
};

// Utility function for external modules to access model configurations
export const getModelConfigFromStore = (modelId: string): { context_length: number; description: string } | null => {
  const state = useModelStore.getState();
  return state.getModelConfig(modelId) || null;
};

export const getAllModelConfigsFromStore = (): Record<string, { context_length: number; description: string }> => {
  const state = useModelStore.getState();
  return state.getAllModelConfigs();
};

// Check if model configurations are available in store
export const hasModelConfigsInStore = (): boolean => {
  const state = useModelStore.getState();
  const configs = state.getAllModelConfigs();
  return Object.keys(configs).length > 0;
};
