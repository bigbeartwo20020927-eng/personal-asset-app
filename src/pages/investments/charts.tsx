import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SeriesChart, type LineDef } from '../../components/SeriesChart';
import type { RealizedEvent } from '../../domain/holdings';
import type { PortfolioPoint } from '../../domain/portfolio';
import type { Granularity } from '../../domain/series';
import { fmt } from '../../format';
import { Empty, Money, Tabs } from '../../components/ui';

export const PALETTE = ['#0f766e', '#2563eb', '#d97706', '#db2777', '#7c3aed', '#059669', '#dc2626', '#0891b2', '#65a30d', '#9333ea', '#ea580c', '#475569'];

export interface MetricDef {
  key: keyof Omit<PortfolioPoint, 'date' | 'bySymbol'>;
  name: string;
  color: string;
}

/** 可以勾選開關的多條線 */
export function ToggleLines({ points, metrics, granularity }: { points: PortfolioPoint[]; metrics: MetricDef[]; granularity: Granularity }) {
  const [on, setOn] = useState<Set<string>>(new Set(metrics.map((m) => m.key)));
  const lines: LineDef[] = metrics
    .filter((m) => on.has(m.key))
    .map((m) => ({ key: m.key, name: m.name, color: m.color, points: points.map((p) => ({ date: p.date, value: Math.round(p[m.key]) })) }));
  return (
    <>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {metrics.map((m) => {
          const active = on.has(m.key);
          return (
            <button
              key={m.key}
              onClick={() =>
                setOn((s) => {
                  const n = new Set(s);
                  if (n.has(m.key)) n.delete(m.key);
                  else n.add(m.key);
                  return n;
                })
              }
              className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${active ? 'border-slate-300 bg-white' : 'border-transparent bg-slate-100 text-slate-400'}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: active ? m.color : '#cbd5e1' }} />
              {m.name}
            </button>
          );
        })}
      </div>
      <SeriesChart lines={lines} granularity={granularity} />
    </>
  );
}

/** 個股市值堆疊面積圖 */
export function StackedSymbols({ points, names }: { points: PortfolioPoint[]; names: Map<string, string> }) {
  const symbols = [...new Set(points.flatMap((p) => Object.keys(p.bySymbol)))];
  if (symbols.length === 0) return <Empty>還沒有持股</Empty>;
  const rows = points.map((p) => {
    const row: Record<string, number | string> = { date: p.date };
    for (const s of symbols) row[s] = Math.round(p.bySymbol[s] ?? 0);
    return row;
  });
  return (
    <div className="h-64">
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} minTickGap={24} tickFormatter={(d) => String(d).slice(2)} />
          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} width={48} tickFormatter={(v) => (Math.abs(v) >= 1e4 ? `${Math.round(v / 1e4)}萬` : String(v))} />
          <Tooltip formatter={(v, n) => [fmt(Number(v)), `${n} ${names.get(String(n)) ?? ''}`]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {symbols.map((s, i) => (
            <Area key={s} type="linear" dataKey={s} stackId="1" stroke={PALETTE[i % PALETTE.length]} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.5} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

type Period = 'year' | 'month' | 'day';

/** 依年／月／日彙總已實現損益或當沖損益 */
export function PeriodSummary({ title, events, empty }: { title: string; events: RealizedEvent[]; empty: string }) {
  const [period, setPeriod] = useState<Period>('month');
  const len = period === 'year' ? 4 : period === 'month' ? 7 : 10;
  const groups = new Map<string, number>();
  for (const e of events) groups.set(e.date.slice(0, len), (groups.get(e.date.slice(0, len)) ?? 0) + e.amount);
  const list = [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  const total = events.reduce((s, e) => s + e.amount, 0);
  return (
    <div className="card">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <div className="w-36">
          <Tabs
            value={period}
            onChange={setPeriod}
            items={[
              { key: 'year', label: '年' },
              { key: 'month', label: '月' },
              { key: 'day', label: '日' },
            ]}
          />
        </div>
      </div>
      {list.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <>
          <div className="mb-1 flex justify-between border-b border-slate-100 pb-2 text-sm">
            <span className="text-slate-500">累計</span>
            <Money value={total} colored className="font-semibold" />
          </div>
          <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto text-sm">
            {list.map(([k, v]) => (
              <div key={k} className="flex justify-between py-1.5">
                <span>{period === 'year' ? `${k} 年` : period === 'month' ? `${k.slice(0, 4)} 年 ${Number(k.slice(5))} 月` : k}</span>
                <Money value={v} colored />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
