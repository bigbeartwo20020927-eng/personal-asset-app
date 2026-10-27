import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import { useAction, useToast } from '../../components/Toast';
import { subsOf, type AccountsData } from '../../data/useData';
import { today } from '../../domain/dates';
import { subBalanceProblem } from '../../domain/guards';
import { balanceAt } from '../../domain/ledger';
import { fmt, roundTo } from '../../format';
import { commit, createOp, deleteOp, updateOp, type WriteOp } from '../../sync/write';
import type { Account, Allocation, DocData, SubAccount } from '../../types';
import { canAutoFocus } from '../../touchFocus';

/** 新增／編輯子帳戶（名稱、存錢目標） */
export function SubAccountForm({ data, account, edit, onClose }: { data: AccountsData; account: Account; edit?: SubAccount; onClose: () => void }) {
  const act = useAction();
  const toast = useToast();
  const [name, setName] = useState(edit?.name ?? '');
  const [goalAmount, setGoalAmount] = useState(edit?.goalAmount != null ? String(edit.goalAmount) : '');
  const [goalDate, setGoalDate] = useState(edit?.goalDate ?? '');

  const save = async () => {
    if (!name.trim()) return toast('請輸入名稱', 'error');
    const body: DocData<SubAccount> = {
      accountId: account.id,
      name: name.trim(),
      goalAmount: Number(goalAmount) > 0 ? roundTo(Number(goalAmount), account.currency) : null,
      goalDate: goalDate || null,
      order: edit?.order ?? subsOf(data.subAccounts, account.id).length,
    };
    const ok = await act(() => commit([edit ? updateOp('subAccounts', edit, body) : createOp('subAccounts', body)]), edit ? '已更新' : '已新增子帳戶');
    if (ok) onClose();
  };

  /** 刪除子帳戶：剩下的餘額自動劃撥回「未分配」 */
  const remove = async () => {
    if (!edit) return;
    const bal = balanceAt(data.ledger, account.id, '9999-12-31', edit.id);
    const msg = bal !== 0 ? `子帳戶「${edit.name}」還有 ${fmt(bal, account.currency)}，刪除後會自動劃撥回「未分配」。確定刪除？` : `確定刪除子帳戶「${edit.name}」？`;
    if (!confirm(msg)) return;
    const ops: WriteOp[] = [deleteOp('subAccounts', edit)];
    if (bal !== 0) {
      ops.push(createOp('allocations', { accountId: account.id, fromSubId: edit.id, toSubId: null, amount: bal, date: today(), note: `刪除子帳戶「${edit.name}」` }));
    }
    const patch: WriteOp[] = account.settleSubAccountId === edit.id ? [updateOp('accounts', account, { settleSubAccountId: null })] : [];
    const ok = await act(() => commit([...ops, ...patch]), '已刪除');
    if (ok) onClose();
  };

  return (
    <Modal open title={edit ? '編輯子帳戶' : `在「${account.name}」新增子帳戶`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">名稱</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：旅遊基金、緊急預備金" autoFocus={canAutoFocus} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">存錢目標（選填）</label>
            <input className="input" type="number" inputMode="decimal" step="any" value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)} />
          </div>
          <div>
            <label className="label">目標期限（選填）</label>
            <input className="input" type="date" value={goalDate} onChange={(e) => setGoalDate(e.target.value)} />
          </div>
        </div>
      </div>
      <button className="btn-primary mt-4 w-full py-2.5" onClick={save}>
        儲存
      </button>
      {edit && (
        <button className="btn-danger mt-3 w-full" onClick={remove}>
          刪除子帳戶
        </button>
      )}
    </Modal>
  );
}

/** 劃撥：未分配 ↔ 子帳戶、子帳戶 ↔ 子帳戶 */
export function AllocationForm({
  data,
  account,
  edit,
  defaultTo,
  onClose,
}: {
  data: AccountsData;
  account: Account;
  edit?: Allocation;
  defaultTo?: string | null;
  onClose: () => void;
}) {
  const act = useAction();
  const toast = useToast();
  const subs = subsOf(data.subAccounts, account.id);
  const [fromSub, setFromSub] = useState<string | null>(edit ? edit.fromSubId : null);
  const [toSub, setToSub] = useState<string | null>(edit ? edit.toSubId : (defaultTo ?? subs[0]?.id ?? null));
  const [amount, setAmount] = useState(edit ? String(edit.amount) : '');
  const [date, setDate] = useState(edit?.date ?? today());
  const [note, setNote] = useState(edit?.note ?? '');

  // 表單剛打開時子帳戶資料可能還沒讀到，讀到後預設劃入第一個子帳戶
  const firstSub = subs[0]?.id ?? null;
  useEffect(() => {
    if (!edit && defaultTo === undefined && toSub === null && firstSub) setToSub(firstSub);
    // 只在子帳戶資料第一次讀到時執行
  }, [firstSub]);

  const avail =(sub: string | null) => balanceAt(data.ledger, account.id, '9999-12-31', sub) + (edit && edit.fromSubId === sub ? edit.amount : 0) - (edit && edit.toSubId === sub ? edit.amount : 0);

  const guard = (next: Allocation[]) => {
    const base = { accounts: data.accounts, transactions: data.transactions, trades: data.trades };
    return subBalanceProblem({ ...base, allocations: data.allocations }, { ...base, allocations: next }, (id) => data.subById.get(id)?.name ?? '子帳戶');
  };

  const save = async () => {
    const amt = roundTo(Number(amount), account.currency);
    if (!(amt > 0)) return toast('請輸入金額', 'error');
    if (fromSub === toSub) return toast('劃出和劃入不能相同', 'error');
    const body: DocData<Allocation> = { accountId: account.id, fromSubId: fromSub, toSubId: toSub, amount: amt, date, note: note.trim() };
    const others = data.allocations.filter((a) => a.id !== edit?.id);
    const problem = guard([...others, { ...(edit ?? { id: 'new', version: 0, updatedAt: 0, deleted: false }), ...body }]);
    if (problem) return toast(problem, 'error');
    const ok = await act(() => commit([edit ? updateOp('allocations', edit, body) : createOp('allocations', body)]), edit ? '已更新' : '已劃撥');
    if (ok) onClose();
  };

  const remove = async () => {
    if (!edit) return;
    const problem = guard(data.allocations.filter((a) => a.id !== edit.id));
    if (problem) return toast(problem, 'error');
    if (!confirm('確定刪除這筆劃撥？')) return;
    const ok = await act(() => commit([deleteOp('allocations', edit)]), '已刪除');
    if (ok) onClose();
  };

  const option = (sub: string | null) => (
    <option key={sub ?? 'none'} value={sub ?? ''}>
      {sub ? data.subById.get(sub)?.name : '未分配'}（{fmt(avail(sub), account.currency)}）
    </option>
  );

  return (
    <Modal open title={edit ? '編輯劃撥' : '劃撥'} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">從</label>
            <select className="input" value={fromSub ?? ''} onChange={(e) => setFromSub(e.target.value || null)}>
              {[null, ...subs.map((s) => s.id)].map(option)}
            </select>
          </div>
          <div>
            <label className="label">到</label>
            <select className="input" value={toSub ?? ''} onChange={(e) => setToSub(e.target.value || null)}>
              {[null, ...subs.map((s) => s.id)].map(option)}
            </select>
          </div>
        </div>
        <div>
          <label className="label">金額（{account.currency}）</label>
          <input className="input text-lg" type="number" inputMode="decimal" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus={canAutoFocus} />
        </div>
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
          刪除這筆劃撥
        </button>
      )}
    </Modal>
  );
}
