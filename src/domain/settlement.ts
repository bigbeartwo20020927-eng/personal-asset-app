import type { ISODate, Trade } from '../types';
import { tradeCashFlow } from './trades';

export interface SettlementDay {
  date: ISODate;
  payable: number;
  receivable: number;
  net: number;
  /** 依序交割後的餘額 */
  balanceAfter: number;
  insufficient: boolean;
  trades: Trade[];
}

export interface SettlementSummary {
  bookBalance: number;
  /** 所有未交割的淨額合計 */
  pending: number;
  /** 現在可以安全動用、不會讓任何一天交割不足的金額 */
  available: number;
  days: SettlementDay[];
}

/** 帳戶紀錄列表裡的股票相關列 */
export type AccountTradeRow =
  | { kind: 'settlement'; date: ISODate; net: number; trades: Trade[] }
  | { kind: 'dividend'; date: ISODate; net: number; trade: Trade };

/**
 * 已經交割完成的款項（給帳戶紀錄列表顯示）：
 *  - 買賣與當沖依交割日合併成一筆淨額，和銀行存摺一樣
 *  - 現金股利各自一筆，日期為入帳日、金額為實際入帳（扣掉入帳手續費）
 * subId 不傳 = 整個帳戶；null = 只看從「未分配」交割的
 */
export function settledRows(trades: Trade[], accountId: string, today: ISODate, subId?: string | null): AccountTradeRow[] {
  const mine = trades.filter((t) => t.accountId === accountId && (subId === undefined || t.subAccountId === subId));
  const byDate = new Map<ISODate, Trade[]>();
  const rows: AccountTradeRow[] = [];
  for (const t of mine) {
    if (t.kind === 'buy' || t.kind === 'sell' || t.kind === 'dayTrade') {
      if (t.settleDate > today) continue;
      const list = byDate.get(t.settleDate) ?? [];
      list.push(t);
      byDate.set(t.settleDate, list);
    } else if (t.kind === 'cashDividend' && t.tradeDate <= today) {
      rows.push({ kind: 'dividend', date: t.tradeDate, net: tradeCashFlow(t), trade: t });
    }
  }
  for (const [date, list] of byDate) {
    rows.push({ kind: 'settlement', date, net: list.reduce((s, t) => s + tradeCashFlow(t), 0), trades: list });
  }
  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** 尚未交割的買賣與當沖（交割日晚於今天），同一天的應付和應收互相抵銷 */
export function settlementSummary(trades: Trade[], bookBalance: number, today: ISODate): SettlementSummary {
  const pending = trades.filter(
    (t) => (t.kind === 'buy' || t.kind === 'sell' || t.kind === 'dayTrade') && t.settleDate > today,
  );
  const byDate = new Map<ISODate, Trade[]>();
  for (const t of pending) {
    const list = byDate.get(t.settleDate) ?? [];
    list.push(t);
    byDate.set(t.settleDate, list);
  }
  const days: SettlementDay[] = [];
  let bal = bookBalance;
  let minBal = bookBalance;
  let total = 0;
  for (const date of [...byDate.keys()].sort()) {
    const list = byDate.get(date)!;
    let payable = 0;
    let receivable = 0;
    for (const t of list) {
      const cf = tradeCashFlow(t);
      if (cf < 0) payable += cf;
      else receivable += cf;
    }
    const net = payable + receivable;
    bal += net;
    total += net;
    minBal = Math.min(minBal, bal);
    days.push({ date, payable, receivable, net, balanceAfter: bal, insufficient: bal < 0, trades: list });
  }
  const available = Math.min(bookBalance, minBal);
  return { bookBalance, pending: total, available, days };
}
