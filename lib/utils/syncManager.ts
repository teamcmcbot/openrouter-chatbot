import { streamDebug } from './streamDebug';
// lib/utils/syncManager.ts

/**
 * Global singleton sync manager to prevent multiple concurrent sync operations
 * This works across all component instances and survives hot reloads in development
 */
class SyncManager {
  private static instance: SyncManager;
  private syncInProgress: boolean = false;
  private lastSyncTime: number = 0;
  private readonly DEBOUNCE_MS = 1000; // 1 second debounce

  private constructor() {}

  public static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  public canSync(): boolean {
    const now = Date.now();
    const timeSinceLastSync = now - this.lastSyncTime;
    
    // Prevent sync if already in progress or if last sync was too recent
    if (this.syncInProgress) {
      streamDebug(`[SyncManager] Sync already in progress, skipping`);
      return false;
    }
    
    if (timeSinceLastSync < this.DEBOUNCE_MS) {
      streamDebug(`[SyncManager] Sync debounced, last sync was ${timeSinceLastSync}ms ago`);
      return false;
    }
    
    return true;
  }

  public startSync(): boolean {
    if (!this.canSync()) {
      return false;
    }
    
    this.syncInProgress = true;
    this.lastSyncTime = Date.now();
  streamDebug(`[SyncManager] Sync started at ${new Date().toISOString()}`);
    return true;
  }

  public endSync(): void {
    this.syncInProgress = false;
  streamDebug(`[SyncManager] Sync completed at ${new Date().toISOString()}`);
  }

  public isSyncing(): boolean {
    return this.syncInProgress;
  }

  public reset(): void {
    this.syncInProgress = false;
    this.lastSyncTime = 0;
  streamDebug(`[SyncManager] Reset sync state`);
  }
}

export const syncManager = SyncManager.getInstance();
