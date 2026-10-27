import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import SettlementCard from '../components/SettlementCard';
import { GranularityPicker, SeriesChart, type LineDef } from '../components/SeriesChart';
import { Empty, Money, ProgressBar } from '../components/ui';
import { useAccountsData } from '../data/useData';
import { useInvestments } from '../data/useInvestments';
import { monthTotals, spentByCategory } from '../domain/budget';
import { monthOf } from '../domain/dates';
import { balanceAt, debtEvents } from '../domain/ledger';
import { netWorthAccountEvents, netWorthSeries } from '../domain/networth';
import { valuesAt, type Granularity } from '../domain/series';
import { fmt } from '../format';
import { useCol } from '../hooks';
import { PriceStatus } from './investments/InvestmentsPage';

const LINES = [
  { key: 'netWorth', name: '淨資產', color: '#0f766e' },
  { key: 'accounts', name: '帳戶', color: '#2563eb' },
  { key: 'investments', name: '股票', color: '#d97706' },
  { key: 'debts', name: '負債', color: '#dc2626' },
] as const;

const PIE_COLORS = { cash: '#059669', bank: '#2563eb', ewallet: '#7c3aed', stock: '#d97706' };

export default function Dashboard() {
  const data = useAccountsData();
  const inv = useInvestments();
  const budgets = useCol('budgets');
  const [gran, setGran] = useState<Granularity>('1M');
  const [on, setOn] = useState<Set<string>>(new Set(['netWorth']));
  const t = inv.today;
  const month = monthOf(t);

  const twdAccounts = useMemo(() => data.accounts.filter((a) => a.currency === 'TWD'), [data.accounts]);
  const twdIds = useMemo(() => new Set(twdAccounts.map((a) => a.id)), [twdAccounts]);
  const nwEvents = useMemo(() => netWorthAccountEvents(data.ledger, data.trades, twdIds), [data.ledger, data.trades, twdIds]);
  const allDebtEvents = useMemo(() => data.debts.flatMap((d) => debtEvents(d, data.transactions)), [data.debts, data.transactions]);

  // 現在的數字
  const accountsNow = valuesAt(nwEvents, [t])[0] ?? 0;
  const debtsNow = valuesAt(allDebtEvents, [t])[0] ?? 0;
  const stocksNow = inv.totals.marketValue;
  const netWorth = accountsNow + stocksNow - debtsNow;

  // 外幣不換算，另外列出
  const foreign = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of data.accounts) if (a.currency !== 'TWD') m.set(a.currency, (m.get(a.currency) ?? 0) + balanceAt(data.ledger, a.id, t));
    return [...m.entries()];
  }, [data.accounts, data.ledger, t]);

  const series = useMemo(
    () => netWorthSeries({ accountEvents: nwEvents, debtEvents: allDebtEvents, trades: inv.trades, method: inv.costOpts, ctx: inv.ctx, today: t, gran }),
    [nwEvents, allDebtEvents, inv.trades, inv.costOpts, inv.ctx, t, gran],
  );
  const lines: LineDef[] = LINES.filter((l) => on.has(l.key)).map((l) => ({ key: l.key, name: l.name, color: l.color, points: series.map((p) => ({ date: p.date, value: p[l.key] })) }));

  // 資產組成（新台幣）
  const composition = useMemo(() => {
    const byType = { cash: 0, bank: 0, ewallet: 0 };
    for (const a of twdAccounts) {
      const v = valuesAt(netWorthAccountEvents(data.ledger, data.trades, new Set([a.id])), [t])[0] ?? 0;
      byType[a.type] += v;
    }
    return [
      { key: 'cash', name: '現金', value: byType.cash },
      { key: 'bank', name: '銀行', value: byType.bank },
      { key: 'ewallet', name: '電子支付', value: byType.ewallet },
      { key: 'stock', name: '股票', value: stocksNow },
    ].filter((x) => x.value > 0);
  }, [twdAccounts, data.ledger, data.trades, t, stocksNow]);
  const assetsTotal = composition.reduce((s, x) => s + x.value, 0);

  // 本月收支與預算提醒（只算新台幣帳戶）
  const twdTxs = useMemo(() => data.transactions.filter((x) => twdIds.has(x.accountId)), [data.transactions, twdIds]);
  const totals = monthTotals(twdTxs, month);
  const alerts = useMemo(() => {
    const spent = spentByCategory(twdTxs, data.categories, month);
    return budgets
      .map((b) => ({ cat: data.catById.get(b.id), budget: b.amount, spent: spent.get(b.id) ?? 0 }))
      .filter((x) => x.cat && x.budget > 0 && x.spent / x.budget >= 0.8)
      .sort((a, b) => b.spent / b.budget - a.spent / a.budget);
  }, [twdTxs, data.categories, data.catById, budgets, month]);

  const brokers = data.accounts.filter((a) => a.isBroker && !a.archived);
  const hasAnything = data.accounts.length > 0 || inv.trades.length > 0 || data.debts.length > 0;

  if (!hasAnything) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">總覽</h1>
        <div className="card text-center">
          <Empty>還沒有任何資料</Empty>
          <Link to="/accounts" className="btn-primary">
            先新增一個帳戶
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">總覽</h1>
      {inv.trades.length > 0 && <PriceStatus inv={inv} />}

      <div className="card">
        <div className="text-sm text-slate-500">淨資產（新台幣）</div>
        <div className="mt-1 text-3xl font-semibold">
          <Money value={netWorth} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <Link to="/accounts" className="rounded-lg bg-slate-50 p-2 hover:bg-slate-100">
            <div className="text-xs text-slate-500">帳戶</div>
            <Money value={accountsNow} className="font-medium" />
          </Link>
          <Link to="/investments" className="rounded-lg bg-slate-50 p-2 hover:bg-slate-100">
            <div className="text-xs text-slate-500">股票市值</div>
            <Money value={stocksNow} className="font-medium" />
          </Link>
          <Link to="/debts" className="rounded-lg bg-slate-50 p-2 hover:bg-slate-100">
            <div className="text-xs text-slate-500">負債</div>
            <Money value={-debtsNow} className="font-medium" />
          </Link>
        </div>
        {foreign.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-4 text-sm text-slate-600">
            <span className="text-xs text-slate-400">外幣（不換算）</span>
            {foreign.map(([c, v]) => (
              <Money key={c} value={v} currency={c} />
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-slate-400">帳戶已扣除待交割的股款（成交日即視為圈存），避免和股票市值重複計算。</p>

        <div className="mt-4 mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {LINES.map((l) => {
              const active = on.has(l.key);
              return (
                <button
                  key={l.key}
                  onClick={() =>
                    setOn((s) => {
                      const n = new Set(s);
                      if (n.has(l.key)) n.delete(l.key);
                      else n.add(l.key);
                      return n;
                    })
                  }
                  className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${active ? 'border-slate-300 bg-white' : 'border-transparent bg-slate-100 text-slate-400'}`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: active ? l.color : '#cbd5e1' }} />
                  {l.name}
                </button>
              );
            })}
          </div>
          <GranularityPicker value={gran} onChange={setGran} />
        </div>
        <SeriesChart lines={lines} granularity={gran} area={lines.length === 1} />
      </div>

      {brokers.map((a) => (
        <SettlementCard key={a.id} account={a} data={data} compact />
      ))}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 font-semibold">資產組成</h2>
          {composition.length === 0 ? (
            <Empty>還沒有資產</Empty>
          ) : (
            <div className="flex items-center gap-3">
              <div className="h-36 w-36 shrink-0">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={composition} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="95%">
                      {composition.map((c) => (
                        <Cell key={c.key} fill={PIE_COLORS[c.key as keyof typeof PIE_COLORS]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => fmt(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1.5 text-sm">
                {composition.map((c) => (
                  <div key={c.key} className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: PIE_COLORS[c.key as keyof typeof PIE_COLORS] }} />
                    <span className="flex-1">{c.name}</span>
                    <span className="text-xs text-slate-400">{((c.value / assetsTotal) * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">本月收支</h2>
            <Link to="/accounts" className="text-xs text-teal-700 hover:underline">
              收支統計 ›
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-xs text-slate-500">收入</div>
              <Money value={totals.income} className="font-semibold text-emerald-600" />
            </div>
            <div>
              <div className="text-xs text-slate-500">支出</div>
              <Money value={totals.expense} className="font-semibold text-red-600" />
            </div>
            <div>
              <div className="text-xs text-slate-500">結餘</div>
              <Money value={totals.income - totals.expense} colored className="font-semibold" />
            </div>
          </div>
          {alerts.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
              <div className="text-xs font-medium text-slate-500">預算提醒</div>
              {alerts.map((a) => (
                <div key={a.cat!.id} className="text-sm">
                  <div className="mb-0.5 flex justify-between">
                    <span>{a.cat!.name}</span>
                    <span className={a.spent > a.budget ? 'text-red-600' : 'text-amber-600'}>
                      {a.spent.toLocaleString('zh-TW')} / {a.budget.toLocaleString('zh-TW')}
                      {a.spent > a.budget ? '（超支）' : ''}
                    </span>
                  </div>
                  <ProgressBar value={a.spent} max={a.budget} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
