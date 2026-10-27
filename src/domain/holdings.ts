import type { CostMethod, CostOptions, ISODate, Trade } from '../types';
import { tradeValue } from './fees';
import { dayTradePnL, effectiveDate, sortForReplay } from './trades';

export interface Lot {
  shares: number;
  /** 這一批剩下的總成本（含買進手續費；含息成本模式下已扣掉股利） */
  cost: number;
  date: ISODate;
  tradeId: string;
}

/** 持股以「券商帳戶＋股票代號」為單位 */
export interface PositionState {
  symbol: string;
  /** 券商（交割）帳戶；合併檢視時為 '*' */
  accountId: string;
  shares: number;
  /** 目前持股的投入成本（含買進手續費） */
  cost: number;
  /** FIFO 時才有多批，平均成本法只會有一批 */
  lots: Lot[];
  /** 一般買賣累計已實現淨損益 */
  realized: number;
  /** 實際領到的現金股利 */
  dividends: number;
  /** 其中已經扣進成本的部分（含息成本模式），算損益時不能再加一次 */
  dividendsInCost: number;
  /** 股利入帳時被扣的手續費（匯費），是額外的成本 */
  dividendFees: number;
  dayTrade: number;
  /** 歷來買進總成本，用於含息報酬率 */
  totalBought: number;
}

export interface RealizedEvent {
  date: ISODate;
  symbol: string;
  tradeId: string;
  kind: 'sell' | 'dayTrade' | 'dividend';
  amount: number;
}

export interface TradeProblem {
  tradeId: string;
  message: string;
}

function emptyPosition(symbol: string, accountId: string): PositionState {
  return { symbol, accountId, shares: 0, cost: 0, lots: [], realized: 0, dividends: 0, dividendsInCost: 0, dividendFees: 0, dayTrade: 0, totalBought: 0 };
}

export function positionKey(accountId: string, symbol: string): string {
  return `${accountId}|${symbol}`;
}

/** 「全部券商」檢視：把同一支股票在各券商的持股加總（批次依日期排列） */
export function mergePositions(list: PositionState[], symbol: string): PositionState {
  const m = emptyPosition(symbol, '*');
  for (const p of list) {
    m.shares += p.shares;
    m.cost += p.cost;
    m.lots.push(...p.lots);
    m.realized += p.realized;
    m.dividends += p.dividends;
    m.dividendsInCost += p.dividendsInCost;
    m.dividendFees += p.dividendFees;
    m.dayTrade += p.dayTrade;
    m.totalBought += p.totalBought;
  }
  m.lots.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return m;
}

export function toCostOptions(opts: CostMethod | CostOptions): CostOptions {
  return typeof opts === 'string' ? { method: opts, dividendReducesCost: false } : opts;
}

/**
 * 算淨損益時要另外加上的股利：還沒扣進成本的股利，再減掉入帳手續費。
 * （含息成本模式下，扣進成本的股利已經包含在未實現／已實現損益裡）
 */
export function looseDividends(p: PositionState): number {
  return p.dividends - p.dividendsInCost - p.dividendFees;
}

/**
 * 把買賣紀錄依序重播，算出每支股票的持股與損益。
 * 所有數字都由紀錄即時計算，刪除或修改紀錄後重算即可「校正回歸」。
 */
export class PortfolioReplayer {
  readonly positions = new Map<string, PositionState>();
  readonly events: RealizedEvent[] = [];
  readonly problems: TradeProblem[] = [];
  private readonly method: CostMethod;
  private readonly dividendReducesCost: boolean;

  constructor(opts: CostMethod | CostOptions) {
    const o = toCostOptions(opts);
    this.method = o.method;
    this.dividendReducesCost = o.dividendReducesCost;
  }

  /** 某家券商的某支股票 */
  get(symbol: string, accountId: string): PositionState {
    const key = positionKey(accountId, symbol);
    let p = this.positions.get(key);
    if (!p) {
      p = emptyPosition(symbol, accountId);
      this.positions.set(key, p);
    }
    return p;
  }

  /** 某支股票在各券商的持股 */
  positionsOf(symbol: string): PositionState[] {
    return [...this.positions.values()].filter((p) => p.symbol === symbol);
  }

  apply(t: Trade): void {
    // 賣出只會扣同一家券商的股票
    const p = this.get(t.symbol, t.accountId);
    switch (t.kind) {
      case 'buy': {
        const cost = tradeValue(t.shares, t.price) + t.fee;
        p.shares += t.shares;
        p.cost += cost;
        p.totalBought += cost;
        if (this.method === 'fifo' || p.lots.length === 0) {
          p.lots.push({ shares: t.shares, cost, date: t.tradeDate, tradeId: t.id });
        } else {
          p.lots[0].shares += t.shares;
          p.lots[0].cost += cost;
        }
        break;
      }
      case 'stockDividend': {
        // 配股：股數增加，成本不變
        p.shares += t.shares;
        if (this.method === 'fifo' || p.lots.length === 0) {
          p.lots.push({ shares: t.shares, cost: 0, date: t.tradeDate, tradeId: t.id });
        } else {
          p.lots[0].shares += t.shares;
        }
        break;
      }
      case 'sell': {
        if (t.shares > p.shares + 1e-9) {
          this.problems.push({
            tradeId: t.id,
            message: `${t.tradeDate} 賣出 ${t.symbol} ${t.shares} 股，但當時在這家券商只持有 ${p.shares} 股`,
          });
        }
        const costOut = this.consume(p, Math.min(t.shares, p.shares));
        const proceeds = tradeValue(t.shares, t.price) - t.fee - t.tax;
        const pnl = proceeds - costOut;
        p.shares = Math.max(0, p.shares - t.shares);
        p.cost = p.shares === 0 ? 0 : p.cost - costOut;
        p.realized += pnl;
        this.events.push({ date: t.tradeDate, symbol: t.symbol, tradeId: t.id, kind: 'sell', amount: pnl });
        break;
      }
      case 'dayTrade': {
        const pnl = dayTradePnL(t);
        p.dayTrade += pnl;
        this.events.push({ date: t.tradeDate, symbol: t.symbol, tradeId: t.id, kind: 'dayTrade', amount: pnl });
        break;
      }
      case 'cashDividend': {
        // 成本用股利全額扣（和券商一致）；入帳手續費另外記成成本
        const amt = t.amount ?? 0;
        p.dividends += amt;
        p.dividendFees += t.fee ?? 0;
        // 含息成本：依股數比例，從除息日當時持有的各批成本扣掉股利
        if (this.dividendReducesCost && p.shares > 1e-9 && amt !== 0) {
          for (const lot of p.lots) lot.cost -= (amt * lot.shares) / p.shares;
          p.cost -= amt;
          p.dividendsInCost += amt;
        }
        // 股利統計一律以實際入帳日記錄
        this.events.push({ date: t.tradeDate, symbol: t.symbol, tradeId: t.id, kind: 'dividend', amount: amt });
        break;
      }
    }
  }

  /** 從持股扣掉 n 股，回傳這些股票的成本 */
  private consume(p: PositionState, n: number): number {
    if (n <= 0) return 0;
    if (this.method === 'avg') {
      const lot = p.lots[0];
      if (!lot) return 0;
      const costOut = (lot.cost / lot.shares) * n;
      lot.shares -= n;
      lot.cost -= costOut;
      if (lot.shares <= 1e-9) p.lots.shift();
      return costOut;
    }
    let left = n;
    let costOut = 0;
    while (left > 1e-9 && p.lots.length > 0) {
      const lot = p.lots[0];
      const take = Math.min(left, lot.shares);
      const c = (lot.cost / lot.shares) * take;
      costOut += c;
      lot.shares -= take;
      lot.cost -= c;
      left -= take;
      if (lot.shares <= 1e-9) p.lots.shift();
    }
    return costOut;
  }
}

export function replayPortfolio(trades: Trade[], opts: CostMethod | CostOptions, upTo?: ISODate): PortfolioReplayer {
  const o = toCostOptions(opts);
  const r = new PortfolioReplayer(o);
  for (const t of sortForReplay(trades, o.dividendReducesCost)) {
    if (upTo && effectiveDate(t, o.dividendReducesCost) > upTo) break;
    r.apply(t);
  }
  return r;
}

/** 檢查一組買賣紀錄是否合理（不會賣出超過持有的股數） */
export function validateTrades(trades: Trade[]): TradeProblem[] {
  return replayPortfolio(trades, 'avg').problems;
}
