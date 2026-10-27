import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { GranularityPicker, SeriesChart } from '../../components/SeriesChart';
import { Empty, Money } from '../../components/ui';
import { accountLabel, useAccountsData } from '../../data/useData';
import { today } from '../../domain/dates';
import { debtEvents } from '../../domain/ledger';
import { cumulativeSeries, type Granularity } from '../../domain/series';
import type { Transaction } from '../../types';
import { DebtForm, PaymentForm } from './DebtForms';
import { debtBalance } from './DebtsPage';

export default function DebtDetail() {
  const { id = '' } = useParams();
  const data = useAccountsData();
  const [gran, setGran] = useState<Granularity>('1M');
  const [editing, setEditing] = useState(false);
  const [payment, setPayment] = useState<{ edit?: Transaction } | null>(null);
  const t = today();
  const debt = data.debtById.get(id);

  const events = useMemo(() => (debt ? debtEvents(debt, data.transactions) : []), [debt, data.transactions]);
  const series = useMemo(() => cumulativeSeries(events, t, gran), [events, t, gran]);
  const payments = useMemo(
    () => data.transactions.filter((x) => x.type === 'debtPayment' && x.debtId === id).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [data.transactions, id],
  );

  if (!debt) return <Empty>找不到這筆負債</Empty>;
  const balance = debtBalance(events, t);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const totalInterest = payments.reduce((s, p) => s + (p.interest ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link to="/debts" className="hover:text-teal-700">
          負債
        </Link>
        <span>›</span>
        <span>{debt.name}</span>
      </div>

      <div className="card">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm text-slate-500">剩餘本金</div>
            <div className="mt-1 text-2xl font-semibold text-red-600">
              <Money value={balance} />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => setPayment({})}>
              ＋ 還款
            </button>
            <button className="btn" onClick={() => setEditing(true)}>
              編輯
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="原始借款" value={debt.principal.toLocaleString('zh-TW')} />
          <Stat label="年利率" value={`${+(debt.rate * 100).toFixed(4)}%`} />
          <Stat label="累計還款" value={totalPaid.toLocaleString('zh-TW')} />
          <Stat label="其中利息" value={totalInterest.toLocaleString('zh-TW')} />
        </div>
        <div className="mt-4 mb-2 flex justify-end">
          <GranularityPicker value={gran} onChange={setGran} />
        </div>
        <SeriesChart lines={[{ key: 'debt', name: '剩餘本金', color: '#dc2626', points: series }]} granularity={gran} area />
      </div>

      <div className="card">
        <h2 className="mb-2 font-semibold">還款紀錄</h2>
        {payments.length === 0 ? (
          <Empty>還沒有還款紀錄</Empty>
        ) : (
          <div className="divide-y divide-slate-100 text-sm">
            {payments.map((p) => (
              <button key={p.id} onClick={() => setPayment({ edit: p })} className="flex w-full items-center justify-between py-2 text-left hover:bg-slate-50">
                <span>
                  <span className="text-slate-400">{p.date}</span> {accountLabel(data.accountById.get(p.accountId), p.subAccountId ? data.subById.get(p.subAccountId) : null)}
                  {p.note && <span className="text-slate-400"> · {p.note}</span>}
                  {p.interest ? <span className="block text-xs text-slate-500">本金 {(p.amount - p.interest).toLocaleString('zh-TW')} · 利息 {p.interest.toLocaleString('zh-TW')}</span> : null}
                </span>
                <Money value={p.amount} />
              </button>
            ))}
          </div>
        )}
      </div>

      {editing && <DebtForm data={data} edit={debt} onClose={() => setEditing(false)} />}
      {payment && <PaymentForm data={data} debt={debt} edit={payment.edit} onClose={() => setPayment(null)} />}
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
