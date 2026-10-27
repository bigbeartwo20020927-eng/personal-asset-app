import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GranularityPicker, SeriesChart } from '../../components/SeriesChart';
import { Empty, Money, ProgressBar } from '../../components/ui';
import { useAccountsData } from '../../data/useData';
import { today } from '../../domain/dates';
import { debtEvents } from '../../domain/ledger';
import { cumulativeSeries, type Granularity } from '../../domain/series';
import type { Debt } from '../../types';
import { DebtForm, PaymentForm } from './DebtForms';

export function debtBalance(events: { date: string; amount: number }[], upTo: string): number {
  return events.filter((e) => e.date <= upTo).reduce((s, e) => s + e.amount, 0);
}

export default function DebtsPage() {
  const data = useAccountsData();
  const [gran, setGran] = useState<Granularity>('1M');
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<Debt | null>(null);
  const t = today();

  const rows = useMemo(
    () =>
      data.debts
        .map((d) => {
          const ev = debtEvents(d, data.transactions);
          return { debt: d, events: ev, balance: debtBalance(ev, t) };
        })
        .sort((a, b) => b.balance - a.balance),
    [data.debts, data.transactions, t],
  );
  const total = rows.reduce((s, r) => s + r.balance, 0);
  const series = useMemo(() => cumulativeSeries(rows.flatMap((r) => r.events), t, gran), [rows, t, gran]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">負債</h1>
        <button className="btn-primary" onClick={() => setAdding(true)}>
          ＋ 新增負債
        </button>
      </div>

      <div className="card">
        <div className="text-sm text-slate-500">負債合計</div>
        <div className="mt-1 text-2xl font-semibold text-red-600">
          <Money value={total} />
        </div>
        <div className="mt-4 mb-2 flex justify-end">
          <GranularityPicker value={gran} onChange={setGran} />
        </div>
        <SeriesChart lines={[{ key: 'debt', name: '負債', color: '#dc2626', points: series }]} granularity={gran} area />
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <Empty>還沒有負債紀錄</Empty>
        </div>
      ) : (
        rows.map(({ debt, balance }) => {
          const paid = debt.principal - balance;
          const months = debt.monthlyPayment > 0 ? Math.ceil(balance / debt.monthlyPayment) : null;
          return (
            <div key={debt.id} className="card">
              <div className="flex items-start justify-between gap-2">
                <Link to={`/debts/${debt.id}`} className="min-w-0 flex-1 hover:text-teal-700">
                  <div className="font-semibold">{debt.name}</div>
                  <div className="text-xs text-slate-500">
                    年利率 {+(debt.rate * 100).toFixed(4)}% · 每月 {debt.monthlyPayment.toLocaleString('zh-TW')}
                    {months != null && balance > 0 && ` · 約剩 ${months} 期`}
                  </div>
                </Link>
                <div className="text-right">
                  <Money value={balance} className="font-semibold" />
                  <div>
                    <button className="mt-1 text-sm text-teal-700 hover:underline" onClick={() => setPaying(debt)}>
                      ＋ 還款
                    </button>
                  </div>
                </div>
              </div>
              {debt.principal > 0 && (
                <div className="mt-2">
                  <ProgressBar value={paid} max={debt.principal} warnAt={2} />
                  <div className="mt-1 flex justify-between text-xs text-slate-500">
                    <span>已還本金 {Math.max(0, paid).toLocaleString('zh-TW')}</span>
                    <span>原始借款 {debt.principal.toLocaleString('zh-TW')}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {adding && <DebtForm data={data} onClose={() => setAdding(false)} />}
      {paying && <PaymentForm data={data} debt={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}
