"use client";
import React, { useEffect, useMemo, useState } from 'react';
import ClientTabs from './tabs';
import StackedBarChart, { StackedBarData } from '../../../components/analytics/StackedBarChart';

type RangeKey = 'today'|'7d'|'30d';

function useFetch<T>(url: string, deps: ReadonlyArray<unknown> = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let isMounted = true;
    setLoading(true); setError(null);
    fetch(url)
      .then(r => r.json())
      .then((j) => { if (isMounted) setData(j as T); })
      .catch((e) => { if (isMounted) setError(String(e)); })
      .finally(() => { if (isMounted) setLoading(false); });
    return () => { isMounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading, error } as const;
}

function RangePicker({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey)=>void }) {
  const opts: RangeKey[] = ['today','7d','30d'];
  return (
    <div className="flex gap-2">
      {opts.map(o => (
        <button key={o}
          className={`px-2 py-1 rounded text-xs border ${value===o? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800':'border-gray-200 dark:border-gray-800 text-gray-600'}`}
          onClick={()=>onChange(o)}
        >{o.toUpperCase()}</button>
      ))}
    </div>
  );
}

export default function AnalyticsPanel() {
  const [range, setRange] = useState<RangeKey>('7d');
  const q = useMemo(() => `?range=${range}`, [range]);

  interface OverviewTopModel { model_id: string; total_cost: number; total_tokens: number; }
  interface OverviewResponse {
    ok: boolean;
    totals: { users: number; conversations: number; messages: number; usage_7d: { total_tokens: number; messages: number }; costs_7d: { total_cost: number; total_tokens: number; assistant_messages: number } };
    top_models: OverviewTopModel[];
  }
  interface CostsResponse {
    ok: boolean;
    totals: { total_cost: number; total_tokens: number; assistant_messages: number };
    stacked_cost: StackedBarData;
    stacked_tokens: StackedBarData;
  }
  interface PerformanceResponse { ok: boolean; overall: { avg_ms: number; error_count: number } }
  interface UsageDay { date: string; active_users: number; messages: number; tokens: number }
  interface UsageResponse { ok: boolean; total_messages: number; daily: UsageDay[] }
  interface ModelsCounts { total_count: number; new_count: number; active_count: number; inactive_count: number; disabled_count: number }
  interface ModelsRecent { day: string; flagged_new: number; flagged_active: number; flagged_inactive: number; flagged_disabled: number }
  interface ModelsResponse { ok: boolean; counts: ModelsCounts; recent: ModelsRecent[] }

  const overview = useFetch<OverviewResponse>(`/api/admin/analytics/overview${q}`, [q]);
  const costs = useFetch<CostsResponse>(`/api/admin/analytics/costs${q}`, [q]);
  const performance = useFetch<PerformanceResponse>(`/api/admin/analytics/performance${q}`, [q]);
  const usage = useFetch<UsageResponse>(`/api/admin/analytics/usage${q}`, [q]);
  const models = useFetch<ModelsResponse>(`/api/admin/analytics/models`, []);

  const tabs = [
    {
      id: 'overview',
      label: 'Overview',
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-semibold">Overview</h3><RangePicker value={range} onChange={setRange} /></div>
          {overview.loading && <div className="text-xs text-gray-500">Loading…</div>}
          {overview.error && <div className="text-xs text-red-600">{overview.error}</div>}
          {overview.data && (
            <div className="grid md:grid-cols-3 gap-3">
              <div className="p-3 border rounded-md">
                <div className="text-xs text-gray-500">Users</div>
                <div className="text-xl font-semibold">{overview.data.totals?.users ?? 0}</div>
              </div>
              <div className="p-3 border rounded-md">
                <div className="text-xs text-gray-500">Conversations</div>
                <div className="text-xl font-semibold">{overview.data.totals?.conversations ?? 0}</div>
              </div>
              <div className="p-3 border rounded-md">
                <div className="text-xs text-gray-500">Messages</div>
                <div className="text-xl font-semibold">{overview.data.totals?.messages ?? 0}</div>
              </div>
              <div className="p-3 border rounded-md md:col-span-3">
                <div className="text-xs text-gray-500">Top models (by cost)</div>
                <div className="flex flex-wrap gap-3 mt-2">
                  {(overview.data.top_models || []).map((m: OverviewTopModel)=> {
                    const cost = typeof m.total_cost === 'number' ? m.total_cost : Number(m.total_cost || 0);
                    return (
                      <div key={m.model_id} className="text-xs">
                        <span className="font-mono">{m.model_id}</span> · {cost.toFixed(4)}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )
    },
    {
      id: 'costs',
      label: 'Costs',
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-semibold">Costs</h3><RangePicker value={range} onChange={setRange} /></div>
          {costs.loading && <div className="text-xs text-gray-500">Loading…</div>}
          {costs.error && <div className="text-xs text-red-600">{costs.error}</div>}
          {costs.data && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 border rounded-md"><div className="text-xs text-gray-500">Total cost</div><div className="text-xl font-semibold">${'{'}(costs.data.totals?.total_cost ?? 0).toFixed(4){'}'}</div></div>
                <div className="p-3 border rounded-md"><div className="text-xs text-gray-500">Tokens</div><div className="text-xl font-semibold">{costs.data.totals?.total_tokens ?? 0}</div></div>
                <div className="p-3 border rounded-md"><div className="text-xs text-gray-500">Assistant msgs</div><div className="text-xl font-semibold">{costs.data.totals?.assistant_messages ?? 0}</div></div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Cost by model</div>
                <StackedBarChart data={costs.data.stacked_cost} metric="cost" height={260} hideSingleDay={true} />
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Tokens by model</div>
                <StackedBarChart data={costs.data.stacked_tokens} metric="tokens" height={260} hideSingleDay={true} />
              </div>
            </div>
          )}
        </div>
      )
    },
    {
      id: 'performance',
      label: 'Performance',
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-semibold">Performance</h3><RangePicker value={range} onChange={setRange} /></div>
          {performance.loading && <div className="text-xs text-gray-500">Loading…</div>}
          {performance.error && <div className="text-xs text-red-600">{performance.error}</div>}
          {performance.data && (
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 border rounded-md">
                <div className="text-xs text-gray-500">Avg latency</div>
                <div className="text-xl font-semibold">{performance.data.overall?.avg_ms ?? 0} ms</div>
              </div>
              <div className="p-3 border rounded-md">
                <div className="text-xs text-gray-500">Errors</div>
                <div className="text-xl font-semibold">{performance.data.overall?.error_count ?? 0}</div>
              </div>
            </div>
          )}
        </div>
      )
    },
    {
      id: 'usage',
      label: 'Usage',
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-semibold">Usage</h3><RangePicker value={range} onChange={setRange} /></div>
          {usage.loading && <div className="text-xs text-gray-500">Loading…</div>}
          {usage.error && <div className="text-xs text-red-600">{usage.error}</div>}
          {usage.data && (
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 border rounded-md">
                <div className="text-xs text-gray-500">Messages (range)</div>
                <div className="text-xl font-semibold">{usage.data.total_messages ?? 0}</div>
              </div>
              <div className="p-3 border rounded-md col-span-2">
                <div className="text-xs text-gray-500">Daily active users (rough)</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600 max-h-24 overflow-y-auto">
                  {(usage.data.daily || []).map((d: UsageDay)=> (
                    <span key={d.date} className="font-mono">{d.date}:{' '}{d.active_users}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )
    },
    {
      id: 'models',
      label: 'Models',
      content: (
        <div className="space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-semibold">Models</h3></div>
          {models.loading && <div className="text-xs text-gray-500">Loading…</div>}
          {models.error && <div className="text-xs text-red-600">{models.error}</div>}
          {models.data && (
            <div className="grid grid-cols-5 gap-3">
              <div className="p-3 border rounded-md"><div className="text-xs text-gray-500">Total</div><div className="text-xl font-semibold">{models.data.counts?.total_count ?? 0}</div></div>
              <div className="p-3 border rounded-md"><div className="text-xs text-gray-500">New</div><div className="text-xl font-semibold">{models.data.counts?.new_count ?? 0}</div></div>
              <div className="p-3 border rounded-md"><div className="text-xs text-gray-500">Active</div><div className="text-xl font-semibold">{models.data.counts?.active_count ?? 0}</div></div>
              <div className="p-3 border rounded-md"><div className="text-xs text-gray-500">Inactive</div><div className="text-xl font-semibold">{models.data.counts?.inactive_count ?? 0}</div></div>
              <div className="p-3 border rounded-md"><div className="text-xs text-gray-500">Disabled</div><div className="text-xl font-semibold">{models.data.counts?.disabled_count ?? 0}</div></div>
              <div className="md:col-span-5 p-3 border rounded-md">
                <div className="text-xs text-gray-500">Recent changes (30d)</div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-gray-700">
                  {(models.data.recent || []).map((r: ModelsRecent)=> (
                    <div key={r.day} className="p-2 border rounded">
                      <div className="font-mono">{r.day}</div>
                      <div className="grid grid-cols-4 gap-1">
                        <div>N:{'{'}r.flagged_new{'}'}</div>
                        <div>A:{'{'}r.flagged_active{'}'}</div>
                        <div>I:{'{'}r.flagged_inactive{'}'}</div>
                        <div>D:{'{'}r.flagged_disabled{'}'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )
    },
  ];

  return (
    <section className="space-y-3 border rounded-md p-4">
      <h2 className="text-lg font-semibold">Analytics</h2>
      <ClientTabs tabs={tabs} defaultTab="overview" />
    </section>
  );
}
