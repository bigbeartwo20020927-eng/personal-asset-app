import { Fragment, useMemo, useState } from 'react';
import type { AccountsData } from '../data/useData';
import { tradeTitle } from '../data/useInvestments';
import { today } from '../domain/dates';
import { balanceAt } from '../domain/ledger';
import { settlementSummary } from '../domain/settlement';
import { tradeCashFlow } from '../domain/trades';
import { weekdayLabel } from '../format';
import type { Account } from '../types';
import Modal from './Modal';
import { Money } from './ui';

/** 券商帳戶的交割摘要（帳面餘額／待交割／可用餘額），點進去看交割行事曆 */
export default function SettlementCard({ account, data, compact = false }: { account: Account; data: AccountsData; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const t = today();
  const pool = account.settleSubAccountId;
  const summary = useMemo(() => {
    const book = balanceAt(data.ledger, account.id, t, pool);
    return settlementSummary(data.trades.filter((x) => x.accountId === account.id), book, t);
  }, [data.ledger, data.trades, account.id, pool, t]);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (compact && summary.days.length === 0) return null;
  const poolName = pool ? (data.subById.get(pool)?.name ?? '子帳戶') : data.subAccounts.some((s) => s.accountId === account.id) ? '未分配' : null;

  return (
    <>
      <button onClick={() => setOpen(true)} className="w-full rounded-lg bg-indigo-50/60 p-3 text-left text-sm hover:bg-indigo-50">
        <div className="mb-1 flex justify-between text-xs text-indigo-800">
          <span>
            {account.name}
            {poolName && ` › ${poolName}`} · 交割
          </span>
          <span>行事曆 ›</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <div className="text-xs text-slate-500">帳面餘額</div>
            <Money value={summary.bookBalance} />
          </div>
          <div>
            <div className="text-xs text-slate-500">待交割</div>
            <Money value={summary.pending} colored />
          </div>
          <div>
            <div className="text-xs text-slate-500">可用餘額</div>
            <Money value={summary.available} className="font-semibold" />
          </div>
        </div>
        {summary.days.some((d) => d.insufficient) && <div className="mt-1 text-xs text-red-600">⚠ 有交割日餘額不足</div>}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={`交割行事曆 · ${account.name}`}>
        {summary.days.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">目前沒有待交割的款項</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 text-left font-normal">交割日</th>
                  <th className="text-right font-normal">應付</th>
                  <th className="text-right font-normal">應收</th>
                  <th className="text-right font-normal">淨額</th>
                  <th className="text-right font-normal">交割後餘額</th>
                </tr>
              </thead>
              <tbody>
                {summary.days.map((d) => (
                  <Fragment key={d.date}>
                    <tr onClick={() => setExpanded(expanded === d.date ? null : d.date)} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2">
                        {expanded === d.date ? '▾' : '▸'} {d.date.slice(5).replace('-', '/')}（{weekdayLabel(d.date)}）
                      </td>
                      <td className="text-right">
                        <Money value={d.payable} />
                      </td>
                      <td className="text-right">
                        <Money value={d.receivable} />
                      </td>
                      <td className="text-right">
                        <Money value={d.net} colored />
                      </td>
                      <td className="text-right">
                        <Money value={d.balanceAfter} />
                        {d.insufficient && <div className="text-xs text-red-600">不足 {Math.abs(d.balanceAfter).toLocaleString('zh-TW')}</div>}
                      </td>
                    </tr>
                    {expanded === d.date &&
                      d.trades.map((tr) => (
                        <tr key={tr.id} className="bg-slate-50 text-xs text-slate-600">
                          <td className="py-1.5 pl-5" colSpan={3}>
                            {tr.tradeDate.slice(5).replace('-', '/')} {tradeTitle(tr)} {tr.symbol} {tr.shares.toLocaleString('zh-TW')} 股
                          </td>
                          <td className="text-right" colSpan={2}>
                            <Money value={tradeCashFlow(tr)} colored />
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">交割日為成交後第 2 個營業日（只跳過週六日）。同一天的應付與應收互相抵銷。可用餘額 = 現在能動用、不會讓任何一天交割不足的金額。</p>
      </Modal>
    </>
  );
}
