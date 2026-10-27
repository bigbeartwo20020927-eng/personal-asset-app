import type { Trade, Transaction } from '../types';
import { settleDateOf } from './trades';

let seq = 0;

const meta = () => ({ version: 1, updatedAt: 0, deleted: false });

export function trade(p: Partial<Trade> & Pick<Trade, 'kind' | 'symbol' | 'tradeDate'>): Trade {
  seq++;
  return {
    id: p.id ?? `t${seq}`,
    ...meta(),
    shares: 0,
    price: 0,
    sellPrice: null,
    fee: 0,
    sellFee: 0,
    tax: 0,
    settleDate: settleDateOf(p.tradeDate),
    accountId: 'bank',
    subAccountId: null,
    amount: null,
    createdAt: seq,
    note: '',
    ...p,
  };
}

export function tx(p: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'date'>): Transaction {
  seq++;
  return {
    id: p.id ?? `x${seq}`,
    ...meta(),
    accountId: 'bank',
    subAccountId: null,
    toAccountId: null,
    toSubAccountId: null,
    debtId: null,
    toAmount: null,
    categoryId: null,
    tags: [],
    note: '',
    ...p,
  };
}
