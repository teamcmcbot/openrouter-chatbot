"use client";
import { useCallback, useEffect, useState } from 'react';

interface CostItem {
  assistant_message_id: string;
  session_id: string;
  model_id: string;
  message_timestamp: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_cost: string;
  completion_cost: string;
  total_cost: string;
}

interface TopModelRow { model_id: string; total_tokens: number; total_cost: number; share_tokens: number; share_cost: number; }

interface CostsResponse {
  items: CostItem[];
  pagination: { page: number; page_size: number; total: number; total_pages: number };
  summary: { prompt_tokens: number; completion_tokens: number; total_tokens: number; total_cost: number; cost_per_1k: number; top_models: { by_tokens: TopModelRow[]; by_cost: TopModelRow[] } };
  range: { start: string; end: string; key: string };
}

const presets = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 Days' },
  { key: '30d', label: 'Last 30 Days' },
];

export default function UsageCostsPage() {
  const [rangeKey, setRangeKey] = useState('7d');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [modelFilter, setModelFilter] = useState('');
  const [data, setData] = useState<CostsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Persist model options across filtered fetches so the list isn't narrowed permanently.
  const [modelOptions, setModelOptions] = useState<string[]>([]);

  const fetchData = useCallback(() => {
    setLoading(true); setError(null);
    const params = new URLSearchParams({ range: rangeKey, page: String(page), page_size: String(pageSize) });
    if (modelFilter) params.set('model_id', modelFilter);
    fetch(`/api/usage/costs?${params.toString()}`)
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) throw new Error(j.error || 'Request failed');
        setData(j);
        // Merge new models into persistent options set using functional update to avoid stale closure
        setModelOptions(prev => {
          const s = new Set(prev);
            j.items.forEach((i: CostItem) => { if (i.model_id) s.add(i.model_id); });
            j.summary.top_models.by_tokens.forEach((m: TopModelRow) => s.add(m.model_id));
            j.summary.top_models.by_cost.forEach((m: TopModelRow) => s.add(m.model_id));
          return Array.from(s).sort();
        });
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [rangeKey, page, pageSize, modelFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fmt = (n: number | string) => typeof n === 'number' ? n.toLocaleString(undefined, { maximumFractionDigits: 6 }) : n;

  return (
  <div className="p-6 max-w-[1440px] mx-auto space-y-8">
      <h1 className="text-2xl font-semibold">Usage Costs</h1>
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex gap-2">
          {presets.map(p => (
            <button key={p.key} onClick={() => { setRangeKey(p.key); setPage(1); }} className={`px-3 py-1.5 rounded-md text-sm border ${rangeKey===p.key? 'bg-emerald-600 text-white border-emerald-600':'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>{p.label}</button>
          ))}
        </div>
        <div>
          <label className="block text-xs mb-1">Model</label>
          <select value={modelFilter} onChange={e => { setModelFilter(e.target.value); setPage(1); }}
                  className="px-2 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm min-w-[220px]">
            <option value="">All models</option>
            {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1">Page Size</label>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="px-2 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm">
            {[25,50,100,150,200].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="ml-auto">
          <button onClick={fetchData} className="px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-100 dark:hover:bg-gray-800">Refresh</button>
        </div>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="text-xs text-gray-500 mb-1">Total Cost</div>
          <div className="text-lg font-semibold">${fmt(data?.summary.total_cost || 0)}</div>
        </div>
        <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="text-xs text-gray-500 mb-1">Total Tokens</div>
          <div className="text-lg font-semibold">
            {fmt(data?.summary.total_tokens || 0)}{' '}
            {data && <span className="text-[11px] font-normal text-gray-500">({fmt(data.summary.prompt_tokens)} input / {fmt(data.summary.completion_tokens)} output)</span>}
          </div>
        </div>
        <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="text-xs text-gray-500 mb-1">Cost / 1K Tokens</div>
          <div className="text-lg font-semibold">${fmt(data?.summary.cost_per_1k || 0)}</div>
        </div>
        <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="text-xs text-gray-500 mb-1">Top Model (Tokens)</div>
          <div className="text-lg font-semibold truncate">{data?.summary.top_models.by_tokens[0]?.model_id || '—'}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8 items-start">
        <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">Top Models by Tokens</h2>
          <table className="w-full text-xs border-separate border-spacing-y-1 mt-1">
            <thead className="text-gray-600 dark:text-gray-500">
              <tr><th className="text-left">Model</th><th className="text-right">Tokens</th><th className="text-right">Cost</th><th className="text-right">%Tokens</th><th className="text-right">%Cost</th></tr>
            </thead>
            <tbody>
              {data?.summary.top_models.by_tokens.map(r => (
                <tr key={r.model_id} className="bg-white dark:bg-gray-900 even:bg-gray-50 dark:even:bg-gray-800">
                  <td className="py-1 pr-2 font-medium">{r.model_id}</td>
                  <td className="py-1 text-right">{fmt(r.total_tokens)}</td>
                  <td className="py-1 text-right">${fmt(r.total_cost)}</td>
                  <td className="py-1 text-right">{r.share_tokens}%</td>
                  <td className="py-1 text-right">{r.share_cost}%</td>
                </tr>
              )) || <tr><td colSpan={5}>No data</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm md:border-l md:border-gray-200 dark:md:border-gray-700 md:pl-6">
          <h2 className="text-sm font-semibold mb-3">Top Models by Cost</h2>
          <table className="w-full text-xs border-separate border-spacing-y-1 mt-1">
            <thead className="text-gray-600 dark:text-gray-500">
              <tr><th className="text-left">Model</th><th className="text-right">Tokens</th><th className="text-right">Cost</th><th className="text-right">%Tokens</th><th className="text-right">%Cost</th></tr>
            </thead>
            <tbody>
              {data?.summary.top_models.by_cost.map(r => (
                <tr key={r.model_id} className="bg-white dark:bg-gray-900 even:bg-gray-50 dark:even:bg-gray-800">
                  <td className="py-1 pr-2 font-medium">{r.model_id}</td>
                  <td className="py-1 text-right">{fmt(r.total_tokens)}</td>
                  <td className="py-1 text-right">${fmt(r.total_cost)}</td>
                  <td className="py-1 text-right">{r.share_tokens}%</td>
                  <td className="py-1 text-right">{r.share_cost}%</td>
                </tr>
              )) || <tr><td colSpan={5}>No data</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-x-auto">
        <h2 className="text-sm font-semibold mb-2">Per-Message Costs</h2>
  <table className="w-full text-xs min-w-[820px] border-separate border-spacing-y-2">
      <thead className="text-gray-600 dark:text-gray-500">
            <tr>
              <th className="text-left">Timestamp</th>
              <th className="text-left">Model</th>
              <th className="text-right font-mono">Input Tokens</th>
              <th className="text-right font-mono">Output Tokens</th>
              <th className="text-right font-mono">Total Tokens</th>
              <th className="text-right font-mono">Input Cost</th>
              <th className="text-right font-mono">Output Cost</th>
              <th className="text-right font-mono">Total Cost</th>
            </tr>
          </thead>
          <tbody>
      {loading && <tr><td colSpan={8} className="py-4 text-center text-gray-500">Loading...</td></tr>}
      {!loading && data?.items.length === 0 && <tr><td colSpan={8} className="py-4 text-center text-gray-500">No data</td></tr>}
            {!loading && data?.items.map(item => (
              <tr key={item.assistant_message_id} className="bg-white dark:bg-gray-900 even:bg-gray-50 dark:even:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800/70 transition-colors shadow-sm">
                <td className="py-2 pr-3 whitespace-nowrap text-[11px]">{new Date(item.message_timestamp).toLocaleString()}</td>
                <td className="py-2 pr-3 text-xs font-medium">{item.model_id || '—'}</td>
                <td className="py-2 text-right font-mono tabular-nums">{item.prompt_tokens}</td>
                <td className="py-2 text-right font-mono tabular-nums">{item.completion_tokens}</td>
                <td className="py-2 text-right font-mono tabular-nums">{item.total_tokens}</td>
                <td className="py-2 text-right font-mono tabular-nums">${item.prompt_cost}</td>
                <td className="py-2 text-right font-mono tabular-nums">${item.completion_cost}</td>
                <td className="py-2 text-right font-mono tabular-nums font-semibold">${item.total_cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <span>Page {data?.pagination.page || page} / {data?.pagination.total_pages || 1}</span>
        <button disabled={page<=1 || loading} onClick={()=> setPage(p=> p-1)} className="px-2 py-1 border rounded disabled:opacity-40">Prev</button>
        <button disabled={!!data && (page >= data.pagination.total_pages) || loading} onClick={()=> setPage(p=> p+1)} className="px-2 py-1 border rounded disabled:opacity-40">Next</button>
        <span className="ml-auto text-gray-500">Range {data?.range.start} → {data?.range.end}</span>
      </div>
    </div>
  );
}
