import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { GranularityPicker, SeriesChart } from '../../components/SeriesChart';
import { useTxForm } from '../../components/TransactionForm';
import TxList from '../../components/TxList';
import { Empty, Money, ProgressBar } from '../../components/ui';
import { eventsOf, useAccountsData } from '../../data/useData';
import { today } from '../../domain/dates';
import { balanceAt } from '../../domain/ledger';
import { cumulativeSeries, type Granularity } from '../../domain/series';
import { settledRows } from '../../domain/settlement';
import { fmt } from '../../format';
import type { Allocation, Trade } from '../../types';
import TradeForm from '../investments/TradeForm';
import { AllocationForm, SubAccountForm } from './SubForms';

export default function SubAccountDetail() {
  const { id = '', subId = '' } = useParams();
  const data = useAccountsData();
  const { openTx } = useTxForm();
  const [gran, setGran] = useState<Granularity>('1M');
  const [editing, setEditing] = useState(false);
  const [alloc, setAlloc] = useState<{ edit?: Allocation } | null>(null);
  const [tradeEdit, setTradeEdit] = useState<Trade | null>(null);
  const t = today();
  const account = data.accountById.get(id);
  const sub = data.subById.get(subId);

  const series = useMemo(() => cumulativeSeries(eventsOf(data.ledger, id, subId), t, gran), [data.ledger, id, subId, t, gran]);
  const txs = useMemo(
    () => data.transactions.filter((x) => (x.accountId === id && x.subAccountId === subId) || (x.toAccountId === id && x.toSubAccountId === subId)),
    [data.transactions, id, subId],
  );
  const allocations = useMemo(
    () => data.allocations.filter((a) => a.fromSubId === subId || a.toSubId === subId).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [data.allocations, subId],
  );
  // 從這個子帳戶交割的證券交割款與股利
  const tradeRows = useMemo(() => settledRows(data.trades, id, t, subId), [data.trades, id, t, subId]);

  if (!account || !sub) return <Empty>找不到這個子帳戶</Empty>;
  const bal = balanceAt(data.ledger, id, t, subId);
  const subName = (s: string | null) => (s ? (data.subById.get(s)?.name ?? '（已刪除）') : '未分配');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link to="/accounts" className="hover:text-teal-700">
          帳戶
        </Link>
        <span>›</span>
        <Link to={`/accounts/${id}`} className="hover:text-teal-700">
          {account.name}
        </Link>
        <span>›</span>
        <span>{sub.name}</span>
      </div>

      <div className="card">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm text-slate-500">子帳戶</div>
            <div className="mt-1 text-2xl font-semibold">
              <Money value={bal} currency={account.currency} />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={() => setAlloc({})}>
              劃撥
            </button>
            <button className="btn" onClick={() => setEditing(true)}>
              編輯
            </button>
          </div>
        </div>
        {sub.goalAmount != null && (
          <div className="mt-3">
            <ProgressBar value={bal} max={sub.goalAmount} warnAt={2} />
            <div className="mt-1 flex justify-between text-xs text-slate-500">
              <span>
                目標 {fmt(sub.goalAmount, account.currency)}
                {sub.goalDate && `（${sub.goalDate} 前）`}，還差 {fmt(Math.max(0, sub.goalAmount - bal), account.currency)}
              </span>
              <span>{Math.floor((bal / sub.goalAmount) * 100)}%</span>
            </div>
          </div>
        )}
        <div className="mt-4 mb-2 flex justify-end">
          <GranularityPicker value={gran} onChange={setGran} />
        </div>
        <SeriesChart lines={[{ key: 'bal', name: '餘額', color: '#7c3aed', points: series }]} granularity={gran} currency={account.currency} area />
      </div>

      <div className="card">
        <h2 className="mb-2 font-semibold">劃撥紀錄</h2>
        {allocations.length === 0 ? (
          <Empty>還沒有劃撥紀錄</Empty>
        ) : (
          <div className="divide-y divide-slate-100 text-sm">
            {allocations.map((a) => (
              <button key={a.id} onClick={() => setAlloc({ edit: a })} className="flex w-full justify-between py-2 text-left hover:bg-slate-50">
                <span>
                  <span className="text-slate-400">{a.date}</span> {subName(a.fromSubId)} → {subName(a.toSubId)}
                  {a.note && <span className="text-slate-400"> · {a.note}</span>}
                </span>
                <Money value={a.toSubId === subId ? a.amount : -a.amount} currency={account.currency} colored />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">收支紀錄</h2>
          <button className="btn-primary" onClick={() => openTx({ defaults: { accountId: id, subAccountId: subId } })}>
            ＋ 記一筆
          </button>
        </div>
        <TxList txs={txs} data={data} perspective={{ accountId: id, subId }} tradeRows={tradeRows} onTrade={setTradeEdit} />
      </div>

      {editing && <SubAccountForm data={data} account={account} edit={sub} onClose={() => setEditing(false)} />}
      {alloc && <AllocationForm data={data} account={account} edit={alloc.edit} defaultTo={subId} onClose={() => setAlloc(null)} />}
      {tradeEdit && <TradeForm edit={tradeEdit} onClose={() => setTradeEdit(null)} />}
    </div>
  );
}
