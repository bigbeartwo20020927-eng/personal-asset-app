import { useMemo } from 'react';
import { buildLedger, type LedgerEvent } from '../domain/ledger';
import { useCol } from '../hooks';
import type { Account, Category, SubAccount } from '../types';

/** 帳戶相關的資料一次取齊，並建好帳本（所有金額變動） */
export function useAccountsData() {
  const accounts = useCol('accounts');
  const subAccounts = useCol('subAccounts');
  const allocations = useCol('allocations');
  const transactions = useCol('transactions');
  const trades = useCol('trades');
  const categories = useCol('categories');
  const debts = useCol('debts');

  const ledger = useMemo(
    () => buildLedger({ accounts, transactions, allocations, trades }),
    [accounts, transactions, allocations, trades],
  );

  const sortedAccounts = useMemo(() => [...accounts].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)), [accounts]);
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const subById = useMemo(() => new Map(subAccounts.map((s) => [s.id, s])), [subAccounts]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const debtById = useMemo(() => new Map(debts.map((d) => [d.id, d])), [debts]);

  return {
    debts,
    debtById,
    accounts: sortedAccounts,
    subAccounts,
    allocations,
    transactions,
    trades,
    categories,
    ledger,
    accountById,
    subById,
    catById,
  };
}

export type AccountsData = ReturnType<typeof useAccountsData>;

export function subsOf(subAccounts: SubAccount[], accountId: string): SubAccount[] {
  return subAccounts.filter((s) => s.accountId === accountId).sort((a, b) => a.order - b.order);
}

export function eventsOf(ledger: LedgerEvent[], accountId: string, subId?: string | null): LedgerEvent[] {
  return ledger.filter((e) => e.accountId === accountId && (subId === undefined || e.subId === subId));
}

export function accountLabel(a: Account | undefined, sub?: SubAccount | null): string {
  if (!a) return '（已刪除的帳戶）';
  return sub ? `${a.name} › ${sub.name}` : a.name;
}

export function categoryLabel(catById: Map<string, Category>, id: string | null): string {
  if (!id) return '';
  return catById.get(id)?.name ?? '（已刪除的分類）';
}
