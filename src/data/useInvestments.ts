import { useMemo } from 'react';
import { today as todayFn } from '../domain/dates';
import type { BrokerFee } from '../domain/fees';
import { looseDividends, mergePositions, replayPortfolio, type PositionState } from '../domain/holdings';
import { portfolioCashFlows, type MarketContext } from '../domain/portfolio';
import { sortTrades } from '../domain/trades';
import { valuePosition, type Valuation } from '../domain/valuation';
import { xirr } from '../domain/xirr';
import { useCol } from '../hooks';
import { isETFOf, usePrices, useSymbols } from '../market/useMarket';
import type { Account, CostMethod, CostOptions, Trade } from '../types';

const DEFAULT_BROKER: BrokerFee = { feeDiscount: 1, minFee: 20, minFeeOddLot: 1 };

/** 一列持股 = 某家券商的某支股票 */
export interface HoldingRow {
  symbol: string;
  name: string;
  accountId: string;
  brokerName: string;
  position: PositionState;
  close: number | null;
  closeDate: string | null;
  valuation: Valuation;
  xirr: number | null;
}

export function brokerOfAccount(a: Account | undefined): BrokerFee {
  return a ? { feeDiscount: a.feeDiscount, minFee: a.minFee, minFeeOddLot: a.minFeeOddLot } : DEFAULT_BROKER;
}

/** 「全部券商」檢視：把同一支股票各券商的估值加總（各券商的賣出成本用各自的費率估算） */
export function combineRows(rows: HoldingRow[], symbol: string): { position: PositionState; valuation: Valuation } {
  const position = mergePositions(rows.map((r) => r.position), symbol);
  let marketValue = 0;
  let estSellFee = 0;
  let estTax = 0;
  let netUnrealized = 0;
  for (const r of rows) {
    marketValue += r.valuation.marketValue;
    estSellFee += r.valuation.estSellFee;
    estTax += r.valuation.estTax;
    netUnrealized += r.valuation.netUnrealized;
  }
  const p = position;
  return {
    position,
    valuation: {
      marketValue,
      estSellFee,
      estTax,
      netUnrealized,
      returnPct: p.cost > 0 ? netUnrealized / p.cost : 0,
      totalReturnPct: p.totalBought > 0 ? (netUnrealized + p.realized + looseDividends(p)) / p.totalBought : 0,
      avgPrice: p.shares > 0 ? p.cost / p.shares : 0,
    },
  };
}

export function useInvestments() {
  const trades = useCol('trades');
  const accounts = useCol('accounts');
  const settings = useCol('settings');
  const prices = usePrices();
  const symbols = useSymbols();
  const main = settings.find((s) => s.id === 'main');
  const method: CostMethod = main?.costMethod ?? 'avg';
  const dividendReducesCost = main?.dividendReducesCost ?? false;
  const costOpts: CostOptions = useMemo(() => ({ method, dividendReducesCost }), [method, dividendReducesCost]);
  const t = todayFn();

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const ctx: MarketContext = useMemo(
    () => ({
      priceOf: (s) => prices.get(s),
      // 持股依券商分開，所以直接用該券商的手續費設定
      brokerOf: (accountId) => brokerOfAccount(accountById.get(accountId)),
      isETF: (s) => isETFOf(symbols, s),
    }),
    [prices, symbols, accountById],
  );

  const replay = useMemo(() => replayPortfolio(trades, costOpts), [trades, costOpts]);

  const holdings: HoldingRow[] = useMemo(() => {
    const rows: HoldingRow[] = [];
    const newestFirst = sortTrades(trades).reverse();
    for (const p of replay.positions.values()) {
      const series = prices.get(p.symbol);
      const latest = series?.latest ?? null;
      // 還沒抓到股價時，先用最後一次成交價
      const lastTradePrice = newestFirst.find((x) => x.symbol === p.symbol && (x.kind === 'buy' || x.kind === 'sell'))?.price ?? null;
      const close = latest?.close ?? lastTradePrice;
      // 先進先出：逐筆估算賣出手續費與證交稅（和券商逐筆顯示一致）
      const valuation = valuePosition(p, close, ctx.brokerOf(p.accountId), ctx.isETF(p.symbol), t, method === 'fifo');
      const terminal = p.shares > 0 ? valuation.marketValue - valuation.estSellFee - valuation.estTax : 0;
      rows.push({
        symbol: p.symbol,
        name: symbols.get(p.symbol)?.name ?? '',
        accountId: p.accountId,
        brokerName: accountById.get(p.accountId)?.name ?? '（已刪除的帳戶）',
        position: p,
        close,
        closeDate: latest?.date ?? null,
        valuation,
        xirr: xirr(portfolioCashFlows(trades, terminal, t, p.symbol, p.accountId)),
      });
    }
    return rows.sort((a, b) => b.valuation.marketValue - a.valuation.marketValue || a.symbol.localeCompare(b.symbol));
  }, [replay, prices, symbols, ctx, trades, t, method, accountById]);

  const totals = useMemo(() => {
    let marketValue = 0;
    let cost = 0;
    let netUnrealized = 0;
    let realized = 0;
    let dividends = 0;
    let dayTrade = 0;
    let terminal = 0;
    for (const h of holdings) {
      marketValue += h.valuation.marketValue;
      cost += h.position.shares > 0 ? h.position.cost : 0;
      netUnrealized += h.valuation.netUnrealized;
      realized += h.position.realized;
      dividends += h.position.dividends;
      dayTrade += h.position.dayTrade;
      if (h.position.shares > 0) terminal += h.valuation.marketValue - h.valuation.estSellFee - h.valuation.estTax;
    }
    return {
      marketValue,
      cost,
      netUnrealized,
      returnPct: cost > 0 ? netUnrealized / cost : 0,
      realized,
      dividends,
      dayTrade,
      xirr: xirr(portfolioCashFlows(trades, terminal, t)),
    };
  }, [holdings, trades, t]);

  return { trades, accounts, accountById, method, costOpts, prices, symbols, ctx, replay, holdings, totals, today: t };
}

export type InvestmentsData = ReturnType<typeof useInvestments>;

export function tradeTitle(t: Trade): string {
  switch (t.kind) {
    case 'buy':
      return '買進';
    case 'sell':
      return '賣出';
    case 'dayTrade':
      return '當沖';
    case 'cashDividend':
      return '現金股利';
    case 'stockDividend':
      return '股票股利';
  }
}
