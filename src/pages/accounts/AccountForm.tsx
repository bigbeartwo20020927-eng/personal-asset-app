import { useState } from 'react';
import Modal from '../../components/Modal';
import { useAction, useToast } from '../../components/Toast';
import { subsOf, type AccountsData } from '../../data/useData';
import { today } from '../../domain/dates';
import { ACCOUNT_TYPE_LABEL, CURRENCIES, roundTo } from '../../format';
import { commit, createOp, deleteOp, updateOp } from '../../sync/write';
import type { Account, AccountType, DocData } from '../../types';
import { canAutoFocus } from '../../touchFocus';

export default function AccountForm({ data, edit, onClose }: { data: AccountsData; edit?: Account; onClose: () => void }) {
  const act = useAction();
  const toast = useToast();
  const [name, setName] = useState(edit?.name ?? '');
  const [type, setType] = useState<AccountType>(edit?.type ?? 'bank');
  const [currency, setCurrency] = useState(edit?.currency ?? 'TWD');
  const [initialBalance, setInitialBalance] = useState(edit ? String(edit.initialBalance) : '0');
  const [initialDate, setInitialDate] = useState(edit?.initialDate ?? today());
  const [isBroker, setIsBroker] = useState(edit?.isBroker ?? false);
  // 畫面上用「折」輸入：10 = 不打折，2.8 = 2.8 折
  const [discount, setDiscount] = useState(edit ? String(+(edit.feeDiscount * 10).toFixed(2)) : '10');
  const [minFee, setMinFee] = useState(edit ? String(edit.minFee) : '20');
  const [minFeeOddLot, setMinFeeOddLot] = useState(edit ? String(edit.minFeeOddLot) : '1');
  const [settleSub, setSettleSub] = useState<string | null>(edit?.settleSubAccountId ?? null);
  const [busy, setBusy] = useState(false);

  const subs = edit ? subsOf(data.subAccounts, edit.id) : [];
  const hasRecords =
    !!edit &&
    (data.ledger.some((e) => e.accountId === edit.id && e.source !== 'initial') ||
      data.trades.some((t) => t.accountId === edit.id) ||
      subs.length > 0);

  const save = async () => {
    if (!name.trim()) return toast('請輸入帳戶名稱', 'error');
    const d = Number(discount);
    if (isBroker && !(d > 0 && d <= 10)) return toast('手續費折扣請輸入 0～10 之間的數字，例如 2.8', 'error');
    const body: DocData<Account> = {
      name: name.trim(),
      type,
      currency,
      initialBalance: roundTo(Number(initialBalance) || 0, currency),
      initialDate,
      isBroker: type === 'bank' && isBroker,
      feeDiscount: isBroker ? d / 10 : 1,
      minFee: Number(minFee) || 0,
      minFeeOddLot: Number(minFeeOddLot) || 0,
      settleSubAccountId: settleSub,
      archived: edit?.archived ?? false,
      order: edit?.order ?? data.accounts.length,
    };
    setBusy(true);
    const ok = await act(() => commit([edit ? updateOp('accounts', edit, body) : createOp('accounts', body)]), edit ? '已更新' : '已新增帳戶');
    setBusy(false);
    if (ok) onClose();
  };

  const toggleArchive = async () => {
    if (!edit) return;
    const ok = await act(() => commit([updateOp('accounts', edit, { archived: !edit.archived })]), edit.archived ? '已取消封存' : '已封存');
    if (ok) onClose();
  };

  const remove = async () => {
    if (!edit || hasRecords) return;
    if (!confirm(`確定刪除帳戶「${edit.name}」？`)) return;
    const ok = await act(() => commit([deleteOp('accounts', edit)]), '已刪除');
    if (ok) onClose();
  };

  return (
    <Modal open title={edit ? '編輯帳戶' : '新增帳戶'} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">名稱</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：台新銀行、錢包" autoFocus={canAutoFocus} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">類型</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((k) => (
                <option key={k} value={k}>
                  {ACCOUNT_TYPE_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">幣別</label>
            <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={hasRecords}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} {c.code}
                </option>
              ))}
            </select>
          </div>
        </div>
        {hasRecords && <p className="-mt-1 text-xs text-slate-400">已有紀錄的帳戶不能更改幣別</p>}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">期初餘額</label>
            <input className="input" type="number" inputMode="decimal" step="any" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} />
          </div>
          <div>
            <label className="label">期初日期</label>
            <input className="input" type="date" value={initialDate} onChange={(e) => setInitialDate(e.target.value)} />
          </div>
        </div>

        {type === 'bank' && (
          <div className="rounded-lg bg-slate-50 p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isBroker} onChange={(e) => setIsBroker(e.target.checked)} className="h-4 w-4 accent-teal-700" />
              同時為券商（證券交割戶）
            </label>
            {isBroker && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="label">手續費折扣（折）</label>
                    <input className="input" type="number" inputMode="decimal" step="any" value={discount} onChange={(e) => setDiscount(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">整股最低</label>
                    <input className="input" type="number" inputMode="numeric" value={minFee} onChange={(e) => setMinFee(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">零股最低</label>
                    <input className="input" type="number" inputMode="numeric" value={minFeeOddLot} onChange={(e) => setMinFeeOddLot(e.target.value)} />
                  </div>
                </div>
                <p className="text-xs text-slate-500">手續費 = 成交金額 × 0.1425% × 折扣，無條件捨去，不足最低手續費時以最低計算。10 折＝不打折。</p>
                {subs.length > 0 && (
                  <div>
                    <label className="label">交割款從哪裡扣</label>
                    <select className="input" value={settleSub ?? ''} onChange={(e) => setSettleSub(e.target.value || null)}>
                      <option value="">未分配</option>
                      {subs.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <button className="btn-primary mt-4 w-full py-2.5" disabled={busy} onClick={save}>
        儲存
      </button>
      {edit && (
        <div className="mt-4 space-y-2 border-t border-slate-200 pt-4">
          <button className="btn w-full" onClick={toggleArchive}>
            {edit.archived ? '取消封存' : '封存帳戶（隱藏，但保留所有紀錄）'}
          </button>
          {hasRecords ? (
            <p className="text-center text-xs text-slate-400">已有紀錄或子帳戶的帳戶不能刪除，只能封存</p>
          ) : (
            <button className="btn-danger w-full" onClick={remove}>
              刪除帳戶
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
