// hooks/useUserData.ts
'use client'

import { useState, useEffect, useCallback } from 'react';
import { UserDataResponse, UserPreferencesUpdate } from '../lib/types/user-data';
import { fetchUserData, updateUserPreferences, validatePreferencesUpdate } from '../lib/services/user-data';
import { useAuthStore } from '../stores/useAuthStore';

interface UserDataError {
  message: string;
  code?: string;
  timestamp?: string;
}

interface UseUserDataReturn {
  /** Complete user data including analytics, profile, and preferences */
  data: UserDataResponse | null;
  /** Loading state for initial data fetch */
  loading: boolean;
  /** Error state for data operations */
  error: UserDataError | null;
  /** Loading state for preference updates */
  updating: boolean;
  /** Manually refetch user data */
  refetch: () => Promise<void>;
  /** Update user preferences */
  updatePreferences: (preferences: UserPreferencesUpdate) => Promise<void>;
  /** Clear error state */
  clearError: () => void;
}

/**
 * Hook for managing user data including analytics and preferences
 * Automatically fetches data when user is authenticated
 * Provides methods for updating preferences with optimistic updates
 */
export function useUserData(): UseUserDataReturn {
  const { user, session, isAuthenticated } = useAuthStore();
  const [data, setData] = useState<UserDataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<UserDataError | null>(null);

  /**
   * Fetches user data from API
   */
  const fetchData = useCallback(async () => {
    if (!user || !session || !isAuthenticated) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const userData = await fetchUserData();
      setData(userData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch user data';
      setError({
        message: errorMessage,
        timestamp: new Date().toISOString()
      });
      console.error('Error fetching user data:', err);
    } finally {
      setLoading(false);
    }
  }, [user, session, isAuthenticated]);

  /**
   * Manual refetch function
   */
  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  /**
   * Updates user preferences with optimistic updates
   */
  const updatePreferences = useCallback(async (preferences: UserPreferencesUpdate) => {
    if (!user || !session || !isAuthenticated || !data) {
      throw new Error('User must be authenticated to update preferences');
    }

    try {
      // Validate preferences before sending
      validatePreferencesUpdate(preferences);
      
      setUpdating(true);
      setError(null);

      // Optimistic update - update local state immediately
      const optimisticData: UserDataResponse = {
        ...data,
        preferences: {
          ...data.preferences,
          ...(preferences.ui && { ui: { ...data.preferences.ui, ...preferences.ui } }),
          ...(preferences.session && { session: { ...data.preferences.session, ...preferences.session } }),
          ...(preferences.model && { model: { ...data.preferences.model, ...preferences.model } })
        }
      };
      setData(optimisticData);

      // Send update to server
      const updatedData = await updateUserPreferences(preferences);
      
      // Use server response as source of truth
      setData(updatedData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update preferences';
      setError({
        message: errorMessage,
        code: 'UPDATE_FAILED',
        timestamp: new Date().toISOString()
      });
      
      // Revert optimistic update by refetching data
      await fetchData();
      
      console.error('Error updating preferences:', err);
      throw err; // Re-throw so calling component can handle it
    } finally {
      setUpdating(false);
    }
  }, [user, session, isAuthenticated, data, fetchData]);

  /**
   * Clears error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Fetch data when user authentication state changes
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    updating,
    refetch,
    updatePreferences,
    clearError
  };
}
