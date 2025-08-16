// stores/useAuthStore.ts

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createClient } from '../lib/supabase/client';
import { createDevtoolsOptions } from './storeUtils';
import { STORAGE_KEYS } from '../lib/constants';
import { AuthStore, AuthState } from './types/auth';

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
          console.log('Starting Google sign-in...');
          
          const supabase = createClient();
          const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: `${window.location.origin}/auth/callback`
            }
          });

          if (error) {
            console.error('Google sign-in error:', error);
            set({ error: error.message, isLoading: false });
            throw error;
          } else {
            console.log('Google sign-in initiated:', data);
            // Don't set isLoading to false here as we'll redirect
          }
        } catch (err) {
          console.error('Unexpected error during sign-in:', err);
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
          console.log('Starting sign out...');
          
          const supabase = createClient();
          const { error } = await supabase.auth.signOut();
          
          if (error) {
            console.error('Sign out error:', error);
            set({ error: error.message, isLoading: false });
            throw error;
          }

          // Clear auth state
          get().clearAuth();
          
          // Clear all other stores
          await get().clearAllStores();
          
          console.log('Sign out completed');
          
          // Redirect to home page
          window.location.href = '/';
        } catch (err) {
          console.error('Unexpected error during sign out:', err);
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

          // Get initial session
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          
          if (sessionError) {
            console.error('Session error:', sessionError);
            set({ error: sessionError.message, isInitialized: true });
            return;
          }

          // Set initial session
          get().setSession(session);

          // Listen for auth changes
          const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                const maskedEmail = session?.user?.email
                  ? session.user.email.replace(/(.{2}).+(@.+)/, '$1***$2')
                  : undefined;
                console.log('Auth state changed:', event, maskedEmail, 'at', new Date().toISOString());
              
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
          console.error('Auth initialization error:', err);
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
            STORAGE_KEYS.MODELS,             // 'openrouter-models-cache'
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
              console.warn(`Failed to remove localStorage key "${key}":`, error);
            }
          });

          console.log('All stores and localStorage cleared');
        } catch (error) {
          console.error('Error clearing stores:', error);
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
