import type { Account, SubAccount } from '../types';
import { subsOf } from '../data/useData';

/** 帳戶＋子帳戶選擇；有子帳戶時才出現第二個下拉，預設「未分配」 */
export default function AccountSelect({
  accounts,
  subAccounts,
  accountId,
  subId,
  onChange,
  exclude,
}: {
  accounts: Account[];
  subAccounts: SubAccount[];
  accountId: string;
  subId: string | null;
  onChange: (accountId: string, subId: string | null) => void;
  exclude?: string;
}) {
  const active = accounts.filter((a) => !a.archived || a.id === accountId).filter((a) => a.id !== exclude);
  const subs = accountId ? subsOf(subAccounts, accountId) : [];
  return (
    <div className="flex gap-2">
      <select className="input" value={accountId} onChange={(e) => onChange(e.target.value, null)}>
        <option value="">選擇帳戶…</option>
        {active.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {a.currency !== 'TWD' ? `（${a.currency}）` : ''}
          </option>
        ))}
      </select>
      {subs.length > 0 && (
        <select className="input" value={subId ?? ''} onChange={(e) => onChange(accountId, e.target.value || null)}>
          <option value="">未分配</option>
          {subs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
