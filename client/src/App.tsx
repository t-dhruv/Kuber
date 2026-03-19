import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { AppShell } from '@/components/layout';
import LoginPage from '@/pages/LoginPage';
import SignupPage from '@/pages/SignupPage';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import DashboardPage from '@/pages/dashboard';
import AccountsPage from '@/pages/accounts';
import TransactionsPage from '@/pages/transactions';
import BudgetPage from '@/pages/budget';
import CashFlowPage from '@/pages/cashflow';
import ReportsPage from '@/pages/reports';
import RecurringPage from '@/pages/recurring';
import GoalsPage from '@/pages/goals';
import InvestmentsPage from '@/pages/investments';
import SettingsPage from '@/pages/settings';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-text)' }}>{title}</h1>
      <p style={{ color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>Coming soon...</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Protected routes — nested under AppShell layout */}
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/cash-flow" element={<CashFlowPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/budget" element={<BudgetPage />} />
        <Route path="/recurring" element={<RecurringPage />} />
        <Route path="/goals" element={<GoalsPage />} />
        <Route path="/investments" element={<InvestmentsPage />} />
        <Route path="/advice" element={<PlaceholderPage title="Advice — Coming Soon" />} />
        <Route path="/settings/*" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
