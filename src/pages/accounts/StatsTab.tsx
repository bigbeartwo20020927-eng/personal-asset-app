import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import TxList from '../../components/TxList';
import { Empty, Money, MonthNav, Tabs } from '../../components/ui';
import { useAccountsData } from '../../data/useData';
import { monthOf, today } from '../../domain/dates';
import { fmt } from '../../format';
import type { CategoryKind, Transaction } from '../../types';

/** 圓餅圖裡「轉帳手續費」這一塊的 id（不是真的分類，不能展開） */
const TRANSFER_FEE = '__transferFee';

const COLORS = ['#0f766e', '#2563eb', '#d97706', '#db2777', '#7c3aed', '#059669', '#dc2626', '#0891b2', '#65a30d', '#9333ea', '#ea580c', '#475569'];

/** 收支統計只計算新台幣帳戶（外幣不換算） */
export default function StatsTab() {
  const data = useAccountsData();
  const [month, setMonth] = useState(monthOf(today()));
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [drill, setDrill] = useState<string | null>(null);

  const twd = useMemo(() => new Set(data.accounts.filter((a) => a.currency === 'TWD').map((a) => a.id)), [data.accounts]);
  const isTwd = (t: Transaction) => twd.has(t.accountId);

  const monthTxs = useMemo(() => data.transactions.filter((t) => monthOf(t.date) === month), [data.transactions, month]);
  const income = monthTxs.filter((t) => t.type === 'income' && isTwd(t)).reduce((s, t) => s + t.amount, 0);
  // 轉帳手續費由轉出帳戶負擔，算進支出
  const feeOf = (t: Transaction) => (t.type === 'transfer' && isTwd(t) ? (t.fee ?? 0) : 0);
  const monthFees = monthTxs.reduce((s, t) => s + feeOf(t), 0);
  const expense = monthTxs.filter((t) => t.type === 'expense' && isTwd(t)).reduce((s, t) => s + t.amount, 0) + monthFees;

  // 依大類加總；點大類後展開成小類
  const pie = useMemo(() => {
    const byParent = new Map<string, number>();
    const byChild = new Map<string, number>();
    for (const t of monthTxs) {
      if (t.type !== kind || !t.categoryId || !isTwd(t)) continue;
      const c = data.catById.get(t.categoryId);
      const parent = c?.parentId ?? t.categoryId;
      byParent.set(parent, (byParent.get(parent) ?? 0) + t.amount);
      byChild.set(t.categoryId, (byChild.get(t.categoryId) ?? 0) + t.amount);
    }
    const name = (id: string) => data.catById.get(id)?.name ?? '（已刪除）';
    const parents = [...byParent.entries()].map(([id, value]) => ({ id, name: name(id), value }));
    if (kind === 'expense' && monthFees > 0) parents.push({ id: TRANSFER_FEE, name: '轉帳手續費', value: monthFees });
    parents.sort((a, b) => b.value - a.value);
    const children = (pid: string) =>
      [...byChild.entries()]
        .filter(([id]) => (data.catById.get(id)?.parentId ?? id) === pid)
        .map(([id, value]) => ({ id, name: name(id), value }))
        .sort((a, b) => b.value - a.value);
    return { parents, children };
  }, [monthTxs, kind, data.catById, twd, monthFees]);

  const slices = drill ? pie.children(drill) : pie.parents;
  const sliceTotal = slices.reduce((s, x) => s + x.value, 0);

  // 近 12 個月收支
  const bars = useMemo(() => {
    const out: { month: string; 收入: number; 支出: number }[] = [];
    const [y, m] = month.split('-').map(Number);
    for (let i = 11; i >= 0; i--) {
      const key = new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7);
      out.push({ month: key, 收入: 0, 支出: 0 });
    }
    const idx = new Map(out.map((o, i) => [o.month, i]));
    for (const t of data.transactions) {
      if (!isTwd(t)) continue;
      const i = idx.get(monthOf(t.date));
      if (i === undefined) continue;
      if (t.type === 'income') out[i].收入 += t.amount;
      else if (t.type === 'expense') out[i].支出 += t.amount;
      else out[i].支出 += feeOf(t);
    }
    return out;
  }, [data.transactions, month, twd]);

  // 標籤統計（全部期間）
  const tagStats = useMemo(() => {
    const m = new Map<string, { expense: number; income: number; count: number }>();
    for (const t of data.transactions) {
      if (!isTwd(t) || (t.type !== 'expense' && t.type !== 'income')) continue;
      for (const g of t.tags) {
        const s = m.get(g) ?? { expense: 0, income: 0, count: 0 };
        s[t.type] += t.amount;
        s.count++;
        m.set(g, s);
      }
    }
    return [...m.entries()].sort((a, b) => b[1].expense - a[1].expense);
  }, [data.transactions, twd]);

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="mb-3 flex justify-center">
          <MonthNav
            month={month}
            onChange={(m) => {
              setMonth(m);
              setDrill(null);
            }}
          />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xs text-slate-500">收入</div>
            <Money value={income} className="font-semibold text-emerald-600" />
          </div>
          <div>
            <div className="text-xs text-slate-500">支出</div>
            <Money value={expense} className="font-semibold text-red-600" />
          </div>
          <div>
            <div className="text-xs text-slate-500">結餘</div>
            <Money value={income - expense} colored className="font-semibold" />
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-slate-400">只統計新台幣帳戶</p>
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="w-40">
            <Tabs
              value={kind}
              onChange={(k) => {
                setKind(k);
                setDrill(null);
              }}
              items={[
                { key: 'expense', label: '支出' },
                { key: 'income', label: '收入' },
              ]}
            />
          </div>
          {drill && (
            <button className="text-sm text-teal-700" onClick={() => setDrill(null)}>
              ‹ 回到大類
            </button>
          )}
        </div>
        {slices.length === 0 ? (
          <Empty>這個月沒有{kind === 'expense' ? '支出' : '收入'}</Empty>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-56">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="90%"
                    onClick={(s) => {
                      const id = (s as unknown as { id: string }).id;
                      if (!drill && id !== TRANSFER_FEE) setDrill(id);
                    }}
                    className={drill ? '' : 'cursor-pointer'}
                  >
                    {slices.map((s, i) => (
                      <Cell key={s.id} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="divide-y divide-slate-100">
              {drill && <div className="pb-2 text-sm font-medium">{data.catById.get(drill)?.name}</div>}
              {slices.map((s, i) => (
                <button
                  key={s.id}
                  disabled={!!drill || s.id === TRANSFER_FEE}
                  onClick={() => setDrill(s.id)}
                  className="flex w-full items-center gap-2 py-2 text-left text-sm enabled:hover:bg-slate-50"
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="flex-1">{s.name}</span>
                  <span className="text-xs text-slate-400">{((s.value / sliceTotal) * 100).toFixed(1)}%</span>
                  <Money value={s.value} className="w-24 text-right" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="mb-2 font-semibold">近 12 個月</h2>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={bars} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" tickFormatter={(m) => `${Number(m.slice(5))}月`} tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tickFormatter={(v) => (Math.abs(v) >= 1e4 ? `${v / 1e4}萬` : String(v))} tick={{ fontSize: 11, fill: '#64748b' }} width={44} />
              <Tooltip formatter={(v) => fmt(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="收入" fill="#059669" radius={[3, 3, 0, 0]} />
              <Bar dataKey="支出" fill="#dc2626" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {tagStats.length > 0 && (
        <div className="card">
          <h2 className="mb-2 font-semibold">標籤統計（全部期間）</h2>
          <div className="divide-y divide-slate-100 text-sm">
            {tagStats.map(([tag, s]) => (
              <div key={tag} className="flex items-center justify-between py-2">
                <span className="text-teal-700">
                  #{tag} <span className="text-xs text-slate-400">{s.count} 筆</span>
                </span>
                <span className="text-right">
                  {s.expense > 0 && <Money value={-s.expense} />}
                  {s.income > 0 && <Money value={s.income} colored className="ml-3" />}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="mb-1 font-semibold">本月所有紀錄</h2>
        <TxList txs={monthTxs} data={data} />
      </div>
    </div>
  );
}
