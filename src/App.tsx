import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import Gate, { NotConfigured } from './auth/Gate';
import Layout from './components/Layout';
import { ToastProvider } from './components/Toast';
import { TxFormProvider } from './components/TransactionForm';
import { firebaseConfigured } from './firebase';
import AccountDetail from './pages/accounts/AccountDetail';
import AccountsPage from './pages/accounts/AccountsPage';
import SubAccountDetail from './pages/accounts/SubAccountDetail';
import Dashboard from './pages/Dashboard';
import DebtDetail from './pages/debts/DebtDetail';
import DebtsPage from './pages/debts/DebtsPage';
import InvestmentsPage from './pages/investments/InvestmentsPage';
import StockDetail from './pages/investments/StockDetail';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  if (!firebaseConfigured) return <NotConfigured />;
  return (
    <ToastProvider>
      <AuthProvider>
        <Gate>
          <BrowserRouter>
            <TxFormProvider>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="accounts" element={<AccountsPage />} />
                  <Route path="accounts/:id" element={<AccountDetail />} />
                  <Route path="accounts/:id/sub/:subId" element={<SubAccountDetail />} />
                  <Route path="investments" element={<InvestmentsPage />} />
                  <Route path="investments/:symbol" element={<StockDetail />} />
                  <Route path="debts" element={<DebtsPage />} />
                  <Route path="debts/:id" element={<DebtDetail />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </TxFormProvider>
          </BrowserRouter>
        </Gate>
      </AuthProvider>
    </ToastProvider>
  );
}
