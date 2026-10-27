import type { Category, Transaction } from '../types';
import { monthOf } from './dates';

/** 某個月各分類的支出；小類的支出同時計入它的大類 */
export function spentByCategory(transactions: Transaction[], categories: Category[], month: string): Map<string, number> {
  const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));
  const out = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== 'expense' || !t.categoryId || monthOf(t.date) !== month) continue;
    out.set(t.categoryId, (out.get(t.categoryId) ?? 0) + t.amount);
    const parent = parentOf.get(t.categoryId);
    if (parent) out.set(parent, (out.get(parent) ?? 0) + t.amount);
  }
  return out;
}

/** 每月收入與支出合計（轉帳、還款本身不算，但轉帳手續費算支出） */
export function monthTotals(transactions: Transaction[], month: string): { income: number; expense: number } {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (monthOf(t.date) !== month) continue;
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
    else if (t.type === 'transfer') expense += t.fee ?? 0;
  }
  return { income, expense };
}

/** 某個月的轉帳手續費合計 */
export function transferFees(transactions: Transaction[], month: string): number {
  return transactions.reduce((s, t) => s + (t.type === 'transfer' && monthOf(t.date) === month ? (t.fee ?? 0) : 0), 0);
}
