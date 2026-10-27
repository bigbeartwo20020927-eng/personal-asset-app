import type { CostMethod, CostOptions, ISODate, Trade } from '../types';
import type { BrokerFee } from './fees';
import { looseDividends, PortfolioReplayer, toCostOptions, type PositionState } from './holdings';
import type { PriceSeries } from './prices';
import { cashDate, effectiveDate, sortForReplay, tradeCashFlow } from './trades';
import { valuePosition } from './valuation';
import type { CashFlow } from './xirr';

export interface PortfolioPoint {
  date: ISODate;
  /** A 市值 */
  marketValue: number;
  /** B 投入成本 */
  cost: number;
  /** C 淨損益 = 淨未實現 + 已實現 + 股利（未扣進成本的部分）+ 當沖 */
  netPnL: number;
  /** E+F 累計已實現損益＋股利（未扣進成本的部分） */
  realizedPlusDiv: number;
  /** G 累計當沖損益 */
  dayTrade: number;
  /** I 個股市值 */
  bySymbol: Record<string, number>;
}

export interface MarketContext {
  priceOf: (symbol: string) => PriceSeries | undefined;
  /** 券商帳戶的手續費設定 */
  brokerOf: (accountId: string) => BrokerFee;
  isETF: (symbol: string) => boolean;
}

/** 沒有收盤價時（例如股價還沒抓到），先用最後一次成交價代替 */
function closeFor(ctx: MarketContext, symbol: string, date: ISODate, lastPrice: Map<string, number>): number | null {
  return ctx.priceOf(symbol)?.closeOn(date) ?? lastPrice.get(symbol) ?? null;
}

export function valueAll(positions: Iterable<PositionState>, ctx: MarketContext, date: ISODate, lastPrice: Map<string, number>, perLot = false) {
  let marketValue = 0;
  let cost = 0;
  let netUnrealized = 0;
  let realized = 0;
  /** 未扣進成本的股利；含息成本模式下已扣進成本的部分包含在未實現／已實現裡，不能重複加 */
  let dividends = 0;
  let dayTrade = 0;
  const bySymbol: Record<string, number> = {};
  for (const p of positions) {
    realized += p.realized;
    dividends += looseDividends(p);
    dayTrade += p.dayTrade;
    if (p.shares <= 0) continue;
    const close = closeFor(ctx, p.symbol, date, lastPrice);
    const v = valuePosition(p, close, ctx.brokerOf(p.accountId), ctx.isETF(p.symbol), date, perLot);
    marketValue += v.marketValue;
    cost += p.cost;
    netUnrealized += v.netUnrealized;
    // 個股市值堆疊：同一支股票各券商加總
    bySymbol[p.symbol] = (bySymbol[p.symbol] ?? 0) + v.marketValue;
  }
  return { marketValue, cost, netUnrealized, realized, dividends, dayTrade, bySymbol };
}

/** 在每個取樣日依序重播買賣紀錄，算出投資曲線；symbol 有值時只算那一支，accountId 有值時只算那家券商 */
export function portfolioSeries(
  trades: Trade[],
  opts: CostMethod | CostOptions,
  ctx: MarketContext,
  dates: ISODate[],
  symbol?: string,
  accountId?: string,
): PortfolioPoint[] {
  const o = toCostOptions(opts);
  const picked = trades.filter((t) => (!symbol || t.symbol === symbol) && (!accountId || t.accountId === accountId));
  const list = sortForReplay(picked, o.dividendReducesCost);
  const r = new PortfolioReplayer(o);
  const lastPrice = new Map<string, number>();
  const out: PortfolioPoint[] = [];
  let i = 0;
  for (const date of dates) {
    while (i < list.length && effectiveDate(list[i], o.dividendReducesCost) <= date) {
      const t = list[i++];
      r.apply(t);
      if ((t.kind === 'buy' || t.kind === 'sell') && t.price > 0) lastPrice.set(t.symbol, t.price);
    }
    const v = valueAll(r.positions.values(), ctx, date, lastPrice, o.method === 'fifo');
    out.push({
      date,
      marketValue: v.marketValue,
      cost: v.cost,
      netPnL: v.netUnrealized + v.realized + v.dividends + v.dayTrade,
      realizedPlusDiv: v.realized + v.dividends,
      dayTrade: v.dayTrade,
      bySymbol: v.bySymbol,
    });
  }
  return out;
}

/** XIRR 用的現金流：投入為負、取回為正，最後一筆是今天「如果全部賣出」的淨額 */
export function portfolioCashFlows(trades: Trade[], terminalValue: number, today: ISODate, symbol?: string, accountId?: string): CashFlow[] {
  const flows: CashFlow[] = [];
  for (const t of trades) {
    if (symbol && t.symbol !== symbol) continue;
    if (accountId && t.accountId !== accountId) continue;
    const amt = tradeCashFlow(t);
    if (amt !== 0) flows.push({ date: cashDate(t) <= today ? cashDate(t) : today, amount: amt });
  }
  if (terminalValue > 0) flows.push({ date: today, amount: terminalValue });
  return flows;
}
