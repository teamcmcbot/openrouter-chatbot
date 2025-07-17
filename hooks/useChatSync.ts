// hooks/useChatSync.ts

import { useEffect, useCallback } from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import { useChatStore } from '../stores/useChatStore';

export const useChatSync = () => {
  const { user, isAuthenticated } = useAuthStore();
  const { 
    syncConversations, 
    loadUserConversations, 
    migrateAnonymousConversations,
    filterConversationsByUser,
    isSyncing,
    lastSyncTime,
    syncError
  } = useChatStore();

  // Stabilize the sync process to prevent multiple calls
  const handleUserAuthentication = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      console.log('[ChatSync] User not authenticated, showing anonymous conversations');
      filterConversationsByUser(null);
      return;
    }

    console.log('[ChatSync] User authenticated, initiating sync process');
    
    try {
      // Step 1: Migrate anonymous conversations (this updates them with userId)
      await migrateAnonymousConversations(user.id);
      
      // Step 2: Load server conversations (this will merge with local)
      await loadUserConversations(user.id);
      
      // Step 3: Filter to show only user's conversations (now that migration is complete)
      filterConversationsByUser(user.id);
      
      console.log('[ChatSync] Sync process completed successfully');
    } catch (error) {
      console.error('[ChatSync] Sync process failed:', error);
    }
  }, [isAuthenticated, user?.id, migrateAnonymousConversations, loadUserConversations, filterConversationsByUser]);

  // Handle user authentication state changes
  useEffect(() => {
    handleUserAuthentication();
  }, [handleUserAuthentication]);

  // Auto-sync conversations every 5 minutes for authenticated users
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const interval = setInterval(() => {
      console.log('[ChatSync] Auto-sync triggered');
      syncConversations();
    }, 5 * 60 * 1000); // 5 minutes

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
