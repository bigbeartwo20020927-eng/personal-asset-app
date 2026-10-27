import type { Account, Allocation, Debt, ISODate, Trade, Transaction } from '../types';
import { cashDate, tradeCashFlow } from './trades';

/** 帳戶裡每一筆金額變動；subId = null 代表「未分配」 */
export interface LedgerEvent {
  date: ISODate;
  accountId: string;
  subId: string | null;
  amount: number;
  source: 'initial' | 'transaction' | 'allocation' | 'trade';
  sourceId: string;
}

export interface LedgerInput {
  accounts: Account[];
  transactions: Transaction[];
  allocations: Allocation[];
  trades: Trade[];
}

export function buildLedger({ accounts, transactions, allocations, trades }: LedgerInput): LedgerEvent[] {
  const ev: LedgerEvent[] = [];
  for (const a of accounts) {
    if (a.initialBalance !== 0) {
      ev.push({ date: a.initialDate, accountId: a.id, subId: null, amount: a.initialBalance, source: 'initial', sourceId: a.id });
    }
  }
  for (const t of transactions) {
    const base = { date: t.date, source: 'transaction' as const, sourceId: t.id };
    switch (t.type) {
      case 'income':
        ev.push({ ...base, accountId: t.accountId, subId: t.subAccountId, amount: t.amount });
        break;
      case 'expense':
      case 'debtPayment':
        ev.push({ ...base, accountId: t.accountId, subId: t.subAccountId, amount: -t.amount });
        break;
      case 'transfer':
        // 轉帳手續費由轉出帳戶負擔
        ev.push({ ...base, accountId: t.accountId, subId: t.subAccountId, amount: -(t.amount + (t.fee ?? 0)) });
        if (t.toAccountId) {
          ev.push({ ...base, accountId: t.toAccountId, subId: t.toSubAccountId, amount: t.toAmount ?? t.amount });
        }
        break;
    }
  }
  for (const al of allocations) {
    const base = { date: al.date, accountId: al.accountId, source: 'allocation' as const, sourceId: al.id };
    ev.push({ ...base, subId: al.fromSubId, amount: -al.amount });
    ev.push({ ...base, subId: al.toSubId, amount: al.amount });
  }
  for (const t of trades) {
    const amt = tradeCashFlow(t);
    if (amt !== 0) {
      ev.push({ date: cashDate(t), accountId: t.accountId, subId: t.subAccountId, amount: amt, source: 'trade', sourceId: t.id });
    }
  }
  return ev;
}

/** 帳戶在某天（含）為止的餘額；subId 不傳 = 整個帳戶，null = 未分配 */
export function balanceAt(events: LedgerEvent[], accountId: string, upTo: ISODate, subId?: string | null): number {
  let sum = 0;
  for (const e of events) {
    if (e.accountId !== accountId || e.date > upTo) continue;
    if (subId !== undefined && e.subId !== subId) continue;
    sum += e.amount;
  }
  return sum;
}

/** 負債的變動：初始餘額（正數＝欠款），每次還款扣掉本金部分（還款金額 − 利息） */
export function debtEvents(debt: Debt, transactions: Transaction[]): { date: ISODate; amount: number }[] {
  const ev = [{ date: debt.startDate, amount: debt.initialBalance }];
  for (const t of transactions) {
    if (t.type === 'debtPayment' && t.debtId === debt.id) ev.push({ date: t.date, amount: -(t.amount - (t.interest ?? 0)) });
  }
  return ev;
}

/**
 * 檢查子帳戶在任何時間點的最低餘額。
 * 用於防呆：如果刪除或修改會讓某個子帳戶「新出現」負數，就要擋下來。
 */
export function minSubBalances(events: LedgerEvent[]): Map<string, number> {
  const bySub = new Map<string, { date: ISODate; amount: number }[]>();
  for (const e of events) {
    if (e.subId == null) continue;
    let list = bySub.get(e.subId);
    if (!list) bySub.set(e.subId, (list = []));
    list.push(e);
  }
  const out = new Map<string, number>();
  for (const [sub, list] of bySub) {
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.amount - a.amount));
    let sum = 0;
    let min = 0;
    // 同一天內先加後減，避免同日劃入又支出被誤判成負數
    for (const e of list) {
      sum += e.amount;
      min = Math.min(min, sum);
    }
    out.set(sub, min);
  }
  return out;
}
