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

export default function SyncPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<unknown>(null);

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
      const json = await res.json();
      setLastResponse(json);
      if (!res.ok) throw new Error(json?.message || json?.error || 'Sync failed');
      await loadStatus();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
          onClick={triggerSync}
          disabled={loading}
        >
          {loading ? 'Syncing…' : 'Trigger Sync'}
        </button>
        <button
          className="px-3 py-2 rounded border"
          onClick={loadStatus}
          disabled={loading}
        >
          Refresh Status
        </button>
      </div>
      {error && <div className="text-red-600 text-sm">{error}</div>}
      {status && (
        <div className="text-sm space-y-1">
          <div>Running: {String(status.data?.currentStatus.isRunning)}</div>
          <div>Last Sync: {status.data?.currentStatus.lastSyncAt || '—'}</div>
          <div>Last Status: {status.data?.currentStatus.lastSyncStatus || '—'}</div>
          <div>Total Models: {status.data?.currentStatus.totalModels}</div>
          <div>Avg Duration: {status.data?.statistics.averageDuration} ms</div>
          <div>Success Rate: {status.data?.statistics.successRate}%</div>
        </div>
      )}
      {lastResponse !== null && (
        <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-64">
{typeof lastResponse === 'string' ? lastResponse : JSON.stringify(lastResponse, null, 2)}
        </pre>
      )}
    </div>
  );
}
