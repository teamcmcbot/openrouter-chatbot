// src/app/admin/AttachmentsPanel.tsx
'use client';
import React from 'react';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';

type StatsResponse = {
  success: boolean;
  stats?: {
    totalAttachments: number;
    uploadedToday: number;
    unlinkedAll: number;
    unlinkedOlder24h: number;
    totalBytesApprox: number;
  // added storage metrics
  storageLiveObjects?: number;
  storageTotalBytes?: number;
  storageOrphans?: { count: number; totalBytes: number };
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
  // Storage cleanup controls
  const [storageOlderThan, setStorageOlderThan] = React.useState(24);
  const [storageLimit, setStorageLimit] = React.useState(500);
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

  async function triggerStoragePurge(dry = true) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const params = new URLSearchParams({
        olderThanHours: String(storageOlderThan),
        limit: String(Math.max(1, storageLimit)),
        dryRun: String(dry),
      });
      const res = await fetch(`/api/admin/attachments/storage/purge?${params.toString()}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json.error || 'Storage purge failed');
      }
      // minimally adapt result into CleanupResponse-like display
      setResult({ success: true, hours: storageOlderThan, limit: storageLimit, result: {
        scanned: json.toDelete?.length || 0,
        deletedStorage: json.deleted || 0,
        softDeletedRows: 0,
        sampleIds: (json.toDelete || []).slice(0, 10),
      }});
      await loadStats();
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
        <p className="text-sm text-gray-600 dark:text-gray-300">Delete orphaned image uploads older than a cutoff (unlinked for 24h+).</p>
      </div>
      <div className="rounded border dark:border-gray-700 p-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Current Storage Stats</h3>
          <Button variant="secondary" size="sm" onClick={loadStats} loading={statsLoading} disabled={statsLoading}>
            Refresh
          </Button>
        </div>
        {stats?.success && stats.stats ? (
          <ul className="mt-2 text-sm space-y-1">
            <li>Total attachments: {stats.stats.totalAttachments}</li>
            <li>Uploaded today: {stats.stats.uploadedToday}</li>
            <li>Unlinked (all): {stats.stats.unlinkedAll}</li>
            <li>Unlinked (&gt;24h): {stats.stats.unlinkedOlder24h}</li>
            <li>Total size (approx): {formatBytes(stats.stats.totalBytesApprox)}</li>
            {typeof stats.stats.storageLiveObjects === 'number' && (
              <>
                <li>Storage live objects: {stats.stats.storageLiveObjects}</li>
                <li>Storage total bytes: {formatBytes(stats.stats.storageTotalBytes || 0)}</li>
                <li>Storage orphans: {(stats.stats.storageOrphans?.count ?? 0)} objects ({formatBytes(stats.stats.storageOrphans?.totalBytes || 0)})</li>
              </>
            )}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            {statsLoading ? 'Loading…' : (stats?.error ? `Failed to load stats: ${stats.error}` : 'No stats available')}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-auto">
          <Input
            label="Cutoff hours"
            type="number"
            className="w-28"
            min={1}
            max={168}
            value={hours}
            onChange={(e) => setHours(Math.max(1, Math.min(168, parseInt((e.target as HTMLInputElement).value || '24', 10))))}
          />
        </div>
        <div className="w-auto">
          <Input
            label="Limit"
            type="number"
            className="w-28"
            min={1}
            max={2000}
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Math.min(2000, parseInt((e.target as HTMLInputElement).value || '500', 10))))}
          />
        </div>
        <Button variant="danger" onClick={triggerCleanup} loading={loading} disabled={loading}>
          Run Orphan Cleanup
        </Button>
      </div>

      <div className="mt-4 rounded border dark:border-gray-700 p-3 space-y-3">
        <h3 className="font-medium">Retention Cleanup (by Tier)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Input
            label="Free days"
            type="number"
            className="w-28"
            min={1}
            max={365}
            value={freeDays}
            onChange={(e) => setFreeDays(Math.max(1, Math.min(365, parseInt((e.target as HTMLInputElement).value || '30', 10))))}
          />
          <Input
            label="Pro days"
            type="number"
            className="w-28"
            min={1}
            max={365}
            value={proDays}
            onChange={(e) => setProDays(Math.max(1, Math.min(365, parseInt((e.target as HTMLInputElement).value || '60', 10))))}
          />
          <Input
            label="Enterprise days"
            type="number"
            className="w-28"
            min={1}
            max={730}
            value={enterpriseDays}
            onChange={(e) => setEnterpriseDays(Math.max(1, Math.min(730, parseInt((e.target as HTMLInputElement).value || '90', 10))))}
          />
          <label className="flex items-center gap-2 text-sm mt-6">
            <input className="checkbox-emerald" type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            Dry run (no deletions)
          </label>
        </div>
        <div>
          <Button variant="primary" onClick={triggerRetention} loading={loading} disabled={loading}>
            Run Retention Cleanup
          </Button>
        </div>
      </div>

      <div className="mt-4 rounded border dark:border-gray-700 p-3 space-y-3">
        <h3 className="font-medium">Storage Cleanup (Orphans in Storage Only)</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300">Delete storage objects with no matching chat_attachments row.</p>
        <div className="flex flex-wrap items-end gap-3">
          <Input
            label="Older than (hours)"
            type="number"
            className="w-28"
            min={1}
            max={168}
            value={storageOlderThan}
            onChange={(e) => setStorageOlderThan(Math.max(1, Math.min(168, parseInt((e.target as HTMLInputElement).value || '24', 10))))}
          />
          <Input
            label="Limit"
            type="number"
            className="w-28"
            min={1}
            max={2000}
            value={storageLimit}
            onChange={(e) => setStorageLimit(Math.max(1, Math.min(2000, parseInt((e.target as HTMLInputElement).value || '500', 10))))}
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => triggerStoragePurge(true)} loading={loading} disabled={loading}>
              Dry Run
            </Button>
            <Button variant="danger" onClick={() => triggerStoragePurge(false)} loading={loading} disabled={loading}>
              Purge Orphans
            </Button>
          </div>
        </div>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
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
