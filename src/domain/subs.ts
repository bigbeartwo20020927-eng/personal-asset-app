import type { Allocation, Trade, Transaction } from '../types';

/**
 * 子帳戶刪除後，過去的收支、交易、劃撥仍然記著它的 id。
 * 這裡把「指向已刪除子帳戶」的紀錄一律視為「未分配」，
 * 這樣餘額、防呆、編輯表單看到的都是同一件事：那些錢在未分配裡。
 * 只在讀取時轉換，不會改動資料庫裡的原始紀錄。
 */
export function dropDeadSubs(
  input: { transactions: Transaction[]; trades: Trade[]; allocations: Allocation[] },
  live: ReadonlySet<string>,
): { transactions: Transaction[]; trades: Trade[]; allocations: Allocation[] } {
  const dead = (id: string | null) => id !== null && !live.has(id);

  const transactions = input.transactions.map((t) =>
    dead(t.subAccountId) || dead(t.toSubAccountId)
      ? { ...t, subAccountId: dead(t.subAccountId) ? null : t.subAccountId, toSubAccountId: dead(t.toSubAccountId) ? null : t.toSubAccountId }
      : t,
  );

  const trades = input.trades.map((t) => (dead(t.subAccountId) ? { ...t, subAccountId: null } : t));

  const allocations = input.allocations
    .map((a) => (dead(a.fromSubId) || dead(a.toSubId) ? { ...a, fromSubId: dead(a.fromSubId) ? null : a.fromSubId, toSubId: dead(a.toSubId) ? null : a.toSubId } : a))
    // 轉換後變成「未分配 → 未分配」的劃撥沒有任何效果（例如舊版刪除子帳戶時自動產生的那筆），不必顯示
    .filter((a) => a.fromSubId !== a.toSubId);

  return { transactions, trades, allocations };
}
