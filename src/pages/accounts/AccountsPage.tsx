import { useState } from 'react';
import { Tabs } from '../../components/ui';
import AccountList from './AccountList';
import BudgetTab from './BudgetTab';
import StatsTab from './StatsTab';

type Tab = 'accounts' | 'stats' | 'budget';
const TAB_KEY = 'accountsTab';

function initialTab(): Tab {
  try {
    const t = localStorage.getItem(TAB_KEY);
    if (t === 'accounts' || t === 'stats' || t === 'budget') return t;
  } catch {
    // 讀不到就用預設
  }
  return 'accounts';
}

export default function AccountsPage() {
  const [tab, setTab] = useState<Tab>(initialTab);
  const change = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // 存不了就算了
    }
  };
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">帳戶</h1>
      <Tabs
        value={tab}
        onChange={change}
        items={[
          { key: 'accounts', label: '帳戶' },
          { key: 'stats', label: '收支統計' },
          { key: 'budget', label: '預算' },
        ]}
      />
      {tab === 'accounts' && <AccountList />}
      {tab === 'stats' && <StatsTab />}
      {tab === 'budget' && <BudgetTab />}
    </div>
  );
}
