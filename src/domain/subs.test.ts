import { describe, expect, it } from 'vitest';
import type { Account, Allocation } from '../types';
import { balanceAt, buildLedger } from './ledger';
import { dropDeadSubs } from './subs';
import { tx } from './testUtils';

const meta = { version: 1, updatedAt: 0, deleted: false };
const bank = { id: 'bank', initialBalance: 1000, initialDate: '2026-01-01' } as Account;
const alloc = (p: Pick<Allocation, 'id' | 'fromSubId' | 'toSubId' | 'amount' | 'date'>): Allocation => ({ ...meta, accountId: 'bank', note: '', ...p });

describe('dropDeadSubs', () => {
  const transactions = [
    tx({ type: 'expense', amount: 100, date: '2026-01-10', subAccountId: 'gone' }),
    tx({ type: 'expense', amount: 50, date: '2026-01-11', subAccountId: 'alive' }),
  ];
  const allocations = [
    alloc({ id: 'a1', fromSubId: null, toSubId: 'gone', amount: 300, date: '2026-01-05' }),
    alloc({ id: 'a2', fromSubId: null, toSubId: 'alive', amount: 200, date: '2026-01-05' }),
    // 舊版刪除子帳戶時自動產生的「劃回未分配」
    alloc({ id: 'a3', fromSubId: 'gone', toSubId: null, amount: 200, date: '2026-02-01' }),
  ];

  it('已刪除子帳戶的紀錄全部算在未分配，各部分加起來等於帳戶總額', () => {
    const out = dropDeadSubs({ transactions, trades: [], allocations }, new Set(['alive']));
    const ledger = buildLedger({ accounts: [bank], ...out });
    const total = balanceAt(ledger, 'bank', '9999-12-31');
    const unallocated = balanceAt(ledger, 'bank', '9999-12-31', null);
    const alive = balanceAt(ledger, 'bank', '9999-12-31', 'alive');
    expect(total).toBe(850);
    expect(alive).toBe(150);
    expect(unallocated).toBe(700);
    expect(unallocated + alive).toBe(total);
    expect(ledger.some((e) => e.subId === 'gone')).toBe(false);
  });

  it('變成「未分配 → 未分配」的劃撥不再顯示', () => {
    const out = dropDeadSubs({ transactions, trades: [], allocations }, new Set(['alive']));
    expect(out.allocations.map((a) => a.id)).toEqual(['a2']);
  });

  it('子帳戶都還在時，不產生新的物件', () => {
    const out = dropDeadSubs({ transactions, trades: [], allocations }, new Set(['alive', 'gone']));
    expect(out.transactions[0]).toBe(transactions[0]);
    expect(out.allocations).toHaveLength(3);
  });
});
