import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { GranularityPicker, SeriesChart } from '../../components/SeriesChart';
import SettlementCard from '../../components/SettlementCard';
import { useTxForm } from '../../components/TransactionForm';
import TxList from '../../components/TxList';
import { Empty, Money, MonthNav, ProgressBar } from '../../components/ui';
import { eventsOf, subsOf, useAccountsData } from '../../data/useData';
import { monthOf, today } from '../../domain/dates';
import { balanceAt } from '../../domain/ledger';
import { cumulativeSeries, type Granularity } from '../../domain/series';
import { settledRows } from '../../domain/settlement';
import { ACCOUNT_TYPE_LABEL, fmt } from '../../format';
import type { Allocation, Trade } from '../../types';
import TradeForm from '../investments/TradeForm';
import AccountForm from './AccountForm';
import { AllocationForm, SubAccountForm } from './SubForms';

export default function AccountDetail() {
  const { id = '' } = useParams();
  const data = useAccountsData();
  const { openTx } = useTxForm();
  const [gran, setGran] = useState<Granularity>('1M');
  const [month, setMonth] = useState(monthOf(today()));
  const [editing, setEditing] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const [alloc, setAlloc] = useState<{ edit?: Allocation; to?: string | null } | null>(null);
  const [tradeEdit, setTradeEdit] = useState<Trade | null>(null);
  const t = today();
  const account = data.accountById.get(id);

  const series = useMemo(() => cumulativeSeries(eventsOf(data.ledger, id), t, gran), [data.ledger, id, t, gran]);
  const monthTxs = useMemo(
    () => data.transactions.filter((x) => (x.accountId === id || x.toAccountId === id) && monthOf(x.date) === month),
    [data.transactions, id, month],
  );
  // 已交割的證券交割款與股利入帳（依交割日／入帳日放進月份）
  const monthTradeRows = useMemo(() => settledRows(data.trades, id, t).filter((r) => monthOf(r.date) === month), [data.trades, id, t, month]);
  const allocations = useMemo(
    () => data.allocations.filter((a) => a.accountId === id).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [data.allocations, id],
  );

  if (!account) return <Empty>找不到這個帳戶</Empty>;

  const subs = subsOf(data.subAccounts, id);
  const total = balanceAt(data.ledger, id, t);
  const unallocated = balanceAt(data.ledger, id, t, null);
  const subName = (s: string | null) => (s ? (data.subById.get(s)?.name ?? '（已刪除）') : '未分配');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link to="/accounts" className="hover:text-teal-700">
          帳戶
        </Link>
        <span>›</span>
        <span>{account.name}</span>
      </div>

      <div className="card">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm text-slate-500">
              {ACCOUNT_TYPE_LABEL[account.type]}
              {account.isBroker && ` · 券商（${+(account.feeDiscount * 10).toFixed(2)} 折）`}
              {account.archived && ' · 已封存'}
            </div>
            <div className="mt-1 text-2xl font-semibold">
              <Money value={total} currency={account.currency} />
            </div>
          </div>
          <button className="btn" onClick={() => setEditing(true)}>
            編輯
          </button>
        </div>
        <div className="mt-4 mb-2 flex justify-end">
          <GranularityPicker value={gran} onChange={setGran} />
        </div>
        <SeriesChart lines={[{ key: 'bal', name: '餘額', color: '#0f766e', points: series }]} granularity={gran} currency={account.currency} area />
        {account.isBroker && (
          <div className="mt-3">
            <SettlementCard account={account} data={data} />
          </div>
        )}
      </div>

      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">子帳戶</h2>
          <div className="flex gap-2">
            {subs.length > 0 && (
              <button className="btn" onClick={() => setAlloc({})}>
                劃撥
              </button>
            )}
            <button className="btn" onClick={() => setAddingSub(true)}>
              ＋ 子帳戶
            </button>
          </div>
        </div>
        {subs.length === 0 ? (
          <p className="text-sm text-slate-500">這個帳戶還沒有子帳戶。可以分割出「旅遊基金」「緊急預備金」等子帳戶，把錢劃撥進去。</p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-sm text-slate-600">未分配</span>
              <span className="text-right">
                <Money value={unallocated} currency={account.currency} className="font-medium" />
                {unallocated < 0 && <div className="text-xs text-red-600">未分配已是負數，請從子帳戶劃撥回來</div>}
              </span>
            </div>
            {subs.map((s) => {
              const bal = balanceAt(data.ledger, id, t, s.id);
              return (
                <Link key={s.id} to={`/accounts/${id}/sub/${s.id}`} className="block rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{s.name}</span>
                    <Money value={bal} currency={account.currency} className="font-medium" />
                  </div>
                  {s.goalAmount != null && (
                    <div className="mt-1.5">
                      <ProgressBar value={bal} max={s.goalAmount} warnAt={2} />
                      <div className="mt-1 flex justify-between text-xs text-slate-500">
                        <span>
                          目標 {fmt(s.goalAmount, account.currency)}
                          {s.goalDate && `（${s.goalDate} 前）`}
                        </span>
                        <span>{Math.floor((bal / s.goalAmount) * 100)}%</span>
                      </div>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
        {allocations.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-slate-500">劃撥紀錄（{allocations.length}）</summary>
            <div className="mt-2 divide-y divide-slate-100 text-sm">
              {allocations.map((a) => (
                <button key={a.id} onClick={() => setAlloc({ edit: a })} className="flex w-full justify-between py-2 text-left hover:bg-slate-50">
                  <span>
                    <span className="text-slate-400">{a.date}</span> {subName(a.fromSubId)} → {subName(a.toSubId)}
                    {a.note && <span className="text-slate-400"> · {a.note}</span>}
                  </span>
                  <Money value={a.amount} currency={account.currency} />
                </button>
              ))}
            </div>
          </details>
        )}
      </div>

      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <MonthNav month={month} onChange={setMonth} />
          <button className="btn-primary" onClick={() => openTx({ defaults: { accountId: id } })}>
            ＋ 記一筆
          </button>
        </div>
        <TxList txs={monthTxs} data={data} perspective={{ accountId: id }} tradeRows={monthTradeRows} onTrade={setTradeEdit} />
      </div>

      {editing && <AccountForm data={data} edit={account} onClose={() => setEditing(false)} />}
      {addingSub && <SubAccountForm data={data} account={account} onClose={() => setAddingSub(false)} />}
      {alloc && <AllocationForm data={data} account={account} edit={alloc.edit} defaultTo={alloc.to} onClose={() => setAlloc(null)} />}
      {tradeEdit && <TradeForm edit={tradeEdit} onClose={() => setTradeEdit(null)} />}
    </div>
  );
}
