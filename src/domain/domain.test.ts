import { describe, expect, it } from 'vitest';
import { addBusinessDays } from './dates';
import { brokerFee, tradeValue, transactionTax } from './fees';
import { looseDividends, replayPortfolio, validateTrades } from './holdings';
import { tradeCashFlow } from './trades';
import { valuePosition } from './valuation';
import { settledRows, settlementSummary } from './settlement';
import { cumulativeSeries, sampleDates } from './series';
import { balanceAt, buildLedger, debtEvents, minSubBalances } from './ledger';
import { monthTotals, spentByCategory } from './budget';
import { xirr } from './xirr';
import { trade, tx } from './testUtils';
import type { Account, Allocation, Category } from '../types';

const broker = { feeDiscount: 1, minFee: 20, minFeeOddLot: 1 };

describe('T+2', () => {
  it('週四成交 → 下週一交割（跳過週六日）', () => {
    expect(addBusinessDays('2026-10-08', 2)).toBe('2026-10-12');
  });
  it('週五成交 → 下週二交割', () => {
    expect(addBusinessDays('2026-10-09', 2)).toBe('2026-10-13');
  });
  it('週一成交 → 週三交割', () => {
    expect(addBusinessDays('2026-10-12', 2)).toBe('2026-10-14');
  });
});

describe('手續費與證交稅', () => {
  it('0.1425% 無條件捨去', () => {
    // 600 × 1000 × 0.001425 = 855
    expect(brokerFee(600_000, 1000, broker)).toBe(855);
    // 2.8 折：855 × 0.28 = 239.4 → 239
    expect(brokerFee(600_000, 1000, { ...broker, feeDiscount: 0.28 })).toBe(239);
  });
  it('整股最低 20、零股最低 1', () => {
    expect(brokerFee(5_000, 1000, broker)).toBe(20);
    expect(brokerFee(500, 1, broker)).toBe(1);
  });
  it('證交稅：股票 0.3%、ETF 0.1%、當沖 0.15%', () => {
    expect(transactionTax(700_000, false)).toBe(2100);
    expect(transactionTax(700_000, true)).toBe(700);
    expect(transactionTax(700_000, false, true)).toBe(1050);
    expect(transactionTax(700_000, true, true)).toBe(700);
  });
  it('債券 ETF 停徵期間證交稅為 0，之後恢復 0.1%', () => {
    expect(transactionTax(700_000, true, false, '00679B', '2026-12-31')).toBe(0);
    expect(transactionTax(700_000, true, false, '00679B', '2027-01-04')).toBe(700);
    expect(transactionTax(700_000, true, false, '0050', '2026-10-08')).toBe(700);
  });
});

describe('成交價金捨去到元（零股半塊錢）', () => {
  it('5 股 × 174.5 = 872.5 → 價金 872，交割金額 869（和永豐一致）', () => {
    expect(tradeValue(5, 174.5)).toBe(872);
    const sell = trade({ kind: 'sell', symbol: '5483', shares: 5, price: 174.5, fee: 1, tax: 2, tradeDate: '2026-08-21' });
    expect(tradeCashFlow(sell)).toBe(869);
    expect(brokerFee(tradeValue(5, 174.5), 5, broker)).toBe(1);
    expect(transactionTax(tradeValue(5, 174.5), false)).toBe(2);
  });
  it('8/21 那天的交割淨額：877 + 872 + 869 − 941 − 961 = 716', () => {
    const list = [
      trade({ kind: 'sell', symbol: '5483', shares: 5, price: 176, fee: 1, tax: 2, tradeDate: '2026-08-21' }),
      trade({ kind: 'sell', symbol: '5483', shares: 5, price: 175, fee: 1, tax: 2, tradeDate: '2026-08-21' }),
      trade({ kind: 'sell', symbol: '5483', shares: 5, price: 174.5, fee: 1, tax: 2, tradeDate: '2026-08-21' }),
      trade({ kind: 'buy', symbol: '6488', shares: 1, price: 940, fee: 1, tradeDate: '2026-08-21' }),
      trade({ kind: 'buy', symbol: '6488', shares: 1, price: 960, fee: 1, tradeDate: '2026-08-21' }),
    ];
    expect(list.reduce((s, t) => s + tradeCashFlow(t), 0)).toBe(716);
  });
  it('整數價金不受影響', () => {
    expect(tradeValue(1000, 600)).toBe(600_000);
    expect(tradeValue(3, 0.1 + 0.2)).toBe(0);
  });
});

describe('成本計算（500 / 600 買、700 賣，忽略費用）', () => {
  const trades = [
    trade({ kind: 'buy', symbol: '2330', shares: 1000, price: 500, tradeDate: '2026-01-05' }),
    trade({ kind: 'buy', symbol: '2330', shares: 1000, price: 600, tradeDate: '2026-02-05' }),
    trade({ kind: 'sell', symbol: '2330', shares: 1000, price: 700, tradeDate: '2026-03-05' }),
  ];
  it('平均成本法：已實現 +150,000，剩餘成本 550', () => {
    const p = replayPortfolio(trades, 'avg').get('2330', 'bank');
    expect(p.realized).toBe(150_000);
    expect(p.cost / p.shares).toBe(550);
  });
  it('先進先出：已實現 +200,000，剩餘成本 600', () => {
    const p = replayPortfolio(trades, 'fifo').get('2330', 'bank');
    expect(p.realized).toBe(200_000);
    expect(p.cost / p.shares).toBe(600);
  });
  it('兩種方法的總損益相同', () => {
    for (const m of ['avg', 'fifo'] as const) {
      const p = replayPortfolio(trades, m).get('2330', 'bank');
      const unreal = p.shares * 700 - p.cost;
      expect(p.realized + unreal).toBe(300_000);
    }
  });
  it('平均成本法加碼：700 再買一張 → 均價 625', () => {
    const more = [...trades, trade({ kind: 'buy', symbol: '2330', shares: 1000, price: 700, tradeDate: '2026-04-01' })];
    const p = replayPortfolio(more, 'avg').get('2330', 'bank');
    expect(p.cost / p.shares).toBe(625);
    const f = replayPortfolio(more, 'fifo').get('2330', 'bank');
    expect(f.lots.map((l) => l.cost / l.shares)).toEqual([600, 700]);
  });
});

describe('淨未實現損益', () => {
  it('扣掉買進手續費、預估賣出手續費與證交稅', () => {
    const trades = [trade({ kind: 'buy', symbol: '2330', shares: 1000, price: 600, fee: 855, tradeDate: '2026-01-05' })];
    const p = replayPortfolio(trades, 'avg').get('2330', 'bank');
    const v = valuePosition(p, 700, broker, false);
    // 市值 700,000 − 賣出手續費 997 − 證交稅 2,100 − 成本 600,855
    expect(v.netUnrealized).toBe(700_000 - 997 - 2100 - 600_855);
  });
});

describe('當沖與股利', () => {
  it('當沖不影響持股，損益獨立計算', () => {
    const r = replayPortfolio(
      [trade({ kind: 'dayTrade', symbol: '2330', shares: 1000, price: 600, sellPrice: 610, fee: 855, sellFee: 869, tax: 915, tradeDate: '2026-01-05' })],
      'avg',
    );
    const p = r.get('2330', 'bank');
    expect(p.shares).toBe(0);
    expect(p.dayTrade).toBe(610_000 - 869 - 915 - 600_000 - 855);
    expect(p.realized).toBe(0);
  });
  it('配股增加股數、成本不變', () => {
    const r = replayPortfolio(
      [
        trade({ kind: 'buy', symbol: '2884', shares: 1000, price: 30, tradeDate: '2026-01-05' }),
        trade({ kind: 'stockDividend', symbol: '2884', shares: 50, tradeDate: '2026-07-01' }),
      ],
      'avg',
    );
    expect(r.get('2884', 'bank').shares).toBe(1050);
    expect(r.get('2884', 'bank').cost).toBe(30_000);
  });
});

describe('刪除＝校正回歸、刪除防呆', () => {
  it('刪掉被後續賣出用掉的買進 → 偵測到問題', () => {
    const buy = trade({ kind: 'buy', symbol: '2330', shares: 1000, price: 500, tradeDate: '2026-01-05' });
    const sell = trade({ kind: 'sell', symbol: '2330', shares: 1000, price: 700, tradeDate: '2026-03-05' });
    expect(validateTrades([buy, sell])).toEqual([]);
    const problems = validateTrades([sell]);
    expect(problems).toHaveLength(1);
    expect(problems[0].tradeId).toBe(sell.id);
  });
  it('刪掉一筆支出，餘額回到建立前', () => {
    const acc = account('bank', 10_000);
    const lunch = tx({ type: 'expense', amount: 120, date: '2026-05-01' });
    const before = balanceAt(buildLedger({ accounts: [acc], transactions: [], allocations: [], trades: [] }), 'bank', '2026-12-31');
    const withTx = balanceAt(buildLedger({ accounts: [acc], transactions: [lunch], allocations: [], trades: [] }), 'bank', '2026-12-31');
    expect(withTx).toBe(before - 120);
    // 「刪除」就是重算時不包含那筆紀錄
    expect(balanceAt(buildLedger({ accounts: [acc], transactions: [], allocations: [], trades: [] }), 'bank', '2026-12-31')).toBe(before);
  });
  it('刪掉劃撥會讓子帳戶變負數 → 偵測到', () => {
    const acc = account('bank', 10_000);
    const alloc: Allocation = { id: 'al1', version: 1, updatedAt: 0, deleted: false, accountId: 'bank', fromSubId: null, toSubId: 'trip', amount: 3000, date: '2026-05-01', note: '' };
    const spend = tx({ type: 'expense', amount: 2000, date: '2026-06-01', subAccountId: 'trip' });
    const ok = minSubBalances(buildLedger({ accounts: [acc], transactions: [spend], allocations: [alloc], trades: [] }));
    expect(ok.get('trip')).toBe(0);
    const bad = minSubBalances(buildLedger({ accounts: [acc], transactions: [spend], allocations: [], trades: [] }));
    expect(bad.get('trip')).toBe(-2000);
  });
});

describe('負債', () => {
  it('還款只扣本金部分，刪除還款後餘額回復', () => {
    const debt = { id: 'd1', version: 1, updatedAt: 0, deleted: false, name: '房貸', principal: 1_000_000, rate: 0.02, monthlyPayment: 30_000, initialBalance: 800_000, startDate: '2026-01-01' };
    const pay = tx({ type: 'debtPayment', amount: 30_000, interest: 8_000, debtId: 'd1', date: '2026-02-01' });
    const sum = (ev: { amount: number }[]) => ev.reduce((s, e) => s + e.amount, 0);
    expect(sum(debtEvents(debt, [pay]))).toBe(800_000 - 22_000);
    expect(sum(debtEvents(debt, []))).toBe(800_000);
    // 帳戶扣的是整筆還款
    const acc = account('bank', 100_000);
    expect(balanceAt(buildLedger({ accounts: [acc], transactions: [pay], allocations: [], trades: [] }), 'bank', '2026-12-31')).toBe(70_000);
  });
});

describe('轉帳手續費', () => {
  it('由轉出帳戶負擔，轉入帳戶收到原金額，並算進當月支出', () => {
    const bank = account('bank', 10_000);
    const cash = account('cash', 0);
    const t = tx({ type: 'transfer', amount: 1000, fee: 15, toAccountId: 'cash', date: '2026-10-05' });
    const ledger = buildLedger({ accounts: [bank, cash], transactions: [t], allocations: [], trades: [] });
    expect(balanceAt(ledger, 'bank', '2026-12-31')).toBe(10_000 - 1015);
    expect(balanceAt(ledger, 'cash', '2026-12-31')).toBe(1000);
    expect(monthTotals([t], '2026-10')).toEqual({ income: 0, expense: 15 });
  });
});

describe('現金股利入帳手續費', () => {
  it('帳戶收到股利 − 手續費；成本用股利全額扣；淨損益扣掉手續費', () => {
    const buy = trade({ kind: 'buy', symbol: '2330', shares: 6, price: 1000, tradeDate: '2026-08-03' });
    const div = trade({ kind: 'cashDividend', symbol: '2330', amount: 42, fee: 10, exDate: '2026-09-16', tradeDate: '2026-10-08' });
    expect(tradeCashFlow(div)).toBe(32);
    const on = replayPortfolio([buy, div], { method: 'fifo', dividendReducesCost: true }).get('2330', 'bank');
    expect(on.cost).toBe(6000 - 42);
    expect(on.dividends).toBe(42);
    // 含息成本開或關，淨損益（成本差＋股利淨額）都一樣
    const off = replayPortfolio([buy, div], { method: 'fifo', dividendReducesCost: false }).get('2330', 'bank');
    expect(-on.cost + looseDividends(on)).toBe(-off.cost + looseDividends(off));
    expect(looseDividends(off)).toBe(32);
  });
});

describe('帳戶紀錄裡的交割與股利', () => {
  const today = '2026-10-14';
  const list = [
    // 10/09（五）成交 → 10/13 交割，同一天買賣合併
    trade({ kind: 'buy', symbol: '2330', shares: 1000, price: 50, tradeDate: '2026-10-09' }),
    trade({ kind: 'sell', symbol: '0050', shares: 1000, price: 15, tradeDate: '2026-10-09' }),
    // 10/13 成交 → 10/15 交割，還沒到 → 不顯示
    trade({ kind: 'buy', symbol: '2317', shares: 1000, price: 80, tradeDate: '2026-10-13' }),
    trade({ kind: 'cashDividend', symbol: '2330', amount: 42, fee: 10, tradeDate: '2026-10-08' }),
    // 別家券商、子帳戶
    trade({ kind: 'buy', symbol: '2330', shares: 1, price: 100, tradeDate: '2026-10-01', accountId: 'other' }),
    trade({ kind: 'buy', symbol: '2330', shares: 1, price: 200, tradeDate: '2026-10-01', subAccountId: 'invest' }),
  ];

  it('依交割日合併、未交割的不出現、股利顯示實際入帳', () => {
    const rows = settledRows(list, 'bank', today);
    expect(rows.map((r) => [r.kind, r.date, r.net])).toEqual([
      ['settlement', '2026-10-13', -50_000 + 15_000],
      ['dividend', '2026-10-08', 32],
      ['settlement', '2026-10-05', -200],
    ]);
  });

  it('子帳戶只看到從自己交割的', () => {
    expect(settledRows(list, 'bank', today, 'invest').map((r) => r.net)).toEqual([-200]);
    expect(settledRows(list, 'other', today).map((r) => r.net)).toEqual([-100]);
  });
});

describe('交割行事曆', () => {
  it('同一天應付應收抵銷，可用餘額考慮每一天', () => {
    const today = '2026-10-08'; // 週四
    const trades = [
      // 10/9（五）成交 → 10/13 交割
      trade({ kind: 'buy', symbol: '2330', shares: 1000, price: 50, tradeDate: '2026-10-09' }),
      trade({ kind: 'sell', symbol: '0050', shares: 1000, price: 15, tradeDate: '2026-10-09' }),
      // 10/12（一）成交 → 10/14 交割
      trade({ kind: 'buy', symbol: '2317', shares: 1000, price: 80, tradeDate: '2026-10-12' }),
    ];
    const s = settlementSummary(trades, 100_000, today);
    expect(s.days.map((d) => [d.date, d.payable, d.receivable, d.net, d.balanceAfter])).toEqual([
      ['2026-10-13', -50_000, 15_000, -35_000, 65_000],
      ['2026-10-14', -80_000, 0, -80_000, -15_000],
    ]);
    expect(s.days[1].insufficient).toBe(true);
    expect(s.pending).toBe(-115_000);
    expect(s.available).toBe(-15_000);
  });
  it('已過交割日的不算待交割', () => {
    const t = trade({ kind: 'buy', symbol: '2330', shares: 1000, price: 50, tradeDate: '2026-10-01' });
    expect(settlementSummary([t], 100_000, '2026-10-08').days).toEqual([]);
  });
});

describe('曲線', () => {
  it('從第一筆資料前一天的 0 開始', () => {
    const s = cumulativeSeries([{ date: '2026-10-05', amount: 100 }], '2026-10-07', '1D');
    expect(s).toEqual([
      { date: '2026-10-04', value: 0 },
      { date: '2026-10-05', value: 100 },
      { date: '2026-10-06', value: 100 },
      { date: '2026-10-07', value: 100 },
    ]);
  });
  it('1M / 3M / 1Y 取期末，最後一點是今天', () => {
    expect(sampleDates('2026-01-15', '2026-04-10', '1M')).toEqual(['2026-01-14', '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-10']);
    expect(sampleDates('2026-01-15', '2026-08-10', '3M')).toEqual(['2026-01-14', '2026-03-31', '2026-06-30', '2026-08-10']);
    expect(sampleDates('2024-05-01', '2026-02-01', '1Y')).toEqual(['2024-04-30', '2024-12-31', '2025-12-31', '2026-02-01']);
  });
  it('修改過去的交易，曲線從那天開始修正', () => {
    const a = cumulativeSeries([{ date: '2026-10-01', amount: 1000 }, { date: '2026-10-03', amount: -500 }], '2026-10-05', '1D');
    const b = cumulativeSeries([{ date: '2026-10-01', amount: 1000 }, { date: '2026-10-03', amount: -300 }], '2026-10-05', '1D');
    expect(a.slice(0, 3)).toEqual(b.slice(0, 3));
    expect(a[3].value).toBe(500);
    expect(b[3].value).toBe(700);
  });
});

describe('預算', () => {
  it('小類支出同時計入大類，換月自動歸零', () => {
    const cats: Category[] = [
      cat('food', null),
      cat('drink', 'food'),
      cat('lunch', 'food'),
    ];
    const txs = [
      tx({ type: 'expense', amount: 60, date: '2026-10-02', categoryId: 'drink' }),
      tx({ type: 'expense', amount: 120, date: '2026-10-03', categoryId: 'lunch' }),
      tx({ type: 'expense', amount: 999, date: '2026-09-30', categoryId: 'lunch' }),
    ];
    const oct = spentByCategory(txs, cats, '2026-10');
    expect(oct.get('drink')).toBe(60);
    expect(oct.get('food')).toBe(180);
    expect(spentByCategory(txs, cats, '2026-11').size).toBe(0);
  });
});

describe('XIRR', () => {
  it('一年後 +10% → 約 10%', () => {
    const r = xirr([
      { date: '2025-01-01', amount: -100_000 },
      { date: '2026-01-01', amount: 110_000 },
    ]);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(0.1, 4);
  });
  it('資料不足回傳 null', () => {
    expect(xirr([{ date: '2025-01-01', amount: -100 }])).toBeNull();
  });
});

function account(id: string, initial: number): Account {
  return {
    id, version: 1, updatedAt: 0, deleted: false, name: id, type: 'bank', currency: 'TWD',
    initialBalance: initial, initialDate: '2026-01-01', isBroker: true, feeDiscount: 1, minFee: 20,
    minFeeOddLot: 1, settleSubAccountId: null, archived: false, order: 0,
  };
}

function cat(id: string, parentId: string | null): Category {
  return { id, version: 1, updatedAt: 0, deleted: false, name: id, kind: 'expense', parentId, order: 0 };
}
