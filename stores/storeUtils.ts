// stores/storeUtils.ts

import { StateCreator } from 'zustand';
import { PersistOptions } from 'zustand/middleware';
import { STORE_CONFIG } from '../lib/constants';

/**
 * Utility to check if code is running on server
 */
export const isServer = (): boolean => typeof window === 'undefined';

/**
 * Utility to check if code is running on client
 */
export const isClient = (): boolean => typeof window !== 'undefined';

/**
 * Safe localStorage wrapper that handles SSR
 */
export const safeLocalStorage = {
  getItem: (key: string): string | null => {
    if (isServer()) return null;
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn(`Failed to get localStorage key "${key}":`, error);
      return null;
    }
  },
  
  setItem: (key: string, value: string): void => {
    if (isServer()) return;
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn(`Failed to set localStorage key "${key}":`, error);
    }
  },
  
  removeItem: (key: string): void => {
    if (isServer()) return;
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`Failed to remove localStorage key "${key}":`, error);
    }
  },
};

/**
 * Create SSR-safe persist options
 */
export const createPersistOptions = <T>(
  name: string,
  options?: Partial<PersistOptions<T>>
): PersistOptions<T> => ({
  name,
  storage: {
    getItem: (name: string) => {
      const value = safeLocalStorage.getItem(name);
      return value ? JSON.parse(value) : null;
    },
    setItem: (name: string, value: unknown) => {
      safeLocalStorage.setItem(name, JSON.stringify(value));
    },
    removeItem: (name: string) => {
      safeLocalStorage.removeItem(name);
    },
  },
  ...options,
});

/**
 * Create devtools options based on environment
 */
export const createDevtoolsOptions = (name: string) => ({
  enabled: STORE_CONFIG.DEVTOOLS_ENABLED,
  name,
});

/**
 * Logger middleware for store actions
 */
export const logger = <T>(
  config: StateCreator<T, [], [], T>
): StateCreator<T, [], [], T> => (set, get, api) =>
  config(
    (partial, replace) => {
      if (STORE_CONFIG.DEVTOOLS_ENABLED) {
        console.log('Store action:', { partial, replace });
      }
      if (replace === true) {
        set(partial as T, true);
      } else {
        set(partial);
      }
    },
    get,
    api
  );

/**
 * Create a simple logger for store debugging
 */
export const createLogger = (storeName: string) => {
  type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

  const levelRank: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    silent: 100,
  };

  const parseLevel = (lvl: string | undefined): LogLevel | null => {
    switch ((lvl || '').toLowerCase()) {
      case 'debug':
      case 'info':
      case 'warn':
      case 'error':
      case 'silent':
        return (lvl as LogLevel);
      default:
        return null;
    }
  };

  // Default: in tests, suppress debug/info unless explicitly enabled via LOG_LEVEL.
  // In dev with devtools, default to debug; otherwise default to info.
  const getCurrentLevel = (): LogLevel => {
    const envLevel = parseLevel(process.env.LOG_LEVEL);
    const defaultLevel: LogLevel = process.env.NODE_ENV === 'test'
      ? 'warn'
      : (STORE_CONFIG.DEVTOOLS_ENABLED ? 'debug' : 'info');
    return envLevel ?? defaultLevel;
  };

  const shouldLog = (lvl: LogLevel) => levelRank[lvl] >= levelRank[getCurrentLevel()];

  return {
    debug: (message: string, data?: unknown) => {
      if (shouldLog('debug')) {
  // eslint-disable-next-line no-console
        console.debug(`[${storeName}]`, message, data);
      }
    },
    info: (message: string, data?: unknown) => {
      if (shouldLog('info')) {
  // eslint-disable-next-line no-console
        console.info(`[${storeName}]`, message, data);
      }
    },
    warn: (message: string, data?: unknown) => {
      if (shouldLog('warn')) {
        console.warn(`[${storeName}]`, message, data);
      }
    },
    error: (message: string, data?: unknown) => {
      if (shouldLog('error')) {
        console.error(`[${storeName}]`, message, data);
      }
    },
  };
};

/**
 * Utility to create a store with standard middleware
 */
export interface StoreMiddlewareConfig {
  name: string;
  persist?: boolean;
  persistOptions?: Partial<PersistOptions<Record<string, unknown>>>;
  devtools?: boolean;
  logger?: boolean;
}

/**
 * Type guard to check if a value is a valid state object
 */
export const isValidState = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
};

/**
 * Utility to merge states safely
 */
export const mergeStates = <T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T => ({
  ...target,
  ...source,
});

/**
 * Debounce utility for store actions
 */
export const debounce = <T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

/**
 * Throttle utility for store actions
 */
export const throttle = <T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), wait);
    }
  };
};
