// stores/useSettingsStore.ts

import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { STORAGE_KEYS } from '../lib/constants';
import { createDevtoolsOptions } from './storeUtils';
import { BaseStoreState, BaseStoreActions } from './types';

/**
 * Settings store state interface
 */
interface SettingsState extends BaseStoreState {
  // Generic key-value storage for settings
  settings: Record<string, unknown>;
}

/**
 * Settings store actions interface
 */
interface SettingsActions extends BaseStoreActions {
  setSetting: <T>(key: string, value: T) => void;
  getSetting: <T>(key: string, defaultValue?: T) => T | undefined;
  removeSetting: (key: string) => void;
  clearAllSettings: () => void;
  importSettings: (newSettings: Record<string, unknown>) => void;
  exportSettings: () => Record<string, unknown>;
}

/**
 * Complete settings store interface
 */
export type SettingsStore = SettingsState & SettingsActions;

/**
 * Default state for settings store
 */
const defaultState: SettingsState = {
  settings: {},
  isHydrated: false,
  error: null,
  lastUpdated: null,
};

/**
 * Settings store implementation
 */
export const useSettingsStore = create<SettingsStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...defaultState,

        // Actions
        setSetting: <T>(key: string, value: T) => {
          set((state) => ({
            settings: {
              ...state.settings,
              [key]: value,
            },
            lastUpdated: new Date(),
            error: null,
          }));
        },

        getSetting: <T>(key: string, defaultValue?: T): T | undefined => {
          const { settings } = get();
          const value = settings[key];
          return value !== undefined ? (value as T) : defaultValue;
        },

        removeSetting: (key: string) => {
          set((state) => {
            const newSettings = { ...state.settings };
            delete newSettings[key];
            return {
              settings: newSettings,
              lastUpdated: new Date(),
              error: null,
            };
          });
        },

        clearAllSettings: () => {
          set({
            settings: {},
            lastUpdated: new Date(),
            error: null,
          });
        },

        importSettings: (newSettings: Record<string, unknown>) => {
          set((state) => ({
            settings: {
              ...state.settings,
              ...newSettings,
            },
            lastUpdated: new Date(),
            error: null,
          }));
        },

        exportSettings: () => {
          return get().settings;
        },

        // Base actions
        _hasHydrated: () => {
          set({ isHydrated: true });
        },

        clearError: () => {
          set({ error: null });
        },

        reset: () => {
          set(defaultState);
        },
      }),
      {
        name: STORAGE_KEYS.SETTINGS,
        storage: {
          getItem: (name: string) => {
            if (typeof window === 'undefined') return null;
            try {
              const value = localStorage.getItem(name);
              return value ? JSON.parse(value) : null;
            } catch {
              return null;
            }
          },
          setItem: (name: string, value: unknown) => {
            if (typeof window === 'undefined') return;
            try {
              localStorage.setItem(name, JSON.stringify(value));
            } catch (error) {
              console.warn(`Failed to save settings:`, error);
            }
          },
          removeItem: (name: string) => {
            if (typeof window === 'undefined') return;
            try {
              localStorage.removeItem(name);
            } catch (error) {
              console.warn(`Failed to remove settings:`, error);
            }
          },
        },
        partialize: (state) => ({
          settings: state.settings,
        }),
        onRehydrateStorage: () => (state) => {
          state?._hasHydrated();
        },
      }
    ),
    createDevtoolsOptions('settings-store')
  )
);

/**
 * Backward compatible useLocalStorage hook
 * This provides the same API as the original useLocalStorage hook
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((val: T) => T)) => void] {
  const setSetting = useSettingsStore((state) => state.setSetting);
  
  // Subscribe to the specific setting we care about
  const storedValue = useSettingsStore((state) => {
    if (!state.isHydrated) return initialValue;
    const value = state.settings[key];
    return value !== undefined ? (value as T) : initialValue;
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      // Allow value to be a function so we have the same API as useState
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setSetting(key, valueToStore);
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue];
}
