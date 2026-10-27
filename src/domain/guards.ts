import { buildLedger, minSubBalances, type LedgerInput } from './ledger';

/**
 * 刪除或修改前的防呆：比較修改前後，若有子帳戶「新出現」負數（或變得更負），回傳說明文字。
 * 「未分配」允許負數（只警示），所以不在這裡檢查。
 */
export function subBalanceProblem(before: LedgerInput, after: LedgerInput, subName: (id: string) => string): string | null {
  const b = minSubBalances(buildLedger(before));
  const a = minSubBalances(buildLedger(after));
  for (const [sub, min] of a) {
    if (min < -1e-9 && min < (b.get(sub) ?? 0) - 1e-9) {
      return `這樣會讓子帳戶「${subName(sub)}」在某個時間點變成負數（最低 ${min.toLocaleString('zh-TW')}），請先調整相關的紀錄`;
    }
  }
  return null;
}
