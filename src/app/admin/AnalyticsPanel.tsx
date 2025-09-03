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

// Types shared across tabs
  interface OverviewTopModel { model_id: string; total_cost: number; total_tokens: number; }
  interface OverviewResponse {
    ok: boolean;
    totals: { users: number; conversations: number; messages: number; usage_7d: { total_tokens: number; messages: number }; costs_7d: { total_cost: number; total_tokens: number; assistant_messages: number } };
    top_models: OverviewTopModel[];
    segments?: {
      authenticated: {
        totals: { messages: number };
        usage_7d: { total_tokens: number; messages: number };
        costs_7d: { total_cost: number; total_tokens: number; assistant_messages: number };
        top_models: OverviewTopModel[];
      };
      anonymous: {
        usage_7d: { total_tokens: number; messages: number; anon_sessions?: number };
        costs_7d: { total_cost: number; total_tokens: number; assistant_messages: number };
        top_models: OverviewTopModel[];
      };
    };
  }
  interface CostsResponse {
    ok: boolean;
    totals: { total_cost: number; total_tokens: number; assistant_messages: number };
    stacked_cost: StackedBarData;
    stacked_tokens: StackedBarData;
    segments?: {
      authenticated: { totals: { total_cost: number; total_tokens: number; assistant_messages: number }; stacked_cost: StackedBarData; stacked_tokens: StackedBarData };
      anonymous: { totals: { total_cost: number; total_tokens: number; assistant_messages: number }; stacked_cost: StackedBarData; stacked_tokens: StackedBarData };
    };
  }
  interface PerformanceResponse { ok: boolean; overall: { avg_ms: number; error_count: number }; segments?: { authenticated: { overall: { avg_ms: number; error_count: number } }; anonymous: { overall: { avg_ms: number; error_count: number } } } }
  interface ErrorRow { message_id: string; session_id: string; user_id: string | null; model: string | null; message_timestamp: string; error_message: string | null; completion_id: string | null; user_message_id: string | null; elapsed_ms: number | null }
  interface ErrorsResponse { ok: boolean; range: { start: string; end: string }; errors: ErrorRow[] }
  interface UsageDay { date: string; active_users: number; messages: number; tokens: number }
  interface UsageResponse { ok: boolean; total_messages: number; daily: UsageDay[]; segments?: { authenticated: { daily: UsageDay[] }; anonymous: { daily: UsageDay[] } } }
  interface ModelsCounts { total_count: number; new_count: number; active_count: number; inactive_count: number; disabled_count: number }
  interface ModelsRecent { day: string; models_added: number; models_marked_inactive: number; models_reactivated: number }
  interface ModelsResponse { ok: boolean; counts: ModelsCounts; recent: ModelsRecent[] }

  // Tab components (fetch only when mounted)
  function OverviewTab({ range, setRange }: { range: RangeKey; setRange: (v: RangeKey)=>void }) {
    const q = useMemo(() => `?range=${range}`, [range]);
    const overview = useFetch<OverviewResponse>(`/api/admin/analytics/overview${q}`, [q]);
    const [segment, setSegment] = useState<'authenticated'|'anonymous'>('authenticated');
    const topModels = useMemo(() => {
      if (!overview.data) return [] as OverviewTopModel[];
      if (segment === 'anonymous' && overview.data.segments) return overview.data.segments.anonymous.top_models || [];
      return overview.data.top_models || [];
    }, [overview.data, segment]);
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Overview</h3>
          <div className="flex items-center gap-2">
            {overview.data?.segments && <SegmentToggle value={segment} onChange={setSegment} />}
            <RangePicker value={range} onChange={setRange} />
          </div>
        </div>
        {overview.loading && <div className="text-xs text-gray-500">Loading…</div>}
        {overview.error && <div className="text-xs text-red-600">{overview.error}</div>}
        {overview.data && (
          <div className="grid md:grid-cols-3 gap-3">
            {segment === 'anonymous' && overview.data.segments ? (
              <>
                <div className="p-3 border rounded-md">
                  <div className="text-xs text-gray-500">Anon sessions</div>
                  <div className="text-xl font-semibold">{overview.data.segments.anonymous.usage_7d?.anon_sessions ?? 0}</div>
                </div>
                <div className="p-3 border rounded-md">
                  <div className="text-xs text-gray-500">Messages (7d)</div>
                  <div className="text-xl font-semibold">{overview.data.segments.anonymous.usage_7d?.messages ?? 0}</div>
                </div>
                <div className="p-3 border rounded-md">
                  <div className="text-xs text-gray-500">Est. cost (7d)</div>
                  <div className="text-xl font-semibold">${(overview.data.segments.anonymous.costs_7d?.total_cost ?? 0).toFixed(4)}</div>
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
            <div className="p-3 border rounded-md md:col-span-3">
              <div className="text-xs text-gray-500 mb-2">Top models (by cost)</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="text-left font-medium py-1 pr-2">Model</th>
                      <th className="text-right font-medium py-1 pr-2">Cost</th>
                      <th className="text-right font-medium py-1">Tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(topModels || []).map((m: OverviewTopModel) => (
                      <tr key={m.model_id} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="py-1 pr-2 font-mono break-all">{m.model_id}</td>
                        <td className="py-1 pr-2 text-right">${(Number(m.total_cost ?? 0)).toFixed(4)}</td>
                        <td className="py-1 text-right">{Number(m.total_tokens ?? 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function SegmentToggle({ value, onChange }: { value: 'authenticated'|'anonymous'; onChange: (v: 'authenticated'|'anonymous')=>void }) {
    return (
      <div className="flex gap-1 border rounded-md p-1 text-xs">
        {(['authenticated','anonymous'] as const).map((s) => (
          <button key={s} className={`px-2 py-0.5 rounded ${value===s? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900':''}`} onClick={()=>onChange(s)}>{s}</button>
        ))}
      </div>
    );
  }

  function CostsTab({ range, setRange }: { range: RangeKey; setRange: (v: RangeKey)=>void }) {
    const q = useMemo(() => `?range=${range}`, [range]);
    const costs = useFetch<CostsResponse>(`/api/admin/analytics/costs${q}`, [q]);
    const [segment, setSegment] = useState<'authenticated'|'anonymous'>('authenticated');
    const view = useMemo(() => {
      if (!costs.data?.segments) return null;
      return costs.data.segments[segment];
    }, [costs.data, segment]);
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Costs</h3>
          <div className="flex items-center gap-2">
            <SegmentToggle value={segment} onChange={setSegment} />
            <RangePicker value={range} onChange={setRange} />
          </div>
        </div>
        {costs.loading && <div className="text-xs text-gray-500">Loading…</div>}
        {costs.error && <div className="text-xs text-red-600">{costs.error}</div>}
        {costs.data && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 border rounded-md"><div className="text-xs text-gray-500">Total cost</div><div className="text-xl font-semibold">${(view?.totals?.total_cost ?? costs.data.totals?.total_cost ?? 0).toFixed(4)}</div></div>
              <div className="p-3 border rounded-md"><div className="text-xs text-gray-500">Tokens</div><div className="text-xl font-semibold">{view?.totals?.total_tokens ?? costs.data.totals?.total_tokens ?? 0}</div></div>
              <div className="p-3 border rounded-md"><div className="text-xs text-gray-500">Assistant msgs</div><div className="text-xl font-semibold">{view?.totals?.assistant_messages ?? costs.data.totals?.assistant_messages ?? 0}</div></div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Cost by model</div>
              <StackedBarChart data={view?.stacked_cost ?? costs.data.stacked_cost} metric="cost" height={260} hideSingleDay={true} />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Tokens by model</div>
              <StackedBarChart data={view?.stacked_tokens ?? costs.data.stacked_tokens} metric="tokens" height={260} hideSingleDay={true} />
            </div>
          </div>
        )}
      </div>
    );
  }

  function PerformanceTab({ range, setRange }: { range: RangeKey; setRange: (v: RangeKey)=>void }) {
    const q = useMemo(() => `?range=${range}`, [range]);
  const performance = useFetch<PerformanceResponse>(`/api/admin/analytics/performance${q}`, [q]);
  const [segment, setSegment] = useState<'authenticated'|'anonymous'>('authenticated');
  const errors = useFetch<ErrorsResponse>(`/api/admin/analytics/performance/errors${q}&segment=${segment}`, [q, segment]);
  // Local state for copy button feedback per message id
  const [copiedId, setCopiedId] = useState<string | null>(null);
    // Derive metrics to reduce nested ternaries
    const avgMs = useMemo(() => {
      if (!performance.data) return 0;
      if (!performance.data.segments) return performance.data.overall?.avg_ms ?? 0;
      return segment === 'anonymous'
        ? performance.data.segments.anonymous.overall.avg_ms
        : performance.data.segments.authenticated.overall.avg_ms;
    }, [performance.data, segment]);
    const errorCount = useMemo(() => {
      if (!performance.data) return 0;
      if (!performance.data.segments) return performance.data.overall?.error_count ?? 0;
      return segment === 'anonymous'
        ? performance.data.segments.anonymous.overall.error_count
        : performance.data.segments.authenticated.overall.error_count;
    }, [performance.data, segment]);
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Performance</h3>
          <div className="flex items-center gap-2">
            <SegmentToggle value={segment} onChange={setSegment} />
            <RangePicker value={range} onChange={setRange} />
          </div>
        </div>
        {performance.loading && <div className="text-xs text-gray-500">Loading…</div>}
        {performance.error && <div className="text-xs text-red-600">{performance.error}</div>}
        {performance.data && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 border rounded-md">
                <div className="text-xs text-gray-500">Avg latency</div>
                <div className="text-xl font-semibold">{avgMs} ms</div>
              </div>
              <div className="p-3 border rounded-md">
                <div className="text-xs text-gray-500">Errors</div>
                <div className="text-xl font-semibold">{errorCount}</div>
              </div>
            </div>
            <div className="p-3 border rounded-md">
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">Last 100 errors</div>
                {errors.loading && <div className="text-xs text-gray-400">Loading…</div>}
              </div>
              {errors.error && <div className="text-xs text-red-600">{errors.error}</div>}
              {errors.data && (
                <div className="overflow-x-auto mt-2">
                  <table className="w-full text-xs">
                    <thead className="text-gray-500">
                      <tr>
                        <th className="text-left font-medium py-1 pr-2">Time</th>
                        <th className="text-left font-medium py-1 pr-2">Model</th>
                        <th className="text-left font-medium py-1 pr-2">Message</th>
                        <th className="text-left font-medium py-1">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(errors.data.errors || []).map((e: ErrorRow) => (
                        <tr key={e.message_id} className="border-t border-gray-100 dark:border-gray-800">
                          <td className="py-1 pr-2 whitespace-nowrap font-mono text-gray-600 dark:text-gray-400">{(() => { const d = new Date(e.message_timestamp); return isNaN(d.getTime()) ? '-' : d.toLocaleString(); })()}</td>
                          <td className="py-1 pr-2 font-mono break-all text-gray-600 dark:text-gray-400">{e.model || 'unknown'}</td>
                          <td className="py-1 pr-2 font-mono break-all text-gray-800 dark:text-gray-300">
                            <div className="flex items-center gap-2">
                              <span className="break-all">{e.message_id}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard?.writeText(e.message_id);
                                  setCopiedId(e.message_id);
                                  window.setTimeout(() => setCopiedId(null), 1500);
                                }}
                                className="ml-1 p-1 rounded transition-colors hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-400 dark:text-gray-300"
                                title={copiedId === e.message_id ? 'Copied!' : 'Copy message id'}
                                aria-label="Copy message id"
                              >
                                {copiedId === e.message_id ? (
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                )}
                              </button>
                            </div>
                          </td>
                          <td className="py-1 pr-2 leading-snug font-semibold text-slate-900 dark:text-slate-100 max-w-[640px] truncate" title={e.error_message || ''}>{e.error_message || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  function UsageTab({ range, setRange }: { range: RangeKey; setRange: (v: RangeKey)=>void }) {
    const q = useMemo(() => `?range=${range}`, [range]);
    const usage = useFetch<UsageResponse>(`/api/admin/analytics/usage${q}`, [q]);
    const [segment, setSegment] = useState<'authenticated'|'anonymous'>('authenticated');
    const daily = useMemo(() => {
      if (!usage.data?.segments) return usage.data?.daily ?? [];
      return segment==='anonymous' ? usage.data.segments.anonymous.daily : usage.data.segments.authenticated.daily;
    }, [usage.data, segment]);
    // Ensure daily rows are ordered by date desc for readability
    const dailySorted = useMemo(() => {
      const days = daily ?? [] as UsageDay[];
      return [...days].sort((a: UsageDay, b: UsageDay) => b.date.localeCompare(a.date));
    }, [daily]);
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Usage</h3>
          <div className="flex items-center gap-2">
            <SegmentToggle value={segment} onChange={setSegment} />
            <RangePicker value={range} onChange={setRange} />
          </div>
        </div>
        {usage.loading && <div className="text-xs text-gray-500">Loading…</div>}
        {usage.error && <div className="text-xs text-red-600">{usage.error}</div>}
        {usage.data && (
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 border rounded-md">
              <div className="text-xs text-gray-500">Messages (range)</div>
              <div className="text-xl font-semibold">{segment==='anonymous' ? (usage.data.segments?.anonymous.daily.reduce((a, d) => a + (d.messages || 0), 0) ?? 0) : (usage.data.total_messages ?? 0)}</div>
            </div>
            <div className="p-3 border rounded-md col-span-2">
              <div className="text-xs text-gray-500">Daily active users (rough)</div>
              <div className="mt-2 overflow-x-auto max-h-40 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="text-left font-medium py-1 pr-2">Date</th>
                      <th className="text-right font-medium py-1 pr-2">Active users</th>
                      <th className="text-right font-medium py-1">Messages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailySorted.map((d: UsageDay) => (
                      <tr key={d.date} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="py-1 pr-2 font-mono text-gray-700 dark:text-gray-300">{d.date}</td>
                        <td className="py-1 pr-2 text-right font-semibold">{d.active_users}</td>
                        <td className="py-1 text-right text-gray-700 dark:text-gray-300">{d.messages}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function ModelsTab() {
    const models = useFetch<ModelsResponse>(`/api/admin/analytics/models`, []);
    return (
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
              {(() => {
                // Sort most recent first for quick scanning
                const recentSorted = [...(models.data?.recent || [])].sort((a, b) => b.day.localeCompare(a.day));
                const fmtIsoDate = (iso: string) => (typeof iso === 'string' && iso.length >= 10 ? iso.slice(0, 10) : iso);
                return (
                  <div className="mt-2 overflow-x-auto max-h-56 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="text-gray-500">
                        <tr>
                          <th className="text-left font-medium py-1 pr-2">Date</th>
              <th className="text-right font-medium py-1 pr-2">Added</th>
              <th className="text-right font-medium py-1 pr-2">Inactive</th>
              <th className="text-right font-medium py-1 pr-2">Reactivated</th>
                          <th className="text-right font-medium py-1">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentSorted.map((r: ModelsRecent) => {
              const total = (r.models_added || 0) + (r.models_marked_inactive || 0) + (r.models_reactivated || 0);
                          const cell = (val: number) => (
                            <span className={val === 0 ? 'text-gray-400' : 'font-semibold'}>{val}</span>
                          );
                          return (
                            <tr key={r.day} className="border-t border-gray-100 dark:border-gray-800">
                              <td className="py-1 pr-2 font-mono text-gray-700 dark:text-gray-300" title={r.day}>{fmtIsoDate(r.day)}</td>
                <td className="py-1 pr-2 text-right">{cell(r.models_added)}</td>
                <td className="py-1 pr-2 text-right">{cell(r.models_marked_inactive)}</td>
                <td className="py-1 pr-2 text-right">{cell(r.models_reactivated)}</td>
                              <td className="py-1 text-right">{cell(total)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    );
  }

export default function AnalyticsPanel() {
  const [range, setRange] = useState<RangeKey>('7d');

  const tabs = [
    {
      id: 'overview',
      label: 'Overview',
      content: (<OverviewTab range={range} setRange={setRange} />)
    },
    {
      id: 'costs',
      label: 'Costs',
      content: (<CostsTab range={range} setRange={setRange} />)
    },
    {
      id: 'performance',
      label: 'Performance',
      content: (<PerformanceTab range={range} setRange={setRange} />)
    },
    {
      id: 'usage',
      label: 'Usage',
      content: (<UsageTab range={range} setRange={setRange} />)
    },
    {
      id: 'models',
      label: 'Models',
      content: (<ModelsTab />)
    },
  ];

  return (
    <section className="space-y-3 border rounded-md p-4">
      <h2 className="text-lg font-semibold">Analytics</h2>
      <ClientTabs tabs={tabs} defaultTab="overview" />
    </section>
  );
}
