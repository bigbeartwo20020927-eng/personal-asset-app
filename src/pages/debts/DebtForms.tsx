import { useEffect, useState } from 'react';
import AccountSelect from '../../components/AccountSelect';
import Modal from '../../components/Modal';
import { useAction, useToast } from '../../components/Toast';
import type { AccountsData } from '../../data/useData';
import { today } from '../../domain/dates';
import { subBalanceProblem } from '../../domain/guards';
import { commit, createOp, deleteOp, updateOp } from '../../sync/write';
import type { Debt, DocData, Transaction } from '../../types';
import { canAutoFocus } from '../../touchFocus';

/** 新增／編輯負債 */
export function DebtForm({ data, edit, onClose }: { data: AccountsData; edit?: Debt; onClose: () => void }) {
  const act = useAction();
  const toast = useToast();
  const [name, setName] = useState(edit?.name ?? '');
  const [principal, setPrincipal] = useState(edit ? String(edit.principal) : '');
  const [rate, setRate] = useState(edit ? String(+(edit.rate * 100).toFixed(4)) : '');
  const [monthly, setMonthly] = useState(edit ? String(edit.monthlyPayment) : '');
  const [balance, setBalance] = useState(edit ? String(edit.initialBalance) : '');
  const [startDate, setStartDate] = useState(edit?.startDate ?? today());
  const payments = edit ? data.transactions.filter((t) => t.type === 'debtPayment' && t.debtId === edit.id) : [];

  const save = async () => {
    if (!name.trim()) return toast('請輸入名稱', 'error');
    const bal = Math.round(Number(balance || principal));
    if (!(bal > 0)) return toast('請輸入目前餘額', 'error');
    const body: DocData<Debt> = {
      name: name.trim(),
      principal: Math.round(Number(principal) || bal),
      rate: (Number(rate) || 0) / 100,
      monthlyPayment: Math.round(Number(monthly) || 0),
      initialBalance: bal,
      startDate,
    };
    const ok = await act(() => commit([edit ? updateOp('debts', edit, body) : createOp('debts', body)]), edit ? '已更新' : '已新增負債');
    if (ok) onClose();
  };

  const remove = async () => {
    if (!edit) return;
    if (payments.length) return toast(`這筆負債還有 ${payments.length} 筆還款紀錄，請先刪除還款紀錄`, 'error');
    if (!confirm(`確定刪除「${edit.name}」？`)) return;
    if (await act(() => commit([deleteOp('debts', edit)]), '已刪除')) onClose();
  };

  return (
    <Modal open title={edit ? '編輯負債' : '新增負債'} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">名稱</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：房貸、信貸、學貸" autoFocus={canAutoFocus} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">原始借款金額</label>
            <input className="input" type="number" inputMode="numeric" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
          </div>
          <div>
            <label className="label">年利率（%）</label>
            <input className="input" type="number" inputMode="decimal" step="any" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="例如 2.1" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">每月還款額</label>
            <input className="input" type="number" inputMode="numeric" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
          </div>
          <div>
            <label className="label">記錄起始日</label>
            <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">起始日當天的剩餘本金</label>
          <input className="input" type="number" inputMode="numeric" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="留空 = 原始借款金額" />
          <p className="mt-1 text-xs text-slate-500">之後每次還款，會從這個金額扣掉本金部分。</p>
        </div>
      </div>
      <button className="btn-primary mt-4 w-full py-2.5" onClick={save}>
        儲存
      </button>
      {edit && (
        <button className="btn-danger mt-3 w-full" onClick={remove}>
          刪除負債
        </button>
      )}
    </Modal>
  );
}

/** 還款：從帳戶扣整筆金額，負債餘額只扣本金（還款金額 − 利息） */
export function PaymentForm({ data, debt, edit, onClose }: { data: AccountsData; debt: Debt; edit?: Transaction; onClose: () => void }) {
  const act = useAction();
  const toast = useToast();
  const firstAccount = data.accounts.find((a) => !a.archived && a.currency === 'TWD')?.id ?? '';
  const [accountId, setAccountId] = useState(edit?.accountId ?? '');
  const [subId, setSubId] = useState<string | null>(edit?.subAccountId ?? null);
  const [amount, setAmount] = useState(edit ? String(edit.amount) : debt.monthlyPayment ? String(debt.monthlyPayment) : '');
  const [interest, setInterest] = useState(edit?.interest ? String(edit.interest) : '');
  const [date, setDate] = useState(edit?.date ?? today());
  const [note, setNote] = useState(edit?.note ?? '');

  useEffect(() => {
    if (!accountId && firstAccount) setAccountId(firstAccount);
  }, [accountId, firstAccount]);

  const guard = (next: Transaction[]) => {
    const base = { accounts: data.accounts, allocations: data.allocations, trades: data.trades };
    return subBalanceProblem({ ...base, transactions: data.transactions }, { ...base, transactions: next }, (id) => data.subById.get(id)?.name ?? '子帳戶');
  };

  const save = async () => {
    const amt = Math.round(Number(amount));
    const int = Math.round(Number(interest) || 0);
    if (!(amt > 0)) return toast('請輸入還款金額', 'error');
    if (!accountId) return toast('請選擇扣款帳戶', 'error');
    if (int < 0 || int > amt) return toast('利息不能大於還款金額', 'error');
    const body: DocData<Transaction> = {
      type: 'debtPayment',
      accountId,
      subAccountId: subId,
      toAccountId: null,
      toSubAccountId: null,
      debtId: debt.id,
      amount: amt,
      toAmount: null,
      interest: int || null,
      categoryId: null,
      tags: [],
      date,
      note: note.trim(),
    };
    const others = data.transactions.filter((t) => t.id !== edit?.id);
    const problem = guard([...others, { ...(edit ?? { id: 'new', version: 0, updatedAt: 0, deleted: false }), ...body }]);
    if (problem) return toast(problem, 'error');
    const ok = await act(() => commit([edit ? updateOp('transactions', edit, body) : createOp('transactions', body)]), edit ? '已更新' : '已記錄還款');
    if (ok) onClose();
  };

  const remove = async () => {
    if (!edit) return;
    const problem = guard(data.transactions.filter((t) => t.id !== edit.id));
    if (problem) return toast(problem, 'error');
    if (!confirm('確定刪除這筆還款？帳戶餘額和負債餘額都會回到還款之前。')) return;
    if (await act(() => commit([deleteOp('transactions', edit)]), '已刪除')) onClose();
  };

  const principalPart = Math.max(0, (Number(amount) || 0) - (Number(interest) || 0));

  return (
    <Modal open title={`${edit ? '編輯' : ''}還款 · ${debt.name}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">從哪個帳戶扣款</label>
          <AccountSelect
            accounts={data.accounts.filter((a) => a.currency === 'TWD')}
            subAccounts={data.subAccounts}
            accountId={accountId}
            subId={subId}
            onChange={(a, s) => {
              setAccountId(a);
              setSubId(s);
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">還款金額</label>
            <input className="input text-lg" type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus={canAutoFocus} />
          </div>
          <div>
            <label className="label">其中利息（選填）</label>
            <input className="input text-lg" type="number" inputMode="numeric" value={interest} onChange={(e) => setInterest(e.target.value)} placeholder="0" />
          </div>
        </div>
        <p className="text-xs text-slate-500">
          帳戶扣 {(Number(amount) || 0).toLocaleString('zh-TW')}，負債本金減少 {principalPart.toLocaleString('zh-TW')}。利息請看銀行的還款明細，不填就當作整筆都是本金。
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">日期</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">備註</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      </div>
      <button className="btn-primary mt-4 w-full py-2.5" onClick={save}>
        儲存
      </button>
      {edit && (
        <button className="btn-danger mt-3 w-full" onClick={remove}>
          刪除這筆還款
        </button>
      )}
    </Modal>
  );
}
