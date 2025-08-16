"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebounce } from '../../../hooks/useDebounce';

type Tier = 'free' | 'pro' | 'enterprise';
type AccountType = 'user' | 'admin';

type UserRow = {
  id: string;
  email: string;
  full_name?: string | null;
  subscription_tier: Tier;
  account_type: AccountType;
  credits: number;
  last_active?: string | null;
  updated_at?: string | null;
};

type ListResponse = { success: true; items: UserRow[]; totalCount?: number | null; filteredCount?: number | null } | { success: false; error: string };
type PatchResponse = { success: boolean; results: Array<{ id: string; success: boolean; error?: string }> };

export default function UsersPanel() {
  // Filters & search
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 350);
  const [tier, setTier] = useState<'all' | Tier>('all');
  const [accountType, setAccountType] = useState<'all' | AccountType>('all');

  // Pagination
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);

  // Data
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ total: number | null; filtered: number | null }>({ total: null, filtered: null });

  // Selection & staging
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [staged, setStaged] = useState<Record<string, Partial<UserRow>>>({});

  // Header controls state
  const [headerTier, setHeaderTier] = useState<'' | Tier>('');
  const [headerAccountType, setHeaderAccountType] = useState<'' | AccountType>('');
  const [headerCredits, setHeaderCredits] = useState<string>('');

  // Select-all behavior
  const selectAllRef = useRef<HTMLInputElement>(null);
  const allSelected = useMemo(() => rows.length > 0 && rows.every(r => !!selected[r.id]), [rows, selected]);
  const someSelected = useMemo(() => rows.some(r => !!selected[r.id]), [rows, selected]);
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = !allSelected && someSelected; }, [allSelected, someSelected]);

  const toggleSelectAllForCurrent = (checked: boolean) => {
    setSelected(prev => {
      const next = { ...prev } as Record<string, boolean>;
      for (const r of rows) next[r.id] = checked;
      return next;
    });
  };

  const columns = useMemo(() => [
    { key: 'id', label: 'User ID' },
    { key: 'email', label: 'Email' },
    { key: 'full_name', label: 'Name' },
    { key: 'subscription_tier', label: 'Tier' },
    { key: 'account_type', label: 'Account' },
    { key: 'credits', label: 'Credits' },
    { key: 'last_active', label: 'Last Active' },
    { key: 'actions', label: 'Actions' },
  ], []);

  const getScopeIds = useCallback(() => rows.filter(r => !!selected[r.id]).map(r => r.id), [selected, rows]);

  const stageMany = (ids: string[], changes: Partial<UserRow>) => {
    const idSet = new Set(ids);
    setStaged(prev => {
      const next = { ...prev } as Record<string, Partial<UserRow>>;
      for (const id of ids) next[id] = { ...next[id], ...changes };
      return next;
    });
    setRows(prev => prev.map(r => idSet.has(r.id) ? ({ ...r, ...changes } as UserRow) : r));
  };

  const bulkSetTier = (value: Tier) => {
    const ids = getScopeIds();
    if (ids.length === 0) return;
    stageMany(ids, { subscription_tier: value });
  };
  const bulkSetAccount = (value: AccountType) => {
    const ids = getScopeIds();
    if (ids.length === 0) return;
    stageMany(ids, { account_type: value });
  };
  const bulkSetCredits = (value: number) => {
    const ids = getScopeIds();
    if (ids.length === 0) return;
    stageMany(ids, { credits: value });
  };

  const stageRow = (id: string, changes: Partial<UserRow>) => {
    setStaged(prev => ({ ...prev, [id]: { ...prev[id], ...changes } }));
    setRows(prev => prev.map(r => r.id === id ? ({ ...r, ...changes } as UserRow) : r));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dq) params.set('q', dq);
      if (tier !== 'all') params.set('tier', tier);
      if (accountType !== 'all') params.set('account_type', accountType);
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const json = (await res.json()) as ListResponse;
      if (!res.ok || json.success === false) {
        const err = !('success' in json) || json.success ? 'Failed to load' : json.error;
        throw new Error(err || 'Failed to load');
      }
      if (json.success) {
        setRows(json.items);
        setCounts({ total: json.totalCount ?? null, filtered: json.filteredCount ?? json.items.length });
        setSelected({});
        setStaged({});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [dq, tier, accountType, limit, offset]);

  // Reload when filters/search/pagination change
  useEffect(() => { load(); }, [load]);

  const updateAll = async () => {
    const ids = Object.values(selected).some(Boolean)
      ? Object.keys(selected).filter(id => selected[id])
      : rows.map(r => r.id);

    const updates: Array<{ id: string; subscription_tier?: Tier; account_type?: AccountType; credits?: number }> = [];
    for (const id of ids) {
      const changes = staged[id];
      if (!changes) continue;
      const patch: { id: string; subscription_tier?: Tier; account_type?: AccountType; credits?: number } = { id };
      if (changes.subscription_tier) patch.subscription_tier = changes.subscription_tier as Tier;
      if (changes.account_type) patch.account_type = changes.account_type as AccountType;
      if (typeof changes.credits === 'number') patch.credits = Math.trunc(changes.credits);
      if (Object.keys(patch).length > 1) updates.push(patch);
    }
    if (updates.length === 0) return;

    setLoading(true);
    try {
      const res = await fetch('/api/admin/users', {
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
      await load();
    }
  };

  const pageInfo = useMemo(() => {
    const from = offset + 1;
    const to = Math.min(offset + limit, counts.filtered ?? rows.length);
    return { from, to };
  }, [offset, limit, counts.filtered, rows.length]);

  return (
    <section className="space-y-3 border rounded-md p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Users{counts.filtered !== null && counts.total !== null ? ` (${counts.filtered} of ${counts.total})` : ''}</h2>
        <div className="ml-auto flex items-center gap-2">
          <input
            className="border rounded px-2 py-1 text-sm min-w-[240px] input-emerald-focus"
            placeholder="Search email or name…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setOffset(0); }}
          />
          <label className="text-sm text-gray-600">Tier</label>
          <select className="border rounded px-2 py-1 text-sm input-emerald-focus" value={tier} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { const v = e.target.value as ('all' | Tier); setTier(v); setOffset(0); }}>
            <option value="all">All</option>
            <option value="free">free</option>
            <option value="pro">pro</option>
            <option value="enterprise">enterprise</option>
          </select>
          <label className="text-sm text-gray-600">Account</label>
          <select className="border rounded px-2 py-1 text-sm input-emerald-focus" value={accountType} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { const v = e.target.value as ('all' | AccountType); setAccountType(v); setOffset(0); }}>
            <option value="all">All</option>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <button className="px-3 py-1.5 rounded border text-sm hover:bg-gray-200 hover:text-gray-900 transition-colors" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Reload'}
          </button>
          <button className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-50 hover:bg-emerald-700" onClick={updateAll} disabled={loading || !someSelected}>
            Update All
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              {columns.map(c => (
                <th key={c.key} className="px-3 py-2 font-medium text-gray-600">
                  {c.key === 'id' ? (
                    <label className="inline-flex items-center gap-2 select-none">
                      <input
                        className="checkbox-emerald"
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allSelected}
                        onChange={(e) => toggleSelectAllForCurrent(e.target.checked)}
                        aria-checked={allSelected ? 'true' : someSelected ? 'mixed' : 'false'}
                      />
                      <span>User ID</span>
                    </label>
                  ) : c.key === 'subscription_tier' ? (
                    <div className="inline-flex items-center gap-2">
                      <span>Tier</span>
                      <select
                        className="border rounded px-2 py-1 text-xs input-emerald-focus"
                        value={headerTier}
                        onChange={(e) => {
                          const v = e.target.value as '' | Tier;
                          setHeaderTier(v);
                          if (v) { bulkSetTier(v as Tier); setHeaderTier(''); }
                        }}
                        disabled={!someSelected}
                      >
                        <option value="">—</option>
                        <option value="free">free</option>
                        <option value="pro">pro</option>
                        <option value="enterprise">enterprise</option>
                      </select>
                    </div>
                  ) : c.key === 'account_type' ? (
                    <div className="inline-flex items-center gap-2">
                      <span>Account</span>
                      <select
                        className="border rounded px-2 py-1 text-xs input-emerald-focus"
                        value={headerAccountType}
                        onChange={(e) => {
                          const v = e.target.value as '' | AccountType;
                          setHeaderAccountType(v);
                          if (v) { bulkSetAccount(v as AccountType); setHeaderAccountType(''); }
                        }}
                        disabled={!someSelected}
                      >
                        <option value="">—</option>
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </div>
                  ) : c.key === 'credits' ? (
                    <div className="inline-flex items-center gap-2">
                      <span>Credits</span>
                      <input
                        className="border rounded px-2 py-1 text-xs w-24 input-emerald-focus"
                        type="number"
                        placeholder="Set…"
                        value={headerCredits}
                        onChange={(e) => setHeaderCredits(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = parseInt(headerCredits, 10);
                            if (!Number.isNaN(val)) { bulkSetCredits(val); setHeaderCredits(''); }
                          }
                        }}
                        disabled={!someSelected}
                      />
                    </div>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b table-row-hover">
                <td className="px-3 py-2 font-mono text-xs max-w-[360px] truncate" title={row.id}>
                  <label className="inline-flex items-center gap-2">
                    <input className="checkbox-emerald" type="checkbox" checked={!!selected[row.id]} onChange={(e) => setSelected(prev => ({ ...prev, [row.id]: e.target.checked }))} />
                    <span className="truncate" title={row.id}>{row.id}</span>
                  </label>
                </td>
                <td className="px-3 py-2">{row.email}</td>
                <td className="px-3 py-2">{row.full_name || '—'}</td>
                <td className="px-3 py-2">
                  <select className="border rounded px-2 py-1 text-xs input-emerald-focus" value={row.subscription_tier}
                    onChange={(e) => stageRow(row.id, { subscription_tier: e.target.value as Tier })}>
                    <option value="free">free</option>
                    <option value="pro">pro</option>
                    <option value="enterprise">enterprise</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select className="border rounded px-2 py-1 text-xs input-emerald-focus" value={row.account_type}
                    onChange={(e) => stageRow(row.id, { account_type: e.target.value as AccountType })}>
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input className="border rounded px-2 py-1 text-xs w-24 input-emerald-focus" type="number" value={row.credits}
                    onChange={(e) => {
                      const val = parseInt(e.target.value || '0', 10);
                      stageRow(row.id, { credits: Number.isNaN(val) ? 0 : val });
                    }} />
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">{row.last_active ? new Date(row.last_active).toLocaleString() : '—'}</td>
                <td className="px-3 py-2">
                  <button className="px-2 py-1 rounded border text-xs hover:bg-gray-200 hover:text-gray-900 transition-colors" onClick={() => load()}>
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

      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-gray-600">Showing {pageInfo.from}–{pageInfo.to}{counts.filtered ? ` of ${counts.filtered}` : ''}</div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 rounded border text-xs disabled:opacity-50" disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}>Prev</button>
          <button className="px-2 py-1 rounded border text-xs disabled:opacity-50" disabled={(counts.filtered ?? 0) <= offset + limit}
            onClick={() => setOffset(offset + limit)}>Next</button>
          <select className="border rounded px-2 py-1 text-xs input-emerald-focus" value={limit}
            onChange={(e) => { setLimit(parseInt(e.target.value, 10)); setOffset(0); }}>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>
      </div>
    </section>
  );
}
