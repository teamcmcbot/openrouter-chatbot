// src/app/admin/AttachmentsPanel.tsx
'use client';
import React from 'react';

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
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<CleanupResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Attachments Maintenance</h2>
        <p className="text-sm text-gray-600">Delete orphaned image uploads older than a cutoff (unlinked for 24h+).</p>
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
