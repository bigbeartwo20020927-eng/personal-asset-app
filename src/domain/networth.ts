import type { CostMethod, CostOptions, ISODate, Trade } from '../types';
import type { LedgerEvent } from './ledger';
import { portfolioSeries, type MarketContext } from './portfolio';
import { sampleDates, valuesAt, type DatedAmount, type Granularity } from './series';
import { tradeCashFlow } from './trades';

/**
 * 淨資產用的帳戶變動：買賣股票的交割款在「成交日」就視為已圈存扣除，
 * 避免 T+2 期間股票已計入市值、現金卻還在帳戶裡而重複計算。
 * （帳戶本身的餘額與曲線仍然在交割日才扣款）
 */
export function netWorthAccountEvents(ledger: LedgerEvent[], trades: Trade[], accountIds: Set<string>): DatedAmount[] {
  const tradeById = new Map(trades.map((t) => [t.id, t]));
  const out: DatedAmount[] = [];
  for (const e of ledger) {
    if (!accountIds.has(e.accountId)) continue;
    const t = e.source === 'trade' ? tradeById.get(e.sourceId) : undefined;
    if (t && (t.kind === 'buy' || t.kind === 'sell' || t.kind === 'dayTrade')) out.push({ date: t.tradeDate, amount: tradeCashFlow(t) });
    else out.push({ date: e.date, amount: e.amount });
  }
  return out;
}

export interface NetWorthPoint {
  date: ISODate;
  accounts: number;
  investments: number;
  debts: number;
  netWorth: number;
}

/**
 * 淨資產曲線（新台幣）= 帳戶合計 + 股票市值 − 負債。
 * 從所有資料中最早的一筆的前一天（0）開始。
 */
export function netWorthSeries(input: {
  accountEvents: DatedAmount[];
  debtEvents: DatedAmount[];
  trades: Trade[];
  method: CostMethod | CostOptions;
  ctx: MarketContext;
  today: ISODate;
  gran: Granularity;
}): NetWorthPoint[] {
  const firsts = [
    ...input.accountEvents.map((e) => e.date),
    ...input.debtEvents.map((e) => e.date),
    ...input.trades.map((t) => t.tradeDate),
  ].filter((d) => d <= input.today);
  if (firsts.length === 0) return [];
  const first = firsts.reduce((a, b) => (a < b ? a : b));
  const dates = sampleDates(first, input.today, input.gran);
  const acc = valuesAt(input.accountEvents, dates);
  const debt = valuesAt(input.debtEvents, dates);
  const inv = portfolioSeries(input.trades, input.method, input.ctx, dates);
  return dates.map((date, i) => {
    const investments = Math.round(inv[i]?.marketValue ?? 0);
    return {
      date,
      accounts: acc[i],
      investments,
      debts: debt[i],
      netWorth: Math.round(acc[i] + investments - debt[i]),
    };
  });
}
