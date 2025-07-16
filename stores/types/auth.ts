// stores/types/auth.ts

import { User, Session } from '@supabase/supabase-js'
import { BaseStoreState, BaseStoreActions } from './index'

/**
 * Authentication state interface
 */
export interface AuthState extends BaseStoreState {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
}

/**
 * Authentication actions interface
 */
export interface AuthActions extends BaseStoreActions {
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  initialize: () => Promise<void>;
  clearAuth: () => void;
  clearAllStores: () => Promise<void>;
}

/**
 * Complete auth store interface
 */
export type AuthStore = AuthState & AuthActions;
