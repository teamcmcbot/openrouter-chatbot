// stores/useAuthStore.ts

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createClient } from '../lib/supabase/client';
import { createDevtoolsOptions } from './storeUtils';
import { STORAGE_KEYS } from '../lib/constants';
import { AuthStore, AuthState } from './types/auth';
import { logger } from '../lib/utils/logger';

/**
 * Default state for auth store
 */
const defaultState: AuthState = {
  user: null,
  session: null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,
  isHydrated: false,
  error: null,
  lastUpdated: null,
};

/**
 * Auth store implementation using Zustand
 */
export const useAuthStore = create<AuthStore>()(
  devtools(
    (set, get) => ({
      ...defaultState,

      // Actions
      setUser: (user) => {
        set({
          user,
          isAuthenticated: !!user,
          lastUpdated: new Date(),
          error: null,
        });
      },

      setSession: (session) => {
        set({
          session,
          user: session?.user || null,
          isAuthenticated: !!session?.user,
          lastUpdated: new Date(),
          error: null,
        });
      },

      setLoading: (loading) => {
        set({ isLoading: loading });
      },

      setInitialized: (initialized) => {
        set({ isInitialized: initialized });
      },

      signInWithGoogle: async () => {
        try {
          set({ isLoading: true, error: null });
          logger.info('auth.google.signIn.start');
          
          const supabase = createClient();
          if (!supabase) {
            logger.error('auth.google.signIn.client.unavailable');
            return;
          }
          const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: `${window.location.origin}/auth/callback`
            }
          });

          if (error) {
            logger.error('auth.google.signIn.error', { error });
            set({ error: error.message, isLoading: false });
            throw error;
          } else {
            logger.info('auth.google.signIn.initiated', { hasData: !!data });
            // Don't set isLoading to false here as we'll redirect
          }
        } catch (err) {
          logger.error('auth.signIn.unexpected', { err });
          set({ 
            error: err instanceof Error ? err.message : 'An unexpected error occurred',
            isLoading: false 
          });
          throw err;
        }
      },

      signOut: async () => {
        try {
          set({ isLoading: true, error: null });
          logger.info('auth.signOut.start');
          
          const supabase = createClient();
          if (!supabase) {
            logger.error('auth.signOut.client.unavailable');
            set({ isLoading: false });
            return;
          }
          const { error } = await supabase.auth.signOut();
          
          if (error) {
            logger.error('auth.signOut.error', { error });
            set({ error: error.message, isLoading: false });
            throw error;
          }

          // Clear auth state
          get().clearAuth();
          
          // Clear all other stores
          await get().clearAllStores();
          
          logger.info('auth.signOut.completed');
          
          // Redirect to home page
          window.location.href = '/';
        } catch (err) {
          logger.error('auth.signOut.unexpected', { err });
          set({ 
            error: err instanceof Error ? err.message : 'An unexpected error occurred',
            isLoading: false 
          });
          throw err;
        }
      },

      initialize: async () => {
        try {
          const supabase = createClient();
          if (!supabase) {
            logger.error('auth.initialize.client.unavailable');
            return;
          }

          // Get initial session
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          
          if (sessionError) {
            logger.error('auth.session.error', { sessionError });
            set({ error: sessionError.message, isInitialized: true });
            return;
          }

          // Set initial session
          get().setSession(session);

          // Listen for auth changes  
          const { data: { subscription } } = supabase!.auth.onAuthStateChange(
            async (event, session) => {
                const maskedEmail = session?.user?.email
                  ? session.user.email.replace(/(.{2}).+(@.+)/, '$1***$2')
                  : undefined;
                logger.info('auth.state.changed', { event, maskedEmail: maskedEmail ?? null });
              
              get().setSession(session);
              
              if (event === 'SIGNED_OUT') {
                get().clearAuth();
                await get().clearAllStores();
              }
            }
          );

          set({ isInitialized: true, error: null });

          // Return cleanup function
          return () => subscription.unsubscribe();
        } catch (err) {
          logger.error('auth.initialize.error', { err });
          set({ 
            error: err instanceof Error ? err.message : 'Failed to initialize auth',
            isInitialized: true 
          });
        }
      },

      clearAuth: () => {
        set({
          user: null,
          session: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
          lastUpdated: new Date(),
        });
      },

      clearAllStores: async () => {
        try {
          // Import store clearing functions dynamically to avoid circular dependencies
          const { useChatStore } = await import('./useChatStore');
          const { useSettingsStore } = await import('./useSettingsStore');

          // Clear all conversations and chat state
          const chatState = useChatStore.getState();
          // Clear all conversations
          const conversationIds = chatState.conversations.map(conv => conv.id);
          await Promise.all(conversationIds.map(id => chatState.deleteConversation(id)));
          chatState.clearError();

          // Clear settings
          useSettingsStore.getState().clearAllSettings();

          // Clear localStorage for all persisted stores
          // Use actual persistence keys from STORAGE_KEYS, and also remove
          // legacy/devtools labels for safety and backward compatibility.
          const keysToRemove = [
            // Actual persisted keys
            STORAGE_KEYS.CHAT,               // 'openrouter-chat-storage'
            STORAGE_KEYS.MODELS,             // 'openrouter-models-cache' (full cache)
            STORAGE_KEYS.MODELS_PERSIST,     // 'openrouter-models-persist' (persist slice)
            STORAGE_KEYS.UI_PREFERENCES,     // 'openrouter-ui-preferences'
            STORAGE_KEYS.SETTINGS,           // 'openrouter-settings-storage'
            STORAGE_KEYS.GENERATION,         // 'openrouter-generation-cache'
            // Legacy/devtools names (not persisted, but safe to remove)
            'chat-store',
            'model-store',
            'ui-store',
            'settings-store',
            'auth-store'
          ];

      keysToRemove.forEach((key) => {
            try {
              localStorage.removeItem(key);
            } catch (error) {
        logger.warn('auth.clear.localStorage.remove.failed', { key, error });
            }
          });

          // Clear sessionStorage caches (e.g., signed URLs: att:{id})
          try {
            const toDelete: string[] = [];
            for (let i = 0; i < sessionStorage.length; i++) {
              const k = sessionStorage.key(i);
              if (!k) continue;
              // Remove any attachment signed URL cache entries and other app-scoped session items
              if (k.startsWith('att:') || k.startsWith('openrouter-')) {
                toDelete.push(k);
              }
            }
            toDelete.forEach((k) => {
              try { sessionStorage.removeItem(k); } catch {}
            });
          } catch (error) {
            logger.warn('auth.clear.sessionStorage.failed', { error });
          }

          logger.info('auth.clear.completed');
        } catch (error) {
          logger.error('auth.clear.error', { error });
        }
      },

      // Base store actions
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
    createDevtoolsOptions('AuthStore')
  )
);

/**
 * Convenience hooks for specific auth state
 */
export const useAuth = () => {
  const store = useAuthStore();
  return {
    user: store.user,
    isAuthenticated: store.isAuthenticated,
    isLoading: store.isLoading,
    isInitialized: store.isInitialized,
    error: store.error,
    signInWithGoogle: store.signInWithGoogle,
    signOut: store.signOut,
    initialize: store.initialize,
    clearError: store.clearError,
  };
};

export const useAuthUser = () => useAuthStore((state) => state.user);
export const useAuthStatus = () => useAuthStore((state) => ({
  isAuthenticated: state.isAuthenticated,
  isLoading: state.isLoading,
  isInitialized: state.isInitialized,
}));
