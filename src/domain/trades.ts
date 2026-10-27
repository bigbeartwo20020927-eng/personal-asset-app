import type { ISODate, Trade } from '../types';
import { addBusinessDays } from './dates';
import { tradeValue } from './fees';

/** 成交日往後 2 個營業日（只跳過週六日） */
export function settleDateOf(tradeDate: ISODate): ISODate {
  return addBusinessDays(tradeDate, 2);
}

/** 這筆紀錄在交割日（或股利入帳日）對交割帳戶造成的現金變動 */
export function tradeCashFlow(t: Trade): number {
  switch (t.kind) {
    case 'buy':
      return -(tradeValue(t.shares, t.price) + t.fee);
    case 'sell':
      return tradeValue(t.shares, t.price) - t.fee - t.tax;
    case 'dayTrade':
      return dayTradePnL(t);
    case 'cashDividend':
      // 實際入帳 = 股利 − 入帳手續費（匯費）
      return (t.amount ?? 0) - (t.fee ?? 0);
    case 'stockDividend':
      return 0;
  }
}

export function dayTradePnL(t: Trade): number {
  const sell = tradeValue(t.shares, t.sellPrice ?? 0) - t.sellFee - t.tax;
  const buy = tradeValue(t.shares, t.price) + t.fee;
  return sell - buy;
}

/** 現金入帳的日期：買賣與當沖在交割日，股利在入帳日 */
export function cashDate(t: Trade): ISODate {
  return t.kind === 'cashDividend' || t.kind === 'stockDividend' ? t.tradeDate : t.settleDate;
}

/** 依成交日、建立時間排序 */
export function sortTrades(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) =>
    a.tradeDate !== b.tradeDate ? (a.tradeDate < b.tradeDate ? -1 : 1) : a.createdAt - b.createdAt,
  );
}

/** 含息成本模式下，現金股利在除息日生效（舊紀錄沒有除息日 → 入帳日） */
export function effectiveDate(t: Trade, dividendReducesCost: boolean): ISODate {
  return dividendReducesCost && t.kind === 'cashDividend' ? (t.exDate ?? t.tradeDate) : t.tradeDate;
}

/**
 * 重播用的排序：依生效日排序；同一天的話，含息成本的股利排在最前面
 * （除息日當天才買的股票領不到這次股利）。
 */
export function sortForReplay(trades: Trade[], dividendReducesCost: boolean): Trade[] {
  const first = (t: Trade) => (dividendReducesCost && t.kind === 'cashDividend' ? 0 : 1);
  return [...trades].sort((a, b) => {
    const da = effectiveDate(a, dividendReducesCost);
    const db = effectiveDate(b, dividendReducesCost);
    if (da !== db) return da < db ? -1 : 1;
    return first(a) - first(b) || a.createdAt - b.createdAt;
  });
}
