import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GranularityPicker, SeriesChart } from '../../components/SeriesChart';
import { Empty, Money } from '../../components/ui';
import { subsOf, useAccountsData } from '../../data/useData';
import { today } from '../../domain/dates';
import { balanceAt } from '../../domain/ledger';
import { cumulativeSeries, type Granularity } from '../../domain/series';
import { ACCOUNT_TYPE_LABEL } from '../../format';
import type { Account, AccountType } from '../../types';
import AccountForm from './AccountForm';

export default function AccountList() {
  const data = useAccountsData();
  const [adding, setAdding] = useState(false);
  const [gran, setGran] = useState<Granularity>('1M');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const t = today();

  const balance = (a: Account) => balanceAt(data.ledger, a.id, t);

  // 外幣不換算：台幣合計之外，依幣別另外列出
  const totals = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of data.accounts) m.set(a.currency, (m.get(a.currency) ?? 0) + balanceAt(data.ledger, a.id, t));
    return m;
  }, [data.accounts, data.ledger, t]);

  const twdIds = useMemo(() => new Set(data.accounts.filter((a) => a.currency === 'TWD').map((a) => a.id)), [data.accounts]);
  const totalSeries = useMemo(
    () => cumulativeSeries(data.ledger.filter((e) => twdIds.has(e.accountId)), t, gran),
    [data.ledger, twdIds, t, gran],
  );

  const active = data.accounts.filter((a) => !a.archived);
  const archived = data.accounts.filter((a) => a.archived);
  const groups = (Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[])
    .map((type) => ({ type, list: active.filter((a) => a.type === type) }))
    .filter((g) => g.list.length > 0);

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const row = (a: Account) => {
    const subs = subsOf(data.subAccounts, a.id);
    const open = expanded.has(a.id);
    const unallocated = balanceAt(data.ledger, a.id, t, null);
    return (
      <div key={a.id} className="py-1">
        <div className="flex items-center gap-2">
          {subs.length > 0 ? (
            <button onClick={() => toggle(a.id)} className="w-6 text-slate-400" aria-label={open ? '收合' : '展開'}>
              {open ? '▾' : '▸'}
            </button>
          ) : (
            <span className="w-6" />
          )}
          <Link to={`/accounts/${a.id}`} className="flex flex-1 items-center justify-between rounded-lg py-2 pr-1 hover:bg-slate-50">
            <span className="flex items-center gap-2">
              {a.name}
              {a.isBroker && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700">券商</span>}
            </span>
            <Money value={balance(a)} currency={a.currency} className="font-medium" />
          </Link>
        </div>
        {open && (
          <div className="mb-1 ml-8 space-y-1 border-l-2 border-slate-100 pl-3 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-slate-500">未分配</span>
              <Money value={unallocated} currency={a.currency} />
            </div>
            {subs.map((s) => (
              <Link key={s.id} to={`/accounts/${a.id}/sub/${s.id}`} className="flex justify-between rounded py-1 hover:bg-slate-50">
                <span>{s.name}</span>
                <Money value={balanceAt(data.ledger, a.id, t, s.id)} currency={a.currency} />
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="text-sm text-slate-500">所有帳戶合計（新台幣）</div>
        <div className="mt-1 text-2xl font-semibold">
          <Money value={totals.get('TWD') ?? 0} />
        </div>
        {[...totals.entries()]
          .filter(([c]) => c !== 'TWD')
          .map(([c, v]) => (
            <div key={c} className="mt-1 text-sm text-slate-600">
              <Money value={v} currency={c} />
            </div>
          ))}
        <div className="mt-4 mb-2 flex justify-end">
          <GranularityPicker value={gran} onChange={setGran} />
        </div>
        <SeriesChart lines={[{ key: 'total', name: '合計', color: '#0f766e', points: totalSeries }]} granularity={gran} area />
      </div>

      {groups.map((g) => (
        <div key={g.type} className="card">
          <h2 className="mb-1 text-sm font-medium text-slate-500">{ACCOUNT_TYPE_LABEL[g.type]}</h2>
          <div className="divide-y divide-slate-100">{g.list.map(row)}</div>
        </div>
      ))}
      {active.length === 0 && (
        <div className="card">
          <Empty>還沒有帳戶，先新增一個吧</Empty>
        </div>
      )}

      <button className="btn w-full" onClick={() => setAdding(true)}>
        ＋ 新增帳戶
      </button>

      {archived.length > 0 && (
        <div className="card">
          <button className="w-full text-left text-sm text-slate-500" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? '▾' : '▸'} 已封存（{archived.length}）
          </button>
          {showArchived && <div className="mt-2 divide-y divide-slate-100 opacity-70">{archived.map(row)}</div>}
        </div>
      )}

      {adding && <AccountForm data={data} onClose={() => setAdding(false)} />}
    </div>
  );
}
