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
      syncConversations();
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
