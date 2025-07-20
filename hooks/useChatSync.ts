// hooks/useChatSync.ts

import { useEffect, useCallback } from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import { useChatStore } from '../stores/useChatStore';
import { useDebounce } from './useDebounce';

export const useChatSync = () => {
  const { user, isAuthenticated } = useAuthStore();
  const { 
    syncConversations, 
    isSyncing,
    lastSyncTime,
    syncError
  } = useChatStore();

  // Debounce auth state to prevent rapid-fire triggers during OAuth flow
  const debouncedIsAuthenticated = useDebounce(isAuthenticated, 200);
  const debouncedUserId = useDebounce(user?.id, 200);

  // Stabilize the sync process to prevent multiple calls
  const handleUserAuthentication = useCallback(async () => {
    if (!debouncedIsAuthenticated || !debouncedUserId) {
      console.log(`[ChatSync] User not authenticated at ${new Date().toISOString()}, showing anonymous conversations`);
      // Get fresh store actions inside the callback to avoid dependency issues
      const { filterConversationsByUser } = useChatStore.getState();
      filterConversationsByUser(null);
      return;
    }

    try {
      console.log(`[ChatSync] User authenticated at ${new Date().toISOString()}, initiating sync process`);
      
      // Get fresh store actions inside the callback to avoid dependency issues
      const { 
        migrateAnonymousConversations, 
        loadUserConversations, 
        filterConversationsByUser 
      } = useChatStore.getState();
      
      // Step 1: Migrate anonymous conversations (this updates them with userId)
      await migrateAnonymousConversations(debouncedUserId);
      
      // Step 2: Load server conversations (this will merge with local)
      await loadUserConversations(debouncedUserId);
      
      // Step 3: Filter to show only user's conversations (now that migration is complete)
      filterConversationsByUser(debouncedUserId);
      
      console.log(`[ChatSync] Sync process completed successfully at ${new Date().toISOString()}`);
    } catch (error) {
      console.error('[ChatSync] Sync process failed:', error);
    }
  }, [debouncedIsAuthenticated, debouncedUserId]); // Use debounced values as dependencies

  // Handle user authentication state changes
  useEffect(() => {
    handleUserAuthentication();
  }, [handleUserAuthentication]);

  // Periodic auto-sync: configurable interval and on/off switch from env
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    // Read from environment variables
    const autoSyncEnabled = process.env.NEXT_PUBLIC_AUTO_SYNC_FLAG === 'true';
    // Default to 5 minutes if not set or invalid
    let intervalMinutes = 5;
    if (process.env.NEXT_PUBLIC_AUTO_SYNC_INTERVAL) {
      const parsed = parseInt(process.env.NEXT_PUBLIC_AUTO_SYNC_INTERVAL, 10);
      if (!isNaN(parsed) && parsed > 0) intervalMinutes = parsed;
    }
    const intervalMs = intervalMinutes * 60 * 1000;

    if (!autoSyncEnabled) return;

    const interval = setInterval(() => {
      console.log(`[ChatSync] Auto-sync triggered at ${new Date().toISOString()}`);
      syncConversations(); // Store-level deduplication will handle multiple calls
    }, intervalMs);

    return () => clearInterval(interval);
  }, [isAuthenticated, user, syncConversations]);

  // Manual sync function
  const manualSync = useCallback(async () => {
    if (!isAuthenticated || !user) {
      console.warn('[ChatSync] Cannot sync: user not authenticated');
      return;
    }

    console.log('[ChatSync] Manual sync triggered');
    await syncConversations();
  }, [isAuthenticated, user, syncConversations]);

  // Sync status
  const syncStatus = {
    isSyncing,
    lastSyncTime: lastSyncTime ? new Date(lastSyncTime) : null,
    syncError,
    canSync: isAuthenticated && !!user
  };

  return {
    manualSync,
    syncStatus
  };
};
