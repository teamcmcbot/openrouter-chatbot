// hooks/useChatSync.ts

import { useEffect, useCallback } from 'react';
import { logger } from '../lib/utils/logger';
import { useAuthStore } from '../stores/useAuthStore';
import { useChatStore } from '../stores/useChatStore';
import { useDebounce } from './useDebounce';

export const useChatSync = () => {
  const { user, isAuthenticated } = useAuthStore();
  const { 
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
  logger.debug('[ChatSync] User not authenticated, showing anonymous conversations', { at: new Date().toISOString() });
      // Get fresh store actions inside the callback to avoid dependency issues
      const { filterConversationsByUser } = useChatStore.getState();
      filterConversationsByUser(null);
      return;
    }

    try {
  logger.debug('[ChatSync] User authenticated, initiating sync process', { at: new Date().toISOString() });
      
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
      
  logger.debug('[ChatSync] Sync process completed successfully', { at: new Date().toISOString() });
    } catch (error) {
  logger.error('[ChatSync] Sync process failed:', error);
    }
  }, [debouncedIsAuthenticated, debouncedUserId]); // Use debounced values as dependencies

  // Handle user authentication state changes
  useEffect(() => {
    handleUserAuthentication();
  }, [handleUserAuthentication]);

  // Sync status
  const syncStatus = {
    isSyncing,
    lastSyncTime: lastSyncTime ? new Date(lastSyncTime) : null,
    syncError,
    canSync: isAuthenticated && !!user
  };

  return {
    syncStatus
  };
};
