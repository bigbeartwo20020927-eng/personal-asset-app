import { useMemo, useState } from 'react';
import Modal from '../../components/Modal';
import { useAction } from '../../components/Toast';
import { Money, MonthNav, ProgressBar } from '../../components/ui';
import { useAccountsData } from '../../data/useData';
import { spentByCategory } from '../../domain/budget';
import { monthOf, today } from '../../domain/dates';
import { useCol } from '../../hooks';
import { commit, createOp, deleteOp, updateOp } from '../../sync/write';
import type { Category } from '../../types';
import { canAutoFocus } from '../../touchFocus';

/** 預算：大類和小類都可以設定，設定一次後每個月自動從 0 重新計算（只計新台幣帳戶） */
export default function BudgetTab() {
  const data = useAccountsData();
  const budgets = useCol('budgets');
  const act = useAction();
  const [month, setMonth] = useState(monthOf(today()));
  const [editing, setEditing] = useState<Category | null>(null);
  const [amount, setAmount] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const budgetOf = useMemo(() => new Map(budgets.map((b) => [b.id, b])), [budgets]);
  const twdTxs = useMemo(() => {
    const twd = new Set(data.accounts.filter((a) => a.currency === 'TWD').map((a) => a.id));
    return data.transactions.filter((t) => twd.has(t.accountId));
  }, [data.accounts, data.transactions]);
  const spent = useMemo(() => spentByCategory(twdTxs, data.categories, month), [twdTxs, data.categories, month]);

  const parents = data.categories.filter((c) => c.kind === 'expense' && c.parentId === null).sort((a, b) => a.order - b.order);
  const childrenOf = (pid: string) => data.categories.filter((c) => c.parentId === pid).sort((a, b) => a.order - b.order);

  const open = (c: Category) => {
    setEditing(c);
    setAmount(budgetOf.get(c.id)?.amount ? String(budgetOf.get(c.id)!.amount) : '');
  };

  const save = async () => {
    if (!editing) return;
    const v = Math.round(Number(amount) || 0);
    const cur = budgetOf.get(editing.id);
    const op = v <= 0 ? (cur ? deleteOp('budgets', cur) : null) : cur ? updateOp('budgets', cur, { amount: v }) : createOp('budgets', { amount: v }, editing.id);
    const ok = op ? await act(() => commit([op]), v > 0 ? '已設定預算' : '已移除預算') : true;
    if (ok) setEditing(null);
  };

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const line = (c: Category, child = false) => {
    const b = budgetOf.get(c.id)?.amount;
    const s = spent.get(c.id) ?? 0;
    return (
      <div className={child ? 'py-2 pl-6' : 'py-2'}>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-1">
            {!child && (
              <button onClick={() => toggle(c.id)} className="w-5 text-slate-400">
                {expanded.has(c.id) ? '▾' : '▸'}
              </button>
            )}
            <span className={child ? '' : 'font-medium'}>{c.name}</span>
          </span>
          <button onClick={() => open(c)} className="text-right hover:text-teal-700">
            <Money value={s} />
            <span className="text-slate-400"> / {b ? b.toLocaleString('zh-TW') : '未設定'}</span>
          </button>
        </div>
        {b ? (
          <div className={child ? 'mt-1' : 'mt-1 pl-6'}>
            <ProgressBar value={s} max={b} />
            <div className={`mt-0.5 text-right text-xs ${s > b ? 'text-red-600' : 'text-slate-500'}`}>
              {s > b ? `超支 ${(s - b).toLocaleString('zh-TW')}` : `剩 ${(b - s).toLocaleString('zh-TW')}`}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="mb-2 flex justify-center">
          <MonthNav month={month} onChange={setMonth} />
        </div>
        <p className="text-center text-xs text-slate-500">點金額設定預算。設定一次後每個月自動歸零重算；小類的支出同時計入大類。</p>
      </div>
      <div className="card divide-y divide-slate-100">
        {parents.map((p) => (
          <div key={p.id}>
            {line(p)}
            {expanded.has(p.id) &&
              childrenOf(p.id).map((c) => (
                <div key={c.id} className="border-t border-slate-50">
                  {line(c, true)}
                </div>
              ))}
          </div>
        ))}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={`「${editing?.name ?? ''}」每月預算`}>
        <input className="input text-lg" type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="留空或 0 = 不設定" autoFocus={canAutoFocus} onKeyDown={(e) => e.key === 'Enter' && save()} />
        <button className="btn-primary mt-3 w-full py-2.5" onClick={save}>
          儲存
        </button>
      </Modal>
    </div>
  );
}
