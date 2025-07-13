// stores/types/index.ts

/**
 * Common types shared across all stores
 */

/**
 * Base store state interface
 */
export interface BaseStoreState {
  isHydrated: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

/**
 * Store action base interface
 */
export interface BaseStoreActions {
  _hasHydrated: () => void;
  clearError: () => void;
  reset: () => void;
}

/**
 * Generic error types for store operations
 */
export interface StoreError {
  message: string;
  code?: string;
  timestamp?: Date;
}

/**
 * Loading state interface
 */
export interface LoadingState {
  isLoading: boolean;
  loadingMessage?: string;
}

/**
 * Persistence state interface
 */
export interface PersistenceState {
  isPersisted: boolean;
  lastSaved: Date | null;
}

/**
 * Store metadata interface
 */
export interface StoreMetadata {
  version: number;
  createdAt: Date;
  name: string;
}
