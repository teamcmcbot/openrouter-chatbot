// src/app/admin/AttachmentsPanel.tsx
'use client';
import React from 'react';

type StatsResponse = {
  success: boolean;
  stats?: {
    totalAttachments: number;
    uploadedToday: number;
    unlinkedAll: number;
    unlinkedOlder24h: number;
    totalBytesApprox: number;
  };
  error?: string;
};

type CleanupResponse = {
  success: boolean;
  hours: number;
  limit: number;
  result?: {
    scanned: number;
    deletedStorage: number;
    softDeletedRows: number;
    sampleIds: string[];
  };
  error?: string;
};

export default function AttachmentsPanel() {
  const [hours, setHours] = React.useState(24);
  const [limit, setLimit] = React.useState(500);
  const [freeDays, setFreeDays] = React.useState(30);
  const [proDays, setProDays] = React.useState(60);
  const [enterpriseDays, setEnterpriseDays] = React.useState(90);
  const [dryRun, setDryRun] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<CleanupResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [stats, setStats] = React.useState<StatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = React.useState<boolean>(false);

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const val = bytes / Math.pow(1024, i);
    return `${val.toFixed(val >= 10 ? 0 : 1)} ${units[i]}`;
  };

  async function loadStats() {
    setStatsLoading(true);
    try {
      const res = await fetch('/api/admin/attachments/stats', { cache: 'no-store' });
      const json: StatsResponse = await res.json();
      setStats(json);
    } catch (e) {
      setStats({ success: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setStatsLoading(false);
    }
  }

  React.useEffect(() => {
    loadStats();
  }, []);

  async function triggerCleanup() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/attachments/cleanup?hours=${hours}&limit=${limit}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Cleanup failed');
      }
      setResult(json);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function triggerRetention() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const params = new URLSearchParams({
        freeDays: String(freeDays),
        proDays: String(proDays),
        enterpriseDays: String(enterpriseDays),
        limit: String(Math.max(1, limit)),
        dryRun: String(dryRun),
      });
      const res = await fetch(`/api/admin/attachments/retention?${params.toString()}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Retention cleanup failed');
      }
      setResult(json);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Attachments Maintenance</h2>
        <p className="text-sm text-gray-600">Delete orphaned image uploads older than a cutoff (unlinked for 24h+).</p>
      </div>
      <div className="rounded border p-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Current Storage Stats</h3>
          <button onClick={loadStats} className="text-sm text-blue-600 disabled:opacity-60" disabled={statsLoading}>
            {statsLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {stats?.success && stats.stats ? (
          <ul className="mt-2 text-sm space-y-1">
            <li>Total attachments: {stats.stats.totalAttachments}</li>
            <li>Uploaded today: {stats.stats.uploadedToday}</li>
            <li>Unlinked (all): {stats.stats.unlinkedAll}</li>
            <li>Unlinked (&gt;24h): {stats.stats.unlinkedOlder24h}</li>
            <li>Total size (approx): {formatBytes(stats.stats.totalBytesApprox)}</li>
          </ul>
        ) : (
          <p className="mt-2 text-sm text-gray-600">
            {statsLoading ? 'Loading…' : (stats?.error ? `Failed to load stats: ${stats.error}` : 'No stats available')}
          </p>
        )}
      </div>
      <div className="flex items-end gap-3">
        <label className="flex flex-col text-sm">
          Cutoff hours
          <input
            type="number"
            className="mt-1 rounded border px-2 py-1 w-28"
            min={1}
            max={168}
            value={hours}
            onChange={(e) => setHours(Math.max(1, Math.min(168, parseInt(e.target.value || '24', 10))))}
          />
        </label>
        <label className="flex flex-col text-sm">
          Limit
          <input
            type="number"
            className="mt-1 rounded border px-2 py-1 w-28"
            min={1}
            max={2000}
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Math.min(2000, parseInt(e.target.value || '500', 10))))}
          />
        </label>
        <button
          className="inline-flex items-center rounded bg-red-600 px-3 py-2 text-white disabled:opacity-60"
          onClick={triggerCleanup}
          disabled={loading}
        >
          {loading ? 'Cleaning…' : 'Run Orphan Cleanup'}
        </button>
      </div>

      <div className="mt-4 rounded border p-3 space-y-3">
        <h3 className="font-medium">Retention Cleanup (by Tier)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <label className="flex flex-col text-sm">
            Free days
            <input
              type="number"
              className="mt-1 rounded border px-2 py-1 w-28"
              min={1}
              max={365}
              value={freeDays}
              onChange={(e) => setFreeDays(Math.max(1, Math.min(365, parseInt(e.target.value || '30', 10))))}
            />
          </label>
          <label className="flex flex-col text-sm">
            Pro days
            <input
              type="number"
              className="mt-1 rounded border px-2 py-1 w-28"
              min={1}
              max={365}
              value={proDays}
              onChange={(e) => setProDays(Math.max(1, Math.min(365, parseInt(e.target.value || '60', 10))))}
            />
          </label>
          <label className="flex flex-col text-sm">
            Enterprise days
            <input
              type="number"
              className="mt-1 rounded border px-2 py-1 w-28"
              min={1}
              max={730}
              value={enterpriseDays}
              onChange={(e) => setEnterpriseDays(Math.max(1, Math.min(730, parseInt(e.target.value || '90', 10))))}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            Dry run (no deletions)
          </label>
        </div>
        <div>
          <button
            className="inline-flex items-center rounded bg-amber-600 px-3 py-2 text-white disabled:opacity-60"
            onClick={triggerRetention}
            disabled={loading}
          >
            {loading ? 'Running…' : 'Run Retention Cleanup'}
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <div className="text-sm">
          <p>Hours: {result.hours} | Limit: {result.limit}</p>
          <p>Scanned: {result.result?.scanned} | Storage deleted: {result.result?.deletedStorage} | Rows soft-deleted: {result.result?.softDeletedRows}</p>
          {Array.isArray(result.result?.sampleIds) && result.result.sampleIds.length > 0 && (
            <p>Sample IDs: <code>{result.result.sampleIds.join(', ')}</code></p>
          )}
        </div>
      )}
    </div>
  );
}
