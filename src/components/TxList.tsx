import { useMemo, useState } from 'react';
import { accountLabel, categoryLabel, type AccountsData } from '../data/useData';
import { tradeTitle } from '../data/useInvestments';
import type { AccountTradeRow } from '../domain/settlement';
import { tradeCashFlow } from '../domain/trades';
import { weekdayLabel } from '../format';
import { useSymbols } from '../market/useMarket';
import type { Trade, Transaction } from '../types';
import { useTxForm } from './TransactionForm';
import { Empty, Money } from './ui';

/**
 * 交易列表，依日期分組。
 * perspective：從某個帳戶（或子帳戶）的角度看時，轉帳顯示轉入／轉出的正負號與幣別。
 * tradeRows：股票的交割與股利入帳（只顯示，點下去打開那筆股票交易）。
 */
export default function TxList({
  txs,
  data,
  perspective,
  tradeRows = [],
  onTrade,
}: {
  txs: Transaction[];
  data: AccountsData;
  perspective?: { accountId: string; subId?: string | null };
  tradeRows?: AccountTradeRow[];
  onTrade?: (t: Trade) => void;
}) {
  const { openTx } = useTxForm();
  const symbols = useSymbols();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const groups = useMemo(() => {
    const sorted = [...txs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.updatedAt - a.updatedAt));
    const map = new Map<string, { txs: Transaction[]; trades: AccountTradeRow[] }>();
    const at = (d: string) => {
      let g = map.get(d);
      if (!g) map.set(d, (g = { txs: [], trades: [] }));
      return g;
    };
    for (const t of sorted) at(t.date).txs.push(t);
    for (const r of tradeRows) at(r.date).trades.push(r);
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [txs, tradeRows]);

  if (txs.length === 0 && tradeRows.length === 0) return <Empty>這段期間沒有紀錄</Empty>;

  const toggle = (key: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const stockName = (code: string) => `${code} ${symbols.get(code)?.name ?? ''}`.trim();

  const tradeRow = (r: AccountTradeRow) => {
    if (r.kind === 'dividend') {
      const t = r.trade;
      return (
        <button key={t.id} onClick={() => onTrade?.(t)} className="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left hover:bg-slate-50">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">股利：{stockName(t.symbol)}</div>
            <div className="truncate text-xs text-slate-500">
              {t.fee ? `股利 ${(t.amount ?? 0).toLocaleString('zh-TW')} − 入帳手續費 ${t.fee.toLocaleString('zh-TW')}` : '現金股利入帳'}
            </div>
          </div>
          <Money value={r.net} colored className="text-sm font-medium" />
        </button>
      );
    }
    const key = `settle-${r.date}`;
    const open = expanded.has(key);
    return (
      <div key={key}>
        <button onClick={() => toggle(key)} className="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left hover:bg-slate-50">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">證券交割</div>
            <div className="truncate text-xs text-slate-500">
              {open ? '▾' : '▸'} {r.trades.length} 筆成交
            </div>
          </div>
          <Money value={r.net} colored className="text-sm font-medium" />
        </button>
        {open && (
          <div className="mb-1 ml-3 border-l-2 border-slate-100 pl-3">
            {r.trades.map((t) => (
              <button key={t.id} onClick={() => onTrade?.(t)} className="flex w-full items-center justify-between gap-2 py-1.5 text-left text-xs hover:bg-slate-50">
                <span className="min-w-0 truncate">
                  <span className="text-slate-400">{t.tradeDate.slice(5).replace('-', '/')} 成交</span> {tradeTitle(t)} {stockName(t.symbol)} {t.shares.toLocaleString('zh-TW')} 股
                </span>
                <Money value={tradeCashFlow(t)} colored />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const amountFor = (t: Transaction): { value: number; currency: string } => {
    const from = data.accountById.get(t.accountId);
    const to = t.toAccountId ? data.accountById.get(t.toAccountId) : undefined;
    const fromCur = from?.currency ?? 'TWD';
    if (t.type === 'income') return { value: t.amount, currency: fromCur };
    if (t.type === 'expense' || t.type === 'debtPayment') return { value: -t.amount, currency: fromCur };
    // 轉帳
    if (perspective) {
      const isFrom = t.accountId === perspective.accountId && (perspective.subId === undefined || t.subAccountId === perspective.subId);
      if (!isFrom) return { value: t.toAmount ?? t.amount, currency: to?.currency ?? fromCur };
    }
    // 轉出方：手續費由轉出帳戶負擔
    return { value: -(t.amount + (t.fee ?? 0)), currency: fromCur };
  };

  const title = (t: Transaction) => {
    if (t.type === 'transfer') {
      const from = accountLabel(data.accountById.get(t.accountId), t.subAccountId ? data.subById.get(t.subAccountId) : null);
      const to = accountLabel(data.accountById.get(t.toAccountId ?? ''), t.toSubAccountId ? data.subById.get(t.toSubAccountId) : null);
      return `轉帳：${from} → ${to}`;
    }
    if (t.type === 'debtPayment') return `還款：${data.debtById.get(t.debtId ?? '')?.name ?? '（已刪除的負債）'}`;
    return categoryLabel(data.catById, t.categoryId);
  };

  return (
    <div className="divide-y divide-slate-100">
      {groups.map(([date, g]) => (
        <div key={date} className="py-2">
          <div className="mb-1 text-xs text-slate-400">
            {date.slice(5).replace('-', '/')}（{weekdayLabel(date)}）
          </div>
          {g.trades.map(tradeRow)}
          {g.txs.map((t) => {
            const a = amountFor(t);
            return (
              <button key={t.id} onClick={() => openTx({ edit: t })} className="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{title(t)}</div>
                  <div className="truncate text-xs text-slate-500">
                    {t.type !== 'transfer' && accountLabel(data.accountById.get(t.accountId), t.subAccountId ? data.subById.get(t.subAccountId) : null)}
                    {t.type === 'transfer' && t.fee ? <span>含手續費 {t.fee.toLocaleString('zh-TW')}</span> : null}
                    {t.tags.map((g) => (
                      <span key={g} className="ml-1.5 text-teal-700">
                        #{g}
                      </span>
                    ))}
                    {t.note && <span className="ml-1.5">{t.note}</span>}
                  </div>
                </div>
                <Money value={a.value} currency={a.currency} colored className="text-sm font-medium" />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
