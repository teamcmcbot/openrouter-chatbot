import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../stores/useAuthStore';
import { fetchUserData, updateUserPreferences } from '../lib/services/user-data';
import type { UserDataResponse, UserPreferencesUpdate } from '../lib/types/user-data';

interface UseUserDataOptions {
  enabled?: boolean;
}

interface UseUserDataReturn {
  data: UserDataResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updatePreferences: (preferences: UserPreferencesUpdate) => Promise<void>;
  forceRefresh: () => Promise<void>;
}

/**
 * Custom hook for managing user data fetching and updates
 * Includes caching to prevent duplicate API calls for the same user
 * 
 * @param options - Configuration options for the hook
 * @param options.enabled - Whether the hook should automatically fetch data (default: true)
 * @returns Object containing data, loading state, error state, and update functions
 */
export function useUserData(options: UseUserDataOptions = {}): UseUserDataReturn {
  const { enabled = true } = options;
  const { user } = useAuth();
  const [data, setData] = useState<UserDataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedUserId, setLastFetchedUserId] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user?.id || !enabled) {
      return;
    }

    // Prevent duplicate fetches for the same user
    if (isFetching) {
      return;
    }

    // Check if we already have data for this user
    if (lastFetchedUserId === user.id && data) {
      return;
    }

    setIsFetching(true);
    setLoading(true);
    setError(null);

    try {
      const currentUserId = user.id;
      
      // Only proceed if user hasn't changed during the async operation
      if (!user?.id || user.id !== currentUserId) {
        return;
      }

      const userData = await fetchUserData();
      
      // Double-check user hasn't changed during fetch
      if (user?.id === currentUserId) {
        setData(userData);
        setLastFetchedUserId(currentUserId);
        setError(null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch user data';
      setError(errorMessage);
      setData(null);
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  }, [user?.id, enabled, data, lastFetchedUserId, isFetching]);

  // Force refresh function that bypasses cache
  const forceRefresh = useCallback(async () => {
    if (!user?.id) {
      return;
    }

    // Clear cache and force new fetch
    setLastFetchedUserId(null);
    setData(null);
    setIsFetching(false);
    
    // Trigger fresh fetch
    await fetchData();
  }, [user?.id, fetchData]);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  const updatePreferences = useCallback(async (preferences: UserPreferencesUpdate) => {
    if (!user?.id) {
      throw new Error('User not authenticated');
    }

    setLoading(true);
    setError(null);

    try {
      const updatedData = await updateUserPreferences(preferences);
      setData(updatedData);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update preferences';
      setError(errorMessage);
      throw err; // Re-throw to allow component-level error handling
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Effect to handle user changes and authentication state
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const currentUserId = user?.id;

    if (currentUserId) {
      // User is authenticated
      if (lastFetchedUserId !== currentUserId) {
        // User changed or first load - fetch data
        fetchData();
      }
    } else {
      // User logged out - clear data
      setData(null);
      setError(null);
      setLastFetchedUserId(null);
      setLoading(false);
      setIsFetching(false);
    }
  }, [user?.id, enabled, fetchData, lastFetchedUserId]);

  return {
    data,
    loading,
    error,
    refetch,
    updatePreferences,
    forceRefresh,
  };
}
