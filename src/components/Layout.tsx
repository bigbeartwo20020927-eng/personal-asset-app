import { NavLink, Outlet, useLocation } from 'react-router-dom';
import ErrorBoundary from './ErrorBoundary';
import { useAuth } from '../auth/AuthProvider';
import { useOnline } from '../hooks';
import { useAutoFillPrices } from '../market/useMarket';
import { useTxForm } from './TransactionForm';

const NAV = [
  { to: '/', label: '總覽', icon: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10' },
  { to: '/accounts', label: '帳戶', icon: 'M3 7h18v12H3zM3 11h18M7 15h3' },
  { to: '/investments', label: '投資', icon: 'M4 18l6-6 4 4 6-8M14 8h6v6' },
  { to: '/debts', label: '負債', icon: 'M12 3v18M7 8h7a3 3 0 010 6H8' },
  { to: '/settings', label: '設定', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z' },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export default function Layout() {
  const online = useOnline();
  const { state } = useAuth();
  const syncError = state.status === 'ready' ? state.sync.error : null;
  const { openTx } = useTxForm();
  const location = useLocation();
  // 開啟 APP、或買賣紀錄變動時，在背景補齊股價
  useAutoFillPrices();

  return (
    <div className="min-h-dvh md:flex">
      {/* 電腦：左側選單 */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <img src="/icon.svg" alt="" className="h-8 w-8" />
          <span className="text-lg font-semibold">個人資產</span>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-teal-50 font-medium text-teal-800' : 'text-slate-600 hover:bg-slate-50'}`
              }
            >
              <Icon d={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 pb-20 md:pb-6">
        {!online && <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-800">目前沒有網路，可以瀏覽但無法修改資料</div>}
        {syncError && <div className="bg-red-100 px-4 py-2 text-center text-sm text-red-700">{syncError}</div>}
        <div className="mx-auto max-w-5xl px-4 py-4 md:px-6 md:py-6">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>

      {/* 隨時都能快速記帳 */}
      <button
        onClick={() => openTx()}
        className="fixed right-4 bottom-20 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-teal-700 text-3xl text-white shadow-lg hover:bg-teal-800 md:right-8 md:bottom-8"
        aria-label="記一筆"
      >
        ＋
      </button>

      {/* 手機：下方分頁列 */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-xs ${isActive ? 'text-teal-700' : 'text-slate-500'}`}
          >
            <Icon d={n.icon} />
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
