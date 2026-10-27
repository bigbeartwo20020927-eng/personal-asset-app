import { describe, expect, it } from 'vitest';
import { mergeCloses, missingRange, PriceSeries, type PriceYearDoc } from './prices';
import type { LedgerEvent } from './ledger';
import { netWorthAccountEvents, netWorthSeries } from './networth';
import { portfolioSeries } from './portfolio';
import { trade } from './testUtils';

describe('股價快取', () => {
  it('沒有任何資料 → 從需要的第一天查到今天', () => {
    expect(missingRange([], { from: '2025-11-03', to: '2026-10-08' })).toEqual({ from: '2025-11-03', to: '2026-10-08' });
  });

  it('合併後的查詢範圍只延伸到實際拿到資料的最後一天', () => {
    const docs = mergeCloses('2330', [], { from: '2025-12-30', to: '2026-01-05' }, [
      { date: '2025-12-30', close: 1000 },
      { date: '2025-12-31', close: 1010 },
      { date: '2026-01-02', close: 1020 },
    ]);
    const y25 = docs.find((d) => d.year === 2025)!;
    const y26 = docs.find((d) => d.year === 2026)!;
    expect(y25.coveredFrom).toBe('2025-12-30');
    expect(y25.coveredTo).toBe('2025-12-31');
    expect(y26.coveredFrom).toBe('2026-01-01');
    expect(y26.coveredTo).toBe('2026-01-02');
    // 1/3~1/5 還沒有資料（例如當天還沒公布）→ 下次從 1/3 開始補
    expect(missingRange(docs, { from: '2025-12-30', to: '2026-01-05' })).toEqual({ from: '2026-01-03', to: '2026-01-05' });
  });

  it('新增更早的買進紀錄 → 從更早的日期開始補', () => {
    const docs = mergeCloses('2330', [], { from: '2026-03-02', to: '2026-03-06' }, [{ date: '2026-03-06', close: 1 }]);
    expect(missingRange(docs, { from: '2026-01-05', to: '2026-03-06' })).toEqual({ from: '2026-01-05', to: '2026-03-06' });
    expect(missingRange(docs, { from: '2026-03-02', to: '2026-03-06' })).toBeNull();
  });

  it('找某天（含）之前最近一個收盤價（週末用週五的價格）', () => {
    const doc: PriceYearDoc = { id: 'x', symbol: '2330', year: 2026, closes: { '10-08': 2550, '10-07': 2585 }, coveredFrom: '2026-10-07', coveredTo: '2026-10-08', updatedAt: 0 };
    const s = new PriceSeries([doc]);
    expect(s.closeOn('2026-10-06')).toBeNull();
    expect(s.closeOn('2026-10-07')).toBe(2585);
    expect(s.closeOn('2026-10-11')).toBe(2550);
    expect(s.latest).toEqual({ date: '2026-10-08', close: 2550 });
  });
});

describe('淨資產曲線', () => {
  it('帳戶 + 股票市值 − 負債，從最早一筆的前一天 0 開始', () => {
    const prices = new PriceSeries([{ id: 'a', symbol: '2330', year: 2026, closes: { '03-02': 600, '03-03': 650 }, coveredFrom: '2026-03-01', coveredTo: '2026-03-03', updatedAt: 0 }]);
    const ctx = { priceOf: () => prices, brokerOf: () => ({ feeDiscount: 1, minFee: 0, minFeeOddLot: 0 }), isETF: () => false };
    const buy = trade({ kind: 'buy', symbol: '2330', shares: 1000, price: 600, tradeDate: '2026-03-02' });
    const ledger: LedgerEvent[] = [
      { date: '2026-03-01', accountId: 'bank', subId: null, amount: 1_000_000, source: 'initial', sourceId: 'bank' },
      // 帳本上的交割款在 T+2（3/4）才扣
      { date: buy.settleDate, accountId: 'bank', subId: null, amount: -600_000, source: 'trade', sourceId: buy.id },
    ];
    expect(buy.settleDate).toBe('2026-03-04');
    const pts = netWorthSeries({
      accountEvents: netWorthAccountEvents(ledger, [buy], new Set(['bank'])),
      debtEvents: [{ date: '2026-03-02', amount: 300_000 }],
      trades: [buy],
      method: 'avg',
      ctx,
      today: '2026-03-03',
      gran: '1D',
    });
    expect(pts.map((p) => [p.date, p.netWorth])).toEqual([
      ['2026-02-28', 0],
      ['2026-03-01', 1_000_000],
      // 成交日就把交割款視為已圈存，股票市值不會和現金重複計算
      ['2026-03-02', 1_000_000 - 600_000 + 600_000 - 300_000],
      ['2026-03-03', 1_000_000 - 600_000 + 650_000 - 300_000],
    ]);
  });
});

describe('投資曲線', () => {
  it('市值、投入成本、淨損益、已實現＋股利、當沖', () => {
    const prices = new PriceSeries([
      { id: 'a', symbol: '2330', year: 2026, closes: { '01-05': 500, '02-05': 600, '03-05': 700 }, coveredFrom: '2026-01-01', coveredTo: '2026-03-05', updatedAt: 0 },
    ]);
    const ctx = { priceOf: () => prices, brokerOf: () => ({ feeDiscount: 1, minFee: 0, minFeeOddLot: 0 }), isETF: () => false };
    const trades = [
      trade({ kind: 'buy', symbol: '2330', shares: 1000, price: 500, tradeDate: '2026-01-05' }),
      trade({ kind: 'buy', symbol: '2330', shares: 1000, price: 600, tradeDate: '2026-02-05' }),
      trade({ kind: 'sell', symbol: '2330', shares: 1000, price: 700, tradeDate: '2026-03-05' }),
      trade({ kind: 'cashDividend', symbol: '2330', amount: 5000, tradeDate: '2026-03-05' }),
    ];
    const pts = portfolioSeries(trades, 'avg', ctx, ['2026-01-04', '2026-02-05', '2026-03-05']);
    expect(pts[0].marketValue).toBe(0);
    expect(pts[1].marketValue).toBe(1_200_000);
    expect(pts[1].cost).toBe(1_100_000);
    const last = pts[2];
    expect(last.marketValue).toBe(700_000);
    expect(last.cost).toBe(550_000);
    expect(last.realizedPlusDiv).toBe(150_000 + 5000);
    // 淨未實現要扣預估賣出手續費 997 與證交稅 2,100
    expect(last.netPnL).toBe(700_000 - 997 - 2100 - 550_000 + 150_000 + 5000);
    expect(last.bySymbol['2330']).toBe(700_000);
  });
});
