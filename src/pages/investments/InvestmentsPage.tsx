import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import SettlementCard from '../../components/SettlementCard';
import { GranularityPicker } from '../../components/SeriesChart';
import { useToast } from '../../components/Toast';
import { Empty, Money, Tabs } from '../../components/ui';
import { useAccountsData } from '../../data/useData';
import { tradeTitle, useInvestments, type InvestmentsData } from '../../data/useInvestments';
import { portfolioSeries } from '../../domain/portfolio';
import { sampleDates, type Granularity } from '../../domain/series';
import { sortTrades, tradeCashFlow } from '../../domain/trades';
import { fmt, fmtPct } from '../../format';
import { refreshPrices, useFillStatus } from '../../market/useMarket';
import type { Trade } from '../../types';
import { PALETTE, PeriodSummary, StackedSymbols, ToggleLines, type MetricDef } from './charts';
import TradeForm from './TradeForm';

const TOTAL_METRICS: MetricDef[] = [
  { key: 'marketValue', name: '市值', color: '#0f766e' },
  { key: 'cost', name: '投入成本', color: '#64748b' },
  { key: 'netPnL', name: '淨損益', color: '#d97706' },
];

export function PriceStatus({ inv }: { inv: InvestmentsData }) {
  const status = useFillStatus();
  const toast = useToast();
  const latest = useMemo(() => {
    let d: string | null = null;
    for (const s of inv.prices.values()) {
      const l = s.latest?.date;
      if (l && (!d || l > d)) d = l;
    }
    return d;
  }, [inv.prices]);
  const refresh = async () => {
    await refreshPrices(inv.trades, inv.symbols);
    toast('股價已更新', 'success');
  };
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
      <span>
        {status.running
          ? `更新股價中… ${status.done}/${status.total}`
          : status.failed.length
            ? `⚠ ${status.failed.join('、')} 抓取失敗（${status.error ?? ''}），可在個股頁手動輸入股價`
            : latest
              ? `股價更新到 ${latest}`
              : '尚未取得股價'}
      </span>
      <button className="btn px-2 py-1 text-xs" onClick={refresh} disabled={status.running}>
        ⟳ 刷新股價
      </button>
    </div>
  );
}

export default function InvestmentsPage() {
  const inv = useInvestments();
  const data = useAccountsData();
  const [gran, setGran] = useState<Granularity>('1M');
  const [chart, setChart] = useState<'trend' | 'stack'>('trend');
  const [form, setForm] = useState<{ edit?: Trade } | null>(null);
  const [showAllTrades, setShowAllTrades] = useState(false);

  const first = useMemo(() => sortTrades(inv.trades)[0]?.tradeDate, [inv.trades]);
  const points = useMemo(
    () => (first ? portfolioSeries(inv.trades, inv.costOpts, inv.ctx, sampleDates(first, inv.today, gran)) : []),
    [inv.trades, inv.costOpts, inv.ctx, first, inv.today, gran],
  );
  const names = useMemo(() => new Map([...inv.symbols.values()].map((s) => [s.code, s.name])), [inv.symbols]);
  const held = inv.holdings.filter((h) => h.position.shares > 0);
  // 持股列表依券商分組
  const byBroker = useMemo(() => {
    const m = new Map<string, typeof held>();
    for (const h of held) m.set(h.accountId, [...(m.get(h.accountId) ?? []), h]);
    return [...m.entries()];
  }, [held]);
  // 持股配置依股票合併（同一支股票各券商加總）
  const bySymbol = useMemo(() => {
    const m = new Map<string, { symbol: string; name: string; value: number }>();
    for (const h of held) {
      const cur = m.get(h.symbol) ?? { symbol: h.symbol, name: h.name, value: 0 };
      cur.value += h.valuation.marketValue;
      m.set(h.symbol, cur);
    }
    return [...m.values()].sort((a, b) => b.value - a.value);
  }, [held]);
  const brokers = data.accounts.filter((a) => a.isBroker && !a.archived);
  const sellEvents = inv.replay.events.filter((e) => e.kind === 'sell');
  const dayEvents = inv.replay.events.filter((e) => e.kind === 'dayTrade');
  const divEvents = inv.replay.events.filter((e) => e.kind === 'dividend');
  const trades = useMemo(() => sortTrades(inv.trades).reverse(), [inv.trades]);
  const T = inv.totals;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">投資</h1>
        <button className="btn-primary" onClick={() => setForm({})}>
          ＋ 新增交易
        </button>
      </div>
      <PriceStatus inv={inv} />

      <div className="card">
        <div className="text-sm text-slate-500">股票市值</div>
        <div className="mt-1 text-2xl font-semibold">
          <Money value={T.marketValue} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="投入成本" value={<Money value={T.cost} />} />
          <Stat
            label="淨未實現損益"
            value={
              <>
                <Money value={T.netUnrealized} colored /> <span className="text-xs text-slate-500">{fmtPct(T.returnPct)}</span>
              </>
            }
          />
          <Stat label="已實現損益" value={<Money value={T.realized} colored />} />
          <Stat label="股利" value={<Money value={T.dividends} colored />} />
          <Stat label="當沖損益" value={<Money value={T.dayTrade} colored />} />
          <Stat label="年化報酬率（XIRR）" value={T.xirr == null ? '—' : fmtPct(T.xirr)} />
        </div>
        <p className="mt-2 text-xs text-slate-400">損益皆已扣除手續費與證交稅；未實現損益另扣預估的賣出手續費與證交稅。</p>
      </div>

      {brokers.length > 0 && (
        <div className="space-y-2">
          {brokers.map((a) => (
            <SettlementCard key={a.id} account={a} data={data} />
          ))}
        </div>
      )}

      <div className="card">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="w-44">
            <Tabs
              value={chart}
              onChange={setChart}
              items={[
                { key: 'trend', label: '走勢' },
                { key: 'stack', label: '個股配置' },
              ]}
            />
          </div>
          <GranularityPicker value={gran} onChange={setGran} />
        </div>
        {chart === 'trend' ? <ToggleLines points={points} metrics={TOTAL_METRICS} granularity={gran} /> : <StackedSymbols points={points} names={names} />}
      </div>

      <div className="card">
        <h2 className="mb-2 font-semibold">持股</h2>
        {held.length === 0 ? (
          <Empty>目前沒有持股</Empty>
        ) : (
          byBroker.map(([brokerId, rows]) => (
            <div key={brokerId} className="mb-3 last:mb-0">
              <div className="mb-1 flex items-center justify-between border-b border-slate-100 pb-1 text-sm">
                <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700">{rows[0].brokerName}</span>
                <span className="text-xs text-slate-500">
                  市值 <Money value={rows.reduce((s, h) => s + h.valuation.marketValue, 0)} /> · 損益{' '}
                  <Money value={rows.reduce((s, h) => s + h.valuation.netUnrealized, 0)} colored />
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {rows.map((h) => (
                  <Link key={`${h.accountId}|${h.symbol}`} to={`/investments/${h.symbol}?broker=${h.accountId}`} className="block py-2.5 hover:bg-slate-50">
                    <div className="flex items-baseline justify-between">
                      <span className="font-medium">
                        {h.symbol} <span className="text-sm font-normal text-slate-500">{h.name}</span>
                      </span>
                      <Money value={h.valuation.marketValue} className="font-medium" />
                    </div>
                    <div className="mt-0.5 flex justify-between text-xs text-slate-500">
                      <span>
                        {h.position.shares.toLocaleString('zh-TW')} 股 · 均價 {h.valuation.avgPrice.toFixed(2)} · 收盤 {h.close ?? '—'}
                        {h.closeDate && <span className="text-slate-400">（{h.closeDate.slice(5)}）</span>}
                      </span>
                      <span>
                        <Money value={h.valuation.netUnrealized} colored /> {fmtPct(h.valuation.returnPct)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {held.length > 0 && (
        <div className="card">
          <h2 className="mb-2 font-semibold">持股配置</h2>
          <div className="grid items-center gap-4 md:grid-cols-2">
            <div className="h-52">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={bySymbol.map((h) => ({ name: `${h.symbol} ${h.name}`, value: Math.round(h.value) }))} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="90%">
                    {bySymbol.map((h, i) => (
                      <Cell key={h.symbol} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1 text-sm">
              {bySymbol.map((h, i) => (
                <div key={h.symbol} className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                  <span className="flex-1">
                    {h.symbol} {h.name}
                  </span>
                  <span className="text-slate-500">{T.marketValue > 0 ? ((h.value / T.marketValue) * 100).toFixed(1) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <PeriodSummary title="已實現損益（一般買賣）" events={sellEvents} empty="還沒有賣出紀錄" />
      <PeriodSummary title="當沖損益" events={dayEvents} empty="還沒有當沖紀錄" />
      <PeriodSummary title="股利" events={divEvents} empty="還沒有股利紀錄" />

      <div className="card">
        <h2 className="mb-2 font-semibold">交易紀錄</h2>
        {trades.length === 0 ? (
          <Empty>還沒有交易紀錄</Empty>
        ) : (
          <>
            <TradeRows trades={showAllTrades ? trades : trades.slice(0, 20)} names={names} onEdit={(t) => setForm({ edit: t })} />
            {trades.length > 20 && (
              <button className="btn mt-2 w-full" onClick={() => setShowAllTrades(!showAllTrades)}>
                {showAllTrades ? '收合' : `顯示全部 ${trades.length} 筆`}
              </button>
            )}
          </>
        )}
      </div>

      {form && <TradeForm edit={form.edit} onClose={() => setForm(null)} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

export function TradeRows({ trades, names, onEdit }: { trades: Trade[]; names: Map<string, string>; onEdit: (t: Trade) => void }) {
  return (
    <div className="divide-y divide-slate-100 text-sm">
      {trades.map((t) => (
        <button key={t.id} onClick={() => onEdit(t)} className="flex w-full items-center justify-between gap-2 py-2 text-left hover:bg-slate-50">
          <span className="min-w-0">
            <span className="text-xs text-slate-400">{t.tradeDate}</span>{' '}
            <span className={t.kind === 'buy' ? 'text-red-600' : t.kind === 'sell' ? 'text-emerald-600' : 'text-indigo-600'}>{tradeTitle(t)}</span>{' '}
            {t.symbol} <span className="text-slate-500">{names.get(t.symbol) ?? ''}</span>
            <span className="block text-xs text-slate-500">
              {t.kind === 'cashDividend'
                ? t.fee
                  ? `股利 ${(t.amount ?? 0).toLocaleString('zh-TW')} − 入帳手續費 ${t.fee.toLocaleString('zh-TW')}`
                  : ''
                : t.kind === 'dayTrade'
                  ? `${t.shares.toLocaleString('zh-TW')} 股 · ${t.price} → ${t.sellPrice}`
                  : t.kind === 'stockDividend'
                    ? `${t.shares.toLocaleString('zh-TW')} 股`
                    : `${t.shares.toLocaleString('zh-TW')} 股 @ ${t.price}`}
              {t.note && ` · ${t.note}`}
            </span>
          </span>
          <Money value={tradeCashFlow(t)} colored />
        </button>
      ))}
    </div>
  );
}
