"use client";
import React from 'react';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from 'recharts';

export interface StackedBarDay {
  date: string; // yyyy-mm-dd
  segments: Record<string, number>; // model_id -> value
  others: number;
  total: number;
}

export interface StackedBarData {
  models: string[]; // ordered list of top models
  days: StackedBarDay[];
}

interface Props {
  data: StackedBarData | null;
  metric: 'tokens' | 'cost';
  height?: number;
  hideSingleDay?: boolean; // hide if only 1 day
}

const COLORS = [
  '#14b8a6', // teal
  '#ec4899', // pink
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#f43f5e', // rose
  '#6366f1', // indigo
  '#84cc16', // lime
  '#0ea5e9'  // sky
];

function abbreviate(n: number): string {
  if (!n) return '0';
  if (n >= 1_000_000_000) return (n/1_000_000_000).toFixed(2).replace(/\.0+$/, '') + 'B';
  if (n >= 1_000_000) return (n/1_000_000).toFixed(2).replace(/\.0+$/, '') + 'M';
  if (n >= 1_000) return (n/1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

interface TooltipPayloadItem { dataKey: string; value: number; name: string; color: string; }
interface TooltipProps { active?: boolean; payload?: TooltipPayloadItem[]; label?: string; }
const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  if (!active || !payload || !payload.length || !label) return null;
  const total = payload.reduce((a: number, p) => a + (p.value || 0), 0);
  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs p-2 shadow-lg min-w-[160px]">
      <div className="font-medium mb-1">{new Date(label).toLocaleDateString(undefined,{ day:'2-digit', month:'short', year:'numeric' })}</div>
      <div className="space-y-0.5 max-h-56 overflow-y-auto pr-1">
  {payload.map((p) => (
          <div key={p.dataKey} className="flex justify-between gap-4">
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background:p.color }}></span>{p.name}</span>
            <span className="tabular-nums font-mono">{abbreviate(p.value)}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 pt-1 border-t border-gray-200 dark:border-gray-700 flex justify-between font-semibold">
        <span>Total</span>
        <span className="tabular-nums font-mono">{abbreviate(total)}</span>
      </div>
    </div>
  );
};

export function StackedBarChart({ data, metric, height = 240, hideSingleDay }: Props) {
  if (!data) return <div className="text-xs text-gray-500">No data</div>;
  if (hideSingleDay && data.days.length <= 1) return <div className="text-xs text-gray-500">Chart available for multi-day ranges</div>;
  // transform days into flat objects for recharts
  const flat = data.days.map(day => {
    const row: Record<string, number | string> = { date: day.date, ...day.segments };
    if (day.others) row.Others = day.others;
    return row;
  });
  const modelKeys = [...data.models];
  if (data.days.some(d => d.others > 0)) modelKeys.push('Others');
  return (
    <div style={{ width:'100%', height }} aria-label={`Stacked bar chart for model ${metric}` }>
      <ResponsiveContainer>
        <BarChart data={flat} margin={{ top: 4, left: 4, right: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-800" />
          <XAxis dataKey="date" tick={{ fontSize:11 }} tickFormatter={(d: string)=> new Date(d).toLocaleDateString(undefined,{ day:'2-digit', month:'short' })} />
          <YAxis tick={{ fontSize:11 }} width={50} tickFormatter={abbreviate} />
          <Tooltip 
            content={<CustomTooltip />} 
            cursor={{ 
              fill: 'rgba(156, 163, 175, 0.1)', // gray-400 with 10% opacity for light mode
              className: 'fill-gray-400/10 dark:fill-gray-600/20' // More subtle in dark mode
            }} 
          />
          {modelKeys.map((m, idx) => (
            <Bar key={m} dataKey={m} stackId="a" name={m} fill={COLORS[idx % COLORS.length]} radius={idx === modelKeys.length-1 ? [3,3,0,0]: undefined} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default StackedBarChart;
