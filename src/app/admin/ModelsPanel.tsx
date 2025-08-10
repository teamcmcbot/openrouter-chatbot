"use client";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import SyncPanel from '@/app/admin/SyncPanel';

type ModelRow = {
  model_id: string;
  canonical_slug?: string | null;
  model_name?: string | null;
  status: 'new' | 'active' | 'disabled';
  is_free: boolean;
  is_pro: boolean;
  is_enterprise: boolean;
  context_length?: number | null;
  last_synced_at?: string | null;
  updated_at?: string | null;
};

type ListResponse = { success: true; items: ModelRow[]; totalCount?: number | null; filteredCount?: number | null } | { success: false; error: string };
type PatchResponse = { success: boolean; results: Array<{ model_id: string; success: boolean; error?: string }> };

export default function ModelsPanel() {
  const [filter, setFilter] = useState<string>('all');
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(false);
  // no per-row saving state since we stage changes
  const [error, setError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [counts, setCounts] = useState<{ total: number | null; filtered: number | null }>({ total: null, filtered: null });
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [staged, setStaged] = useState<Record<string, Partial<ModelRow>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/model-access?status=${filter}`);
      const json = (await res.json()) as ListResponse;
      if (!res.ok || json.success === false) {
        const err = !('success' in json) || json.success ? 'Failed to load' : json.error;
        throw new Error(err || 'Failed to load');
      }
      if (json.success) {
        setRows(json.items);
        setCounts({ total: json.totalCount ?? null, filtered: json.filteredCount ?? json.items.length });
        // reset selection and staged on reload
        setSelected({});
        setStaged({});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Load dynamic statuses
    (async () => {
      try {
        const res = await fetch('/api/admin/model-access?meta=statuses');
        const json = (await res.json()) as { success: boolean; statuses?: string[] };
        if (res.ok && json.success && Array.isArray(json.statuses)) {
          setStatuses(json.statuses);
        }
      } catch {}
    })();
  }, []);

  const onSyncComplete = useCallback(() => {
    // After a successful sync, reload models (keeps filter)
    load();
  }, [load]);

  // Stage changes locally instead of PATCH per cell
  const stageRow = (modelId: string, changes: Partial<ModelRow>) => {
    setStaged(prev => ({ ...prev, [modelId]: { ...prev[modelId], ...changes } }));
    setRows(prev => prev.map(r => r.model_id === modelId ? { ...r, ...changes } as ModelRow : r));
  };

  const updateAll = async () => {
    // Decide which rows to include: if any selected, use selected; else, use current filter set
    const ids = Object.values(selected).some(v => v)
      ? Object.keys(selected).filter(id => selected[id])
      : rows.map(r => r.model_id);
    const updates: Array<{ model_id: string; status?: ModelRow['status']; is_free?: boolean; is_pro?: boolean; is_enterprise?: boolean }> = [];
    for (const id of ids) {
      const changes = staged[id];
      if (!changes) continue;
      const patch: { model_id: string; status?: ModelRow['status']; is_free?: boolean; is_pro?: boolean; is_enterprise?: boolean } = { model_id: id };
      if (changes.status) patch.status = changes.status;
      if (typeof changes.is_free === 'boolean') patch.is_free = changes.is_free;
      if (typeof changes.is_pro === 'boolean') patch.is_pro = changes.is_pro;
      if (typeof changes.is_enterprise === 'boolean') patch.is_enterprise = changes.is_enterprise;
      if (Object.keys(patch).length > 1) updates.push(patch);
    }
    if (updates.length === 0) return; // nothing to do

    setLoading(true);
    try {
      const res = await fetch('/api/admin/model-access', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      });
      const json = (await res.json()) as PatchResponse;
      if (!res.ok || !json.success) throw new Error('Update failed');
      // clear staged for applied ids
      setStaged(prev => {
        const copy = { ...prev };
        for (const id of ids) delete copy[id];
        return copy;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
      // Reload to reflect authoritative values
      await load();
    }
  };

  const columns = useMemo(() => [
    { key: 'model_id', label: 'Model ID' },
    { key: 'model_name', label: 'Name' },
    { key: 'status', label: 'Status' },
    { key: 'is_free', label: 'Free' },
    { key: 'is_pro', label: 'Pro' },
    { key: 'is_enterprise', label: 'Enterprise' },
    { key: 'actions', label: 'Actions' },
  ], []);

  return (
    <div className="space-y-6">
      <section className="space-y-3 border rounded-md p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Model Sync</h2>
        </div>
        <SyncPanel onSyncComplete={onSyncComplete} />
      </section>

      <section className="space-y-3 border rounded-md p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Models{counts.filtered !== null && counts.total !== null ? ` (${counts.filtered} of ${counts.total})` : ''}</h2>
          <div className="ml-auto flex items-center gap-2">
            <label className="text-sm text-gray-600">Filter</label>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50" onClick={load} disabled={loading}>
              {loading ? 'Loading…' : 'Reload'}
            </button>
            <button className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-50 hover:bg-emerald-700" onClick={updateAll} disabled={loading}>
              Update All
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                {columns.map(c => (
                  <th key={c.key} className="px-3 py-2 font-medium text-gray-600">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.model_id} className="border-b hover:bg-gray-50/50">
                  <td className="px-3 py-2 font-mono text-xs max-w-[360px] truncate" title={row.model_id}>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={!!selected[row.model_id]} onChange={(e) => setSelected(prev => ({ ...prev, [row.model_id]: e.target.checked }))} />
                      <span className="truncate" title={row.model_id}>{row.model_id}</span>
                    </label>
                  </td>
                  <td className="px-3 py-2">{row.model_name || row.canonical_slug || '—'}</td>
                  <td className="px-3 py-2">
                    <select
                      className="border rounded px-2 py-1 text-xs"
                      value={row.status}
                      onChange={(e) => stageRow(row.model_id, { status: e.target.value as ModelRow['status'] })}
                    >
                      <option value="new">new</option>
                      <option value="active">active</option>
                      <option value="disabled">disabled</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={row.is_free} onChange={(e) => stageRow(row.model_id, { is_free: e.target.checked })} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={row.is_pro} onChange={(e) => stageRow(row.model_id, { is_pro: e.target.checked })} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={row.is_enterprise} onChange={(e) => stageRow(row.model_id, { is_enterprise: e.target.checked })} />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      className="px-2 py-1 rounded border text-xs hover:bg-gray-50"
                      onClick={() => load()}
                    >
                      Refresh
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr>
                  <td className="px-3 py-6 text-center text-gray-500" colSpan={columns.length}>No rows</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
