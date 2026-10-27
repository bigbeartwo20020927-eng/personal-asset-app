import { describe, expect, it } from 'vitest';
import { mergePositions, replayPortfolio, validateTrades } from './holdings';
import { valueLot, valuePosition } from './valuation';
import { trade } from './testUtils';

/** 使用者實際的 2330 庫存，與永豐 APP 畫面比對（手續費用全額、2026/9/16 除息每股 7 元） */
const fullFee = { feeDiscount: 1, minFee: 20, minFeeOddLot: 1 };
const close = 2550;
const today = '2026-10-10';

function trades2330() {
  return [
    trade({ kind: 'buy', symbol: '2330', shares: 1, price: 2385, fee: 3, tradeDate: '2026-08-03' }),
    trade({ kind: 'buy', symbol: '2330', shares: 1, price: 2385, fee: 3, tradeDate: '2026-08-03' }),
    trade({ kind: 'buy', symbol: '2330', shares: 1, price: 2375, fee: 3, tradeDate: '2026-08-03' }),
    trade({ kind: 'buy', symbol: '2330', shares: 1, price: 2365, fee: 3, tradeDate: '2026-08-25' }),
    trade({ kind: 'buy', symbol: '2330', shares: 2, price: 2375, fee: 6, tradeDate: '2026-08-25' }),
    // 10/08 入帳 42 元（除息前持有 6 股 × 7），同一天又買了 1 股 → 這股領不到股利
    trade({ kind: 'cashDividend', symbol: '2330', amount: 42, exDate: '2026-09-16', tradeDate: '2026-10-08' }),
    trade({ kind: 'buy', symbol: '2330', shares: 1, price: 2565, fee: 3, tradeDate: '2026-10-08' }),
  ];
}

describe('和永豐 APP 對齊（先進先出＋含息成本＋逐筆估算）', () => {
  const p = replayPortfolio(trades2330(), { method: 'fifo', dividendReducesCost: true }).get('2330', 'bank');
  const v = valuePosition(p, close, fullFee, false, today, true);

  it('付出成本 16,804、成本均價 2,400.57', () => {
    expect(p.shares).toBe(7);
    expect(Math.round(p.cost)).toBe(16_804);
    expect(v.avgPrice.toFixed(2)).toBe('2400.57');
  });

  it('逐筆明細：成本單價與現值／損益和永豐一樣', () => {
    const rows = p.lots.map((l) => valueLot(l, close, fullFee, false, '2330', today));
    expect(rows.map((r) => [Math.round(r.netValue), Math.round(r.pnl)])).toEqual([
      [2540, 159],
      [2540, 159],
      [2540, 169],
      [2540, 179],
      [5078, 336],
      [2540, -28],
    ]);
  });

  it('預估損益 974、報酬率 5.80%', () => {
    expect(Math.round(v.netUnrealized)).toBe(974);
    expect((v.returnPct * 100).toFixed(2)).toBe('5.80');
  });

  it('股利仍然照實記錄，但不會在總損益裡重複計算', () => {
    expect(p.dividends).toBe(42);
    expect(p.dividendsInCost).toBe(42);
  });
});

describe('持股依券商分開', () => {
  const list = [
    trade({ kind: 'buy', symbol: '2330', shares: 3, price: 1000, tradeDate: '2026-01-05', accountId: 'sinopac' }),
    trade({ kind: 'buy', symbol: '2330', shares: 2, price: 1200, tradeDate: '2026-02-05', accountId: 'yuanta' }),
    trade({ kind: 'sell', symbol: '2330', shares: 2, price: 1500, tradeDate: '2026-03-05', accountId: 'yuanta' }),
  ];

  it('在元大賣出只扣元大的批次（不會先進先出扣到永豐較早買的）', () => {
    const r = replayPortfolio(list, 'fifo');
    expect(r.get('2330', 'sinopac').shares).toBe(3);
    expect(r.get('2330', 'sinopac').cost).toBe(3000);
    expect(r.get('2330', 'yuanta').shares).toBe(0);
    expect(r.get('2330', 'yuanta').realized).toBe(2 * 1500 - 2 * 1200);
  });

  it('在元大賣超過元大持有的股數會被擋下（即使永豐還有股票）', () => {
    const tooMany = [...list.slice(0, 2), trade({ kind: 'sell', symbol: '2330', shares: 3, price: 1500, tradeDate: '2026-03-05', accountId: 'yuanta' })];
    expect(validateTrades(tooMany)).toHaveLength(1);
  });

  it('「全部」檢視 = 各券商加總', () => {
    const r = replayPortfolio(list.slice(0, 2), 'fifo');
    const all = mergePositions(r.positionsOf('2330'), '2330');
    expect(all.shares).toBe(5);
    expect(all.cost).toBe(3000 + 2400);
    expect(all.lots.map((l) => l.date)).toEqual(['2026-01-05', '2026-02-05']);
  });
});

describe('含息成本開關', () => {
  it('關閉時：成本不扣股利，和原本的算法一樣', () => {
    const p = replayPortfolio(trades2330(), { method: 'fifo', dividendReducesCost: false }).get('2330', 'bank');
    expect(Math.round(p.cost)).toBe(16_804 + 42);
    expect(p.dividendsInCost).toBe(0);
  });

  it('切換開關，總損益（未實現＋股利）不變', () => {
    const on = replayPortfolio(trades2330(), { method: 'fifo', dividendReducesCost: true }).get('2330', 'bank');
    const off = replayPortfolio(trades2330(), { method: 'fifo', dividendReducesCost: false }).get('2330', 'bank');
    const total = (pp: typeof on) => {
      const vv = valuePosition(pp, close, fullFee, false, today, true);
      return vv.netUnrealized + pp.realized + (pp.dividends - pp.dividendsInCost);
    };
    expect(Math.round(total(on))).toBe(Math.round(total(off)));
  });

  it('平均成本法：總成本扣掉股利，均價跟著變低', () => {
    const p = replayPortfolio(trades2330(), { method: 'avg', dividendReducesCost: true }).get('2330', 'bank');
    expect(Math.round(p.cost)).toBe(16_804);
    expect((p.cost / p.shares).toFixed(2)).toBe('2400.57');
  });

  it('沒有除息日的舊紀錄 → 用入帳日代替（同一天買的那股會被算進去）', () => {
    const list = trades2330().map((t) => (t.kind === 'cashDividend' ? { ...t, exDate: null } : t));
    const p = replayPortfolio(list, { method: 'fifo', dividendReducesCost: true }).get('2330', 'bank');
    // 入帳日 10/08 當天才買的那股排在股利之後，所以仍只有前 6 股分攤
    expect(Math.round(p.cost)).toBe(16_804);
  });

  it('除息後才賣出：已實現損益包含股利', () => {
    const list = [
      trade({ kind: 'buy', symbol: '2330', shares: 1, price: 1000, tradeDate: '2026-08-03' }),
      trade({ kind: 'cashDividend', symbol: '2330', amount: 7, exDate: '2026-09-16', tradeDate: '2026-10-08' }),
      trade({ kind: 'sell', symbol: '2330', shares: 1, price: 1000, tradeDate: '2026-09-20' }),
    ];
    const p = replayPortfolio(list, { method: 'fifo', dividendReducesCost: true }).get('2330', 'bank');
    expect(p.realized).toBe(7);
    expect(p.dividends - p.dividendsInCost).toBe(0);
  });
});
