"use client";
import React, { useCallback, useEffect, useState } from 'react';

type Status = {
  success: boolean;
  data?: {
    currentStatus: {
      isRunning: boolean;
      lastSyncAt: string | null;
      lastSyncStatus: 'completed'|'failed'|'running'|null;
      lastSyncDuration: number | null;
      totalModels: number;
      errorMessage?: string;
    };
    statistics: {
      period: string;
      totalSyncs: number;
      successfulSyncs: number;
      failedSyncs: number;
      successRate: number;
      averageDuration: number;
      lastSuccessfulSync: string | null;
    };
    cooldown: {
      enabled: boolean;
      durationMs: number;
      durationMinutes: number;
    };
  };
};

type SyncData = {
  syncLogId: string;
  totalProcessed: number;
  modelsAdded: number;
  modelsUpdated: number;
  modelsMarkedInactive: number;
  durationMs: number;
  triggeredBy: string;
  triggeredAt: string;
};

type SyncResult = { success: true; message?: string; data: SyncData } | { success: false; error?: string; code?: string; message?: string };

export default function SyncPanel({ onSyncComplete }: { onSyncComplete?: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<SyncResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const loadStatus = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/admin/sync-models', { method: 'GET' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || json?.error || 'Failed to load status');
      setStatus(json);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(msg);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const triggerSync = async () => {
    setLoading(true);
    setError(null);
    setLastResponse(null);
    try {
      const res = await fetch('/api/admin/sync-models', { method: 'POST' });
  const json = (await res.json()) as SyncResult;
      setLastResponse(json);
      if (!res.ok || ('success' in json && json.success === false)) {
        const errMsg = ('success' in json && json.success === false)
          ? (json.message || json.error || 'Sync failed')
          : 'Sync failed';
        throw new Error(errMsg);
      }
      await loadStatus();
      // Auto-open details for a successful sync, but not overwhelming
      setShowDetails(false);
  onSyncComplete?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(msg);
      setShowDetails(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-50 hover:bg-emerald-700"
          onClick={triggerSync}
          disabled={loading}
        >
          {loading ? 'Syncing…' : 'Trigger Sync'}
        </button>
        <button
          className="px-3 py-2 rounded border bg-white text-gray-900 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={loadStatus}
          disabled={loading}
        >
          Refresh Status
        </button>
        {lastResponse !== null && (
          <button
            className="ml-auto px-3 py-2 rounded border hover:bg-gray-50"
            onClick={() => setShowDetails(v => !v)}
          >
            {showDetails ? 'Hide Details' : 'Show Details'}
          </button>
        )}
      </div>

      {/* Alerts */}
  {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          <div className="font-medium">Sync failed</div>
          <div className="mt-1">{error}</div>
        </div>
      )}
      {!error && lastResponse && lastResponse.success && (
        <div className="rounded-md border p-3 text-sm bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-300">
          <div className="font-medium">Sync completed successfully</div>
          <div className="mt-1">
    Processed {lastResponse.data.totalProcessed} models •
    Added {lastResponse.data.modelsAdded} •
    Updated {lastResponse.data.modelsUpdated} •
    Inactivated {lastResponse.data.modelsMarkedInactive}
          </div>
        </div>
      )}

      {/* Status summary */}
      {status && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div className="rounded border p-3 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 group hover:border-emerald-400 transition-colors">
            <div className="text-gray-500">Running</div>
            <div className="font-medium group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{String(status.data?.currentStatus.isRunning)}</div>
          </div>
          <div className="rounded border p-3 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 group hover:border-emerald-400 transition-colors">
            <div className="text-gray-500">Last Sync</div>
            <div className="font-medium group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{status.data?.currentStatus.lastSyncAt || '—'}</div>
          </div>
          <div className="rounded border p-3 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 group hover:border-emerald-400 transition-colors">
            <div className="text-gray-500">Last Status</div>
            <div className="font-medium group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{status.data?.currentStatus.lastSyncStatus || '—'}</div>
          </div>
          <div className="rounded border p-3 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 group hover:border-emerald-400 transition-colors">
            <div className="text-gray-500">Total Models</div>
            <div className="font-medium group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{status.data?.currentStatus.totalModels}</div>
          </div>
          <div className="rounded border p-3 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 group hover:border-emerald-400 transition-colors">
            <div className="text-gray-500">Avg Duration</div>
            <div className="font-medium group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{status.data?.statistics.averageDuration} ms</div>
          </div>
          <div className="rounded border p-3 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700 group hover:border-emerald-400 transition-colors">
            <div className="text-gray-500">Success Rate</div>
            <div className="font-medium group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{status.data?.statistics.successRate}%</div>
          </div>
        </div>
      )}

      {/* Collapsible raw details for debugging */}
      {lastResponse !== null && showDetails && (
        <div className="rounded-md border bg-white p-0 dark:bg-gray-900 dark:border-gray-700">
          <div className="px-3 py-2 text-xs text-gray-600 border-b dark:text-gray-300 dark:border-gray-700">Response details</div>
          <pre className="text-xs bg-gray-50 p-2 rounded-b overflow-auto max-h-64 dark:bg-gray-950 dark:text-gray-200">
{JSON.stringify(lastResponse, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
