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
  refreshing: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updatePreferences: (preferences: UserPreferencesUpdate) => Promise<void>;
  forceRefresh: () => Promise<void>;
}

// Module-level shared cache and in-flight map to de-duplicate requests across components
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g: any = globalThis as any;
if (!g.__userDataCache) {
  g.__userDataCache = new Map<string, UserDataResponse>();
}
if (!g.__userDataInFlight) {
  g.__userDataInFlight = new Map<string, Promise<UserDataResponse>>();
}
if (!g.__userDataTerminalError) {
  g.__userDataTerminalError = new Map<string, { status: number; message: string }>();
}
const CACHE: Map<string, UserDataResponse> = g.__userDataCache as Map<string, UserDataResponse>;
const IN_FLIGHT: Map<string, Promise<UserDataResponse>> = g.__userDataInFlight as Map<string, Promise<UserDataResponse>>;
const TERMINAL_ERR: Map<string, { status: number; message: string }> = g.__userDataTerminalError as Map<string, { status: number; message: string }>;

async function fetchUserDataShared(userId: string, opts?: { force?: boolean }): Promise<UserDataResponse> {
  const force = opts?.force === true;

  if (!force) {
    // If we previously hit a terminal error (e.g., 403), don't refetch automatically
    const terr = TERMINAL_ERR.get(userId);
    if (terr) {
      throw Object.assign(new Error(terr.message), { status: terr.status });
    }
    const cached = CACHE.get(userId);
    if (cached) return cached;
  }

  const existing = IN_FLIGHT.get(userId);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const result = await fetchUserData();
      // Success clears any terminal error and updates cache
      TERMINAL_ERR.delete(userId);
      CACHE.set(userId, result);
      return result;
    } finally {
      IN_FLIGHT.delete(userId);
    }
  })();

  IN_FLIGHT.set(userId, promise);
  return promise;
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedUserId, setLastFetchedUserId] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  // Track terminal errors per user via shared map; no local state required

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

  const userData = await fetchUserDataShared(currentUserId, { force: false });
      
      // Double-check user hasn't changed during fetch
      if (user?.id === currentUserId) {
        setData(userData);
        setLastFetchedUserId(currentUserId);
        setError(null);
      }
    } catch (err) {
      const status = (err as { status?: number }).status;
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch user data';
      setError(errorMessage);
      setData(null);
      if (typeof status === 'number' && (status === 401 || status === 403)) {
        // Mark as terminal to avoid refetch storms until user/session changes
  const terr = { status, message: errorMessage };
  if (user?.id) TERMINAL_ERR.set(user.id, terr);
      }
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  }, [user?.id, enabled, data, lastFetchedUserId, isFetching]);

  // Separate fetch function for refreshes that doesn't trigger the main loading state
  const fetchDataForRefresh = useCallback(async () => {
    if (!user?.id || !enabled) {
      return;
    }

    setRefreshing(true);
    setError(null);

  try {
      const currentUserId = user.id;
      
      // Only proceed if user hasn't changed during the async operation
      if (!user?.id || user.id !== currentUserId) {
        return;
      }

  // Bypass cache but still share in-flight request among multiple refresh triggers
  const userData = await fetchUserDataShared(currentUserId, { force: true });
      
      // Double-check user hasn't changed during fetch
      if (user?.id === currentUserId) {
        setData(userData);
        setLastFetchedUserId(currentUserId);
        setError(null);
      }
    } catch (err) {
      const status = (err as { status?: number }).status;
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch user data';
      setError(errorMessage);
      if (typeof status === 'number' && (status === 401 || status === 403)) {
        const terr = { status, message: errorMessage };
        if (user?.id) TERMINAL_ERR.set(user.id, terr);
      }
    } finally {
      setRefreshing(false);
    }
  }, [user?.id, enabled]);

  // Force refresh function that bypasses cache
  const forceRefresh = useCallback(async () => {
    if (!user?.id) {
      return;
    }

    // Just call the refresh function directly - don't clear cache
    // since fetchDataForRefresh already bypasses cache by not checking lastFetchedUserId
    await fetchDataForRefresh();
  }, [user?.id, fetchDataForRefresh]);

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
        TERMINAL_ERR.delete(currentUserId);
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
    refreshing,
    error,
    refetch,
    updatePreferences,
    forceRefresh,
  };
}
