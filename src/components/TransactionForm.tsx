import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAccountsData } from '../data/useData';
import { today } from '../domain/dates';
import { subBalanceProblem } from '../domain/guards';
import { CURRENCIES, fmt, roundTo } from '../format';
import { commit, createOp, deleteOp, updateOp, type WriteOp } from '../sync/write';
import type { DocData, Transaction, TransactionType } from '../types';
import AccountSelect from './AccountSelect';
import CategoryPicker from './CategoryPicker';
import Modal from './Modal';
import TagInput from './TagInput';
import { useAction, useToast } from './Toast';
import { useCol } from '../hooks';
import { canAutoFocus } from '../touchFocus';

type Defaults = Partial<Pick<Transaction, 'type' | 'accountId' | 'subAccountId' | 'toAccountId' | 'toSubAccountId'>>;

interface Ctx {
  /** 新增（可帶預設值）或編輯一筆紀錄 */
  openTx: (arg?: { edit?: Transaction; defaults?: Defaults }) => void;
}

const TxCtx = createContext<Ctx>({ openTx: () => {} });
export const useTxForm = () => useContext(TxCtx);

const TYPE_LABEL: Record<Exclude<TransactionType, 'debtPayment'>, string> = { expense: '支出', income: '收入', transfer: '轉帳' };
const LAST_ACCOUNT_KEY = 'lastAccountId';

function curName(code: string) {
  return CURRENCIES.find((c) => c.code === code)?.name ?? code;
}

export function TxFormProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ edit?: Transaction; defaults?: Defaults } | null>(null);
  const openTx = useCallback((arg?: { edit?: Transaction; defaults?: Defaults }) => setState(arg ?? {}), []);
  return (
    <TxCtx.Provider value={{ openTx }}>
      {children}
      {state && <TransactionForm edit={state.edit} defaults={state.defaults} onClose={() => setState(null)} />}
    </TxCtx.Provider>
  );
}

function TransactionForm({ edit, defaults, onClose }: { edit?: Transaction; defaults?: Defaults; onClose: () => void }) {
  const data = useAccountsData();
  const templates = useCol('templates');
  const act = useAction();
  const toast = useToast();

  const lastAccount = (() => {
    try {
      return localStorage.getItem(LAST_ACCOUNT_KEY) ?? '';
    } catch {
      return '';
    }
  })();
  const firstAccount = data.accounts.find((a) => !a.archived)?.id ?? '';

  const [type, setType] = useState<TransactionType>(edit?.type ?? defaults?.type ?? 'expense');
  const [amount, setAmount] = useState(edit ? String(edit.amount) : '');
  const [accountId, setAccountId] = useState(edit?.accountId ?? defaults?.accountId ?? (data.accountById.has(lastAccount) ? lastAccount : firstAccount));
  const [subId, setSubId] = useState<string | null>(edit?.subAccountId ?? defaults?.subAccountId ?? null);
  const [toAccountId, setToAccountId] = useState(edit?.toAccountId ?? defaults?.toAccountId ?? '');
  const [toSubId, setToSubId] = useState<string | null>(edit?.toSubAccountId ?? defaults?.toSubAccountId ?? null);
  const [toAmount, setToAmount] = useState(edit?.toAmount != null ? String(edit.toAmount) : '');
  const [rate, setRate] = useState('');
  const [transferFee, setTransferFee] = useState(edit?.fee ? String(edit.fee) : '');
  const [categoryId, setCategoryId] = useState<string | null>(edit?.categoryId ?? null);
  const [date, setDate] = useState(edit?.date ?? today());
  const [tags, setTags] = useState<string[]>(edit?.tags ?? []);
  const [note, setNote] = useState(edit?.note ?? '');
  const [busy, setBusy] = useState(false);

  // 第一次載入時帳戶資料可能還沒到
  useEffect(() => {
    if (!accountId && firstAccount) setAccountId(firstAccount);
  }, [accountId, firstAccount]);

  const from = data.accountById.get(accountId);
  const to = data.accountById.get(toAccountId);
  const crossCurrency = type === 'transfer' && !!from && !!to && from.currency !== to.currency;

  /** 匯率顯示方式：有台幣的一方時，一律顯示「1 外幣 = ? 台幣」；否則「1 轉出幣別 = ? 轉入幣別」 */
  const quote = useMemo(() => {
    if (!from || !to) return null;
    if (from.currency === 'TWD') return { base: to.currency, quote: 'TWD', toFromRate: (a: number, r: number) => a / r, rateOf: (a: number, b: number) => a / b };
    return { base: from.currency, quote: to.currency, toFromRate: (a: number, r: number) => a * r, rateOf: (a: number, b: number) => b / a };
  }, [from, to]);

  // 編輯既有的跨幣別轉帳時，帶出當時的匯率
  useEffect(() => {
    if (crossCurrency && quote && !rate && Number(amount) > 0 && Number(toAmount) > 0) {
      setRate(String(+quote.rateOf(Number(amount), Number(toAmount)).toFixed(6)));
    }
  }, [crossCurrency, quote]);

  const onAmount = (v: string) => {
    setAmount(v);
    if (crossCurrency && quote && Number(rate) > 0 && Number(v) > 0 && to) setToAmount(String(roundTo(quote.toFromRate(Number(v), Number(rate)), to.currency)));
  };
  const onToAmount = (v: string) => {
    setToAmount(v);
    if (crossCurrency && quote && Number(amount) > 0 && Number(v) > 0) setRate(String(+quote.rateOf(Number(amount), Number(v)).toFixed(6)));
  };
  const onRate = (v: string) => {
    setRate(v);
    if (crossCurrency && quote && Number(amount) > 0 && Number(v) > 0 && to) setToAmount(String(roundTo(quote.toFromRate(Number(amount), Number(v)), to.currency)));
  };

  const tagSuggestions = useMemo(() => {
    const count = new Map<string, number>();
    for (const t of data.transactions) for (const g of t.tags) count.set(g, (count.get(g) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
  }, [data.transactions]);

  const build = (): DocData<Transaction> | string => {
    const amt = Number(amount);
    if (!(amt > 0)) return '請輸入金額';
    if (!accountId || !from) return '請選擇帳戶';
    if ((type === 'expense' || type === 'income') && !categoryId) return '請選擇分類';
    if (type === 'transfer') {
      if (!toAccountId || !to) return '請選擇轉入帳戶';
      if (toAccountId === accountId && toSubId === subId) return '轉出和轉入不能是同一個帳戶';
      if (crossCurrency && !(Number(toAmount) > 0)) return '請輸入轉入金額或匯率';
      if ((Number(transferFee) || 0) < 0) return '手續費不能是負數';
    }
    const feeValue = type === 'transfer' ? roundTo(Number(transferFee) || 0, from.currency) : 0;
    return {
      type,
      accountId,
      subAccountId: subId,
      toAccountId: type === 'transfer' ? toAccountId : null,
      toSubAccountId: type === 'transfer' ? toSubId : null,
      debtId: edit?.debtId ?? null,
      amount: roundTo(amt, from.currency),
      toAmount: crossCurrency && to ? roundTo(Number(toAmount), to.currency) : null,
      fee: feeValue > 0 ? feeValue : null,
      categoryId: type === 'transfer' ? null : categoryId,
      tags,
      date,
      note: note.trim(),
    };
  };

  /** 防呆：存檔或刪除後，子帳戶不能在任何時間點變成負數 */
  const guard = (next: Transaction[]): string | null => {
    const base = { accounts: data.accounts, allocations: data.allocations, trades: data.trades };
    return subBalanceProblem({ ...base, transactions: data.transactions }, { ...base, transactions: next }, (id) => data.subById.get(id)?.name ?? '子帳戶');
  };

  const save = async () => {
    const d = build();
    if (typeof d === 'string') return toast(d, 'error');
    const others = data.transactions.filter((t) => t.id !== edit?.id);
    const problem = guard([...others, { ...(edit ?? { id: 'new', version: 0, updatedAt: 0, deleted: false }), ...d }]);
    if (problem) return toast(problem, 'error');
    setBusy(true);
    const op: WriteOp = edit ? updateOp('transactions', edit, d) : createOp('transactions', d);
    const ok = await act(() => commit([op]), edit ? '已更新' : '已記錄');
    setBusy(false);
    if (ok) {
      try {
        localStorage.setItem(LAST_ACCOUNT_KEY, accountId);
      } catch {
        // 不能存就算了
      }
      onClose();
    }
  };

  const remove = async () => {
    if (!edit) return;
    const problem = guard(data.transactions.filter((t) => t.id !== edit.id));
    if (problem) return toast(problem, 'error');
    if (!confirm('確定要刪除這筆紀錄嗎？相關的餘額、預算、統計和曲線都會回到記錄之前的狀態。')) return;
    setBusy(true);
    const ok = await act(() => commit([deleteOp('transactions', edit)]), '已刪除');
    setBusy(false);
    if (ok) onClose();
  };

  const saveTemplate = async () => {
    const d = build();
    if (typeof d === 'string') return toast(d, 'error');
    const name = prompt('範本名稱', data.catById.get(d.categoryId ?? '')?.name ?? '');
    if (!name?.trim()) return;
    await act(
      () =>
        commit([
          createOp('templates', {
            name: name.trim(),
            type: d.type,
            accountId: d.accountId,
            subAccountId: d.subAccountId,
            categoryId: d.categoryId,
            amount: d.amount,
            tags: d.tags,
            note: d.note,
          }),
        ]),
      '已存成範本',
    );
  };

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setType(t.type);
    setAmount(String(t.amount));
    if (data.accountById.has(t.accountId)) {
      setAccountId(t.accountId);
      setSubId(t.subAccountId);
    }
    setCategoryId(t.categoryId);
    setTags(t.tags);
    setNote(t.note);
  };

  const removeTemplate = async (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (t && confirm(`刪除範本「${t.name}」？`)) await act(() => commit([deleteOp('templates', t)]));
  };

  const isDebtPayment = edit?.type === 'debtPayment';

  return (
    <Modal open title={edit ? '編輯紀錄' : '記一筆'} onClose={onClose}>
      {isDebtPayment ? (
        <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">這是一筆負債還款，請到「負債」頁面修改。</p>
      ) : (
        <>
          {!edit && templates.length > 0 && (
            <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
              {templates.map((t) => (
                <span key={t.id} className="flex shrink-0 items-center rounded-full bg-amber-50 text-sm text-amber-800">
                  <button type="button" className="py-1 pl-3 pr-1" onClick={() => applyTemplate(t.id)}>
                    {t.name}
                  </button>
                  <button type="button" className="py-1 pl-1 pr-2 text-amber-500" onClick={() => removeTemplate(t.id)} aria-label="刪除範本">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="mb-3 grid grid-cols-3 rounded-lg bg-slate-100 p-0.5 text-sm">
            {(Object.keys(TYPE_LABEL) as (keyof typeof TYPE_LABEL)[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setType(k);
                  setCategoryId(null);
                }}
                className={`rounded-md py-1.5 ${type === k ? 'bg-white font-medium shadow-sm' : 'text-slate-500'}`}
              >
                {TYPE_LABEL[k]}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <div>
              <label className="label">{type === 'transfer' ? '轉出帳戶' : '帳戶'}</label>
              <AccountSelect
                accounts={data.accounts}
                subAccounts={data.subAccounts}
                accountId={accountId}
                subId={subId}
                onChange={(a, s) => {
                  setAccountId(a);
                  setSubId(s);
                }}
              />
            </div>

            {type === 'transfer' && (
              <div>
                <label className="label">轉入帳戶</label>
                <AccountSelect
                  accounts={data.accounts}
                  subAccounts={data.subAccounts}
                  accountId={toAccountId}
                  subId={toSubId}
                  onChange={(a, s) => {
                    setToAccountId(a);
                    setToSubId(s);
                  }}
                />
              </div>
            )}

            <div>
              <label className="label">{crossCurrency ? `轉出金額（${curName(from!.currency)}）` : '金額'}</label>
              <input className="input text-lg" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={(e) => onAmount(e.target.value)} autoFocus={canAutoFocus} />
            </div>

            {crossCurrency && quote && (
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3">
                <div>
                  <label className="label">轉入金額（{curName(to!.currency)}）</label>
                  <input className="input" type="number" inputMode="decimal" min="0" step="any" value={toAmount} onChange={(e) => onToAmount(e.target.value)} />
                </div>
                <div>
                  <label className="label">
                    匯率（1 {quote.base} = ? {quote.quote}）
                  </label>
                  <input className="input" type="number" inputMode="decimal" min="0" step="any" value={rate} onChange={(e) => onRate(e.target.value)} />
                </div>
                <p className="col-span-2 text-xs text-slate-500">輸入「轉入金額」會自動算出匯率；輸入「匯率」會自動算出轉入金額。</p>
              </div>
            )}

            {type === 'transfer' && (
              <div>
                <label className="label">轉帳手續費（選填{from && from.currency !== 'TWD' ? `，${curName(from.currency)}` : ''}）</label>
                <input className="input" type="number" inputMode="decimal" min="0" step="any" value={transferFee} onChange={(e) => setTransferFee(e.target.value)} placeholder="例如跨行轉帳 15" />
                <p className="mt-1 text-xs text-slate-500">由轉出帳戶負擔：轉出帳戶扣「金額 ＋ 手續費」，轉入帳戶收到「金額」。手續費會算進收支統計的支出。</p>
              </div>
            )}

            {type !== 'transfer' && (
              <div>
                <label className="label">分類</label>
                <CategoryPicker categories={data.categories} kind={type === 'income' ? 'income' : 'expense'} value={categoryId} onChange={setCategoryId} />
              </div>
            )}

            <div>
              <label className="label">日期</label>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div>
              <label className="label">標籤</label>
              <TagInput value={tags} onChange={setTags} suggestions={tagSuggestions} />
            </div>

            <div>
              <label className="label">備註</label>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          {from && Number(amount) > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              {type === 'income' ? '存入' : '扣除'} {from.currency}{' '}
              {fmt(Number(amount) + (type === 'transfer' ? Number(transferFee) || 0 : 0), from.currency)}
              {type === 'transfer' && Number(transferFee) > 0 && `（含手續費 ${fmt(Number(transferFee), from.currency)}）`}
              {subId ? `（${data.subById.get(subId)?.name}）` : data.subAccounts.some((s) => s.accountId === accountId) ? '（未分配）' : ''}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button className="btn-primary flex-1 py-2.5" disabled={busy} onClick={save}>
              儲存
            </button>
            {!edit && (
              <button className="btn" disabled={busy} onClick={saveTemplate}>
                存成範本
              </button>
            )}
          </div>
        </>
      )}
      {edit && (
        <button className="btn-danger mt-3 w-full" disabled={busy} onClick={remove}>
          刪除這筆紀錄
        </button>
      )}
    </Modal>
  );
}
