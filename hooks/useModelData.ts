import { useState, useEffect, useCallback, useRef } from 'react';
import { ModelInfo } from '../lib/types/openrouter';
import { logger } from '../lib/utils/logger';
import { isEnhancedModelsEnabled } from '../lib/utils/env';

// Types
interface ModelDataState {
  models: ModelInfo[] | string[];
  loading: boolean;
  error: Error | null;
  isEnhanced: boolean;
  lastUpdated: Date | null;
}

interface CachedModelData {
  models: ModelInfo[] | string[];
  isEnhanced: boolean;
  timestamp: number;
  version: number;
}

// Constants
const CACHE_KEY = 'openrouter-models-cache';
const CACHE_TTL_HOURS = 24;
const CACHE_VERSION = 1;
const BACKGROUND_REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds

// Cache utilities
function getCachedData(): CachedModelData | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const data: CachedModelData = JSON.parse(cached);
    
    // Check version compatibility
    if (data.version !== CACHE_VERSION) {
      logger.info('Cache version mismatch, invalidating cache');
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    
    // Check if cache is still valid
    const now = Date.now();
    const cacheAge = now - data.timestamp;
    const cacheTTL = CACHE_TTL_HOURS * 60 * 60 * 1000;
    
    if (cacheAge > cacheTTL) {
      logger.info('Cache expired, invalidating cache');
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    
    return data;
  } catch (error) {
    logger.error('Failed to read cached model data:', error);
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
}

function setCachedData(models: ModelInfo[] | string[], isEnhanced: boolean): void {
  try {
    const cacheData: CachedModelData = {
      models,
      isEnhanced,
      timestamp: Date.now(),
      version: CACHE_VERSION,
    };
    
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    logger.info('Model data cached successfully', { 
      modelCount: models.length, 
      isEnhanced,
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    logger.error('Failed to cache model data:', error);
  }
}

function clearCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
    logger.info('Model cache cleared');
  } catch (error) {
    logger.error('Failed to clear model cache:', error);
  }
}

// Background refresh using Web Worker (if available)
let backgroundRefreshWorker: Worker | null = null;

function initializeBackgroundRefresh(onRefresh: () => void): void {
  // Check if Web Workers are available
  if (typeof Worker === 'undefined') {
    logger.info('Web Workers not available, using fallback refresh strategy');
    return;
  }
  
  try {
    // Create inline worker for background refresh
    const workerCode = `
      let intervalId;
      
      self.onmessage = function(e) {
        if (e.data.type === 'START_REFRESH') {
          const interval = e.data.interval || ${BACKGROUND_REFRESH_INTERVAL};
          intervalId = setInterval(() => {
            self.postMessage({ type: 'REFRESH_TRIGGER' });
          }, interval);
        } else if (e.data.type === 'STOP_REFRESH') {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
        }
      };
    `;
    
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    backgroundRefreshWorker = new Worker(URL.createObjectURL(blob));
    
    backgroundRefreshWorker.onmessage = (e) => {
      if (e.data.type === 'REFRESH_TRIGGER') {
        onRefresh();
      }
    };
    
    // Start background refresh
    backgroundRefreshWorker.postMessage({ 
      type: 'START_REFRESH',
      interval: BACKGROUND_REFRESH_INTERVAL 
    });
    
    logger.info('Background refresh worker initialized');
  } catch (error) {
    logger.error('Failed to initialize background refresh worker:', error);
    backgroundRefreshWorker = null;
  }
}

function cleanupBackgroundRefresh(): void {
  if (backgroundRefreshWorker) {
    backgroundRefreshWorker.postMessage({ type: 'STOP_REFRESH' });
    backgroundRefreshWorker.terminate();
    backgroundRefreshWorker = null;
    logger.info('Background refresh worker cleaned up');
  }
}

export function useModelData() {
  const [state, setState] = useState<ModelDataState>({
    models: [],
    loading: true,
    error: null,
    isEnhanced: false,
    lastUpdated: null,
  });
  
  const backgroundRefreshRef = useRef<NodeJS.Timeout | null>(null);
  const isActiveRef = useRef(true);
  
  const fetchModels = useCallback(async (isBackgroundRefresh = false): Promise<void> => {
    try {
      if (!isBackgroundRefresh) {
        setState(prev => ({ ...prev, loading: true, error: null }));
      }
      
      const enhancedEnabled = isEnhancedModelsEnabled();
      const url = enhancedEnabled ? '/api/models?enhanced=true' : '/api/models';
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Models API responded with ${response.status}`);
      }
      
      const data = await response.json();
      const isEnhanced = response.headers.get('x-enhanced-mode') === 'true';
      
      let models: ModelInfo[] | string[];
      
      if (isEnhanced && 'models' in data && Array.isArray(data.models)) {
        models = data.models as ModelInfo[];
      } else if ('models' in data && Array.isArray(data.models)) {
        models = data.models as string[];
      } else {
        throw new Error('Invalid API response format');
      }
      
      // Cache the fresh data
      setCachedData(models, isEnhanced);
      
      if (isActiveRef.current) {
        setState({
          models,
          loading: false,
          error: null,
          isEnhanced,
          lastUpdated: new Date(),
        });
      }
      
      logger.info('Models fetched successfully', { 
        modelCount: models.length, 
        isEnhanced,
        isBackground: isBackgroundRefresh 
      });
      
    } catch (error) {
      logger.error('Failed to fetch models:', error);
      
      if (isActiveRef.current && !isBackgroundRefresh) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error : new Error('Failed to fetch models'),
        }));
      }
      
      // If this is a background refresh and it fails, we silently continue
      // with cached data to avoid disrupting the user experience
      if (isBackgroundRefresh) {
        logger.info('Background refresh failed, continuing with cached data');
      }
    }
  }, []);
  
  const refresh = useCallback(async (): Promise<void> => {
    await fetchModels(false);
  }, [fetchModels]);
  
  const backgroundRefresh = useCallback(async (): Promise<void> => {
    // Skip refresh if offline
    if (!navigator.onLine) {
      logger.info('Skipping background refresh, device is offline');
      return;
    }

    // Check if we have cached data that's still relatively fresh
    const cached = getCachedData();
    if (cached) {
      const cacheAge = Date.now() - cached.timestamp;
      const refreshThreshold = 30 * 60 * 1000; // 30 minutes
      
      if (cacheAge < refreshThreshold) {
        logger.info('Skipping background refresh, cache is still fresh');
        return;
      }
    }
    
    await fetchModels(true);
  }, [fetchModels]);
  
  // Initialize data on mount
  useEffect(() => {
    isActiveRef.current = true;
    
    // Try to load from cache first
    const cached = getCachedData();
    if (cached) {
      setState({
        models: cached.models,
        loading: false,
        error: null,
        isEnhanced: cached.isEnhanced,
        lastUpdated: new Date(cached.timestamp),
      });
      
      logger.info('Loaded models from cache', { 
        modelCount: cached.models.length, 
        isEnhanced: cached.isEnhanced,
        cacheAge: Date.now() - cached.timestamp 
      });
    }
    
    // Always fetch fresh data, but don't show loading if we have cached data
    const shouldShowLoading = !cached;
    if (shouldShowLoading) {
      fetchModels(false);
    } else {
      // Fetch in background to update cache
      fetchModels(true);
    }
    
    return () => {
      isActiveRef.current = false;
    };
  }, [fetchModels]);
  
  // Set up background refresh
  useEffect(() => {
    // Initialize background refresh with fallback to setTimeout if Web Workers not available
    if (typeof Worker !== 'undefined') {
      initializeBackgroundRefresh(backgroundRefresh);
    } else {
      // Fallback to setTimeout-based refresh
      backgroundRefreshRef.current = setInterval(backgroundRefresh, BACKGROUND_REFRESH_INTERVAL);
    }
    
    return () => {
      if (typeof Worker !== 'undefined') {
        cleanupBackgroundRefresh();
      } else if (backgroundRefreshRef.current) {
        clearInterval(backgroundRefreshRef.current);
        backgroundRefreshRef.current = null;
      }
    };
  }, [backgroundRefresh]);
  
  // Handle visibility change for optimized background refresh
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && isActiveRef.current) {
        // Page became visible, check if we need to refresh
        const cached = getCachedData();
        if (cached) {
          const cacheAge = Date.now() - cached.timestamp;
          const refreshThreshold = 10 * 60 * 1000; // 10 minutes
          
          if (cacheAge > refreshThreshold) {
            logger.info('Page became visible, refreshing stale cache');
            fetchModels(true);
          }
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchModels]);

  // Handle online/offline scenarios for better performance
  useEffect(() => {
    const handleOnline = () => {
      logger.info('Connection restored, checking for stale cache');
      const cached = getCachedData();
      if (cached) {
        const cacheAge = Date.now() - cached.timestamp;
        const refreshThreshold = 5 * 60 * 1000; // 5 minutes when coming back online
        
        if (cacheAge > refreshThreshold) {
          logger.info('Refreshing cache after reconnection');
          fetchModels(true);
        }
      }
    };

    const handleOffline = () => {
      logger.info('Connection lost, pausing background refresh');
      // Background refresh will naturally pause due to network errors
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchModels]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      cleanupBackgroundRefresh();
      if (backgroundRefreshRef.current) {
        clearInterval(backgroundRefreshRef.current);
        backgroundRefreshRef.current = null;
      }
    };
  }, []);
  
  return {
    models: state.models,
    loading: state.loading,
    error: state.error,
    isEnhanced: state.isEnhanced,
    refresh,
    lastUpdated: state.lastUpdated,
    // Additional utility methods
    clearCache,
  };
}
