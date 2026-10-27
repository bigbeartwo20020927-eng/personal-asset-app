import { useState } from 'react';
import { Area, AreaChart, Brush, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Granularity, SeriesPoint } from '../domain/series';
import { fmt } from '../format';

export const GRANULARITIES: Granularity[] = ['1D', '1M', '3M', '1Y'];

export function GranularityPicker({ value, onChange }: { value: Granularity; onChange: (g: Granularity) => void }) {
  return (
    <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
      {GRANULARITIES.map((g) => (
        <button key={g} onClick={() => onChange(g)} className={`rounded-md px-2.5 py-1 ${value === g ? 'bg-white font-medium shadow-sm' : 'text-slate-500'}`}>
          {g}
        </button>
      ))}
    </div>
  );
}

export interface LineDef {
  key: string;
  name: string;
  color: string;
  points: SeriesPoint[];
}

/** 把多條線合併成 Recharts 需要的列資料 */
function mergeLines(lines: LineDef[]): Record<string, number | string>[] {
  const byDate = new Map<string, Record<string, number | string>>();
  for (const l of lines) {
    for (const p of l.points) {
      const row = byDate.get(p.date) ?? { date: p.date };
      row[l.key] = p.value;
      byDate.set(p.date, row);
    }
  }
  return [...byDate.values()].sort((a, b) => ((a.date as string) < (b.date as string) ? -1 : 1));
}

function shortDate(d: string, g: Granularity): string {
  if (g === '1Y') return d.slice(0, 4);
  if (g === '1M' || g === '3M') return d.slice(0, 7);
  return d.slice(5);
}

function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${(n / 1e8).toFixed(1)}億`;
  if (abs >= 1e4) return `${(n / 1e4).toFixed(abs >= 1e6 ? 0 : 1)}萬`;
  return String(Math.round(n));
}

/** 多條折線（或單條面積）的曲線圖；點數多時下方出現可拖曳的區間選擇條 */
export function SeriesChart({
  lines,
  granularity,
  currency = 'TWD',
  height = 240,
  area = false,
}: {
  lines: LineDef[];
  granularity: Granularity;
  currency?: string;
  height?: number;
  area?: boolean;
}) {
  const data = mergeLines(lines);
  if (data.length === 0) return <div className="flex h-32 items-center justify-center text-sm text-slate-400">還沒有資料</div>;
  const brush = data.length > 40;
  const common = {
    data,
    margin: { top: 8, right: 8, left: 0, bottom: 0 },
  };
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
      <XAxis dataKey="date" tickFormatter={(d) => shortDate(d, granularity)} tick={{ fontSize: 11, fill: '#64748b' }} minTickGap={24} />
      <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: '#64748b' }} width={48} />
      <Tooltip
        formatter={(v, name) => [fmt(Number(v), currency), String(name)]}
        labelFormatter={(d) => String(d)}
        contentStyle={{ borderRadius: 8, fontSize: 12 }}
      />
      {lines.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
      {brush && (
        <Brush dataKey="date" height={22} stroke="#0f766e" tickFormatter={(d) => shortDate(d, granularity)} startIndex={Math.max(0, data.length - 30)} />
      )}
    </>
  );
  return (
    <div style={{ height: height + (brush ? 30 : 0) }}>
      <ResponsiveContainer width="100%" height="100%">
        {area && lines.length === 1 ? (
          <AreaChart {...common}>
            {axes}
            <Area type="linear" dataKey={lines[0].key} name={lines[0].name} stroke={lines[0].color} fill={lines[0].color} fillOpacity={0.12} strokeWidth={2} />
          </AreaChart>
        ) : (
          <LineChart {...common}>
            {axes}
            {lines.map((l) => (
              <Line key={l.key} type="linear" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2} dot={false} connectNulls />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function useGranularity(initial: Granularity = '1M') {
  return useState<Granularity>(initial);
}
