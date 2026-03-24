import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { AppShell } from '@/components/layout';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// ─── Lazy page imports ────────────────────────────────────────────────────────

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const SignupPage = lazy(() => import('@/pages/SignupPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage'));
const DashboardPage = lazy(() => import('@/pages/dashboard'));
const AccountsPage = lazy(() => import('@/pages/accounts'));
const TransactionsPage = lazy(() => import('@/pages/transactions'));
const BudgetPage = lazy(() => import('@/pages/budget'));
const CashFlowPage = lazy(() => import('@/pages/cashflow'));
const ReportsPage = lazy(() => import('@/pages/reports'));
const RecurringPage = lazy(() => import('@/pages/recurring'));
const GoalsPage = lazy(() => import('@/pages/goals'));
const InvestmentsPage = lazy(() => import('@/pages/investments'));
const AdvicePage = lazy(() => import('@/pages/advice'));
const SettingsPage = lazy(() => import('@/pages/settings'));
const RulesPage = lazy(() => import('@/pages/rules/RulesPage'));
const WealthPage = lazy(() => import('@/pages/wealth/WealthPage'));

// ─── Loading fallback ─────────────────────────────────────────────────────────

function PageLoader() {
  return (
    <div style={{ padding: '2rem', color: 'var(--color-text-muted)' }}>Loading...</div>
  );
}

// ─── Guards ───────────────────────────────────────────────────────────────────

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// ─── Global Cmd+K search trigger ─────────────────────────────────────────────
// The Cmd+K listener is also registered in Header; App.tsx re-exports the
// setShowSearch toggle to ensure it works when the header hasn't mounted yet.
// (Header handles this directly via its own useEffect — no duplication needed.)

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={
          <Suspense fallback={<PageLoader />}>
            <LoginPage />
          </Suspense>
        }
      />
      <Route
        path="/signup"
        element={
          <Suspense fallback={<PageLoader />}>
            <SignupPage />
          </Suspense>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <Suspense fallback={<PageLoader />}>
            <ForgotPasswordPage />
          </Suspense>
        }
      />
      <Route
        path="/reset-password"
        element={
          <Suspense fallback={<PageLoader />}>
            <ResetPasswordPage />
          </Suspense>
        }
      />

      {/* Protected routes — nested under AppShell layout */}
      <Route
        element={
          <ProtectedRoute>
            <ErrorBoundary>
              <AppShell />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      >
        <Route
          path="/"
          element={
            <Suspense fallback={<PageLoader />}>
              <DashboardPage />
            </Suspense>
          }
        />
        <Route
          path="/accounts"
          element={
            <Suspense fallback={<PageLoader />}>
              <AccountsPage />
            </Suspense>
          }
        />
        <Route
          path="/transactions"
          element={
            <Suspense fallback={<PageLoader />}>
              <TransactionsPage />
            </Suspense>
          }
        />
        <Route
          path="/cash-flow"
          element={
            <Suspense fallback={<PageLoader />}>
              <CashFlowPage />
            </Suspense>
          }
        />
        <Route
          path="/reports"
          element={
            <Suspense fallback={<PageLoader />}>
              <ReportsPage />
            </Suspense>
          }
        />
        <Route
          path="/budget"
          element={
            <Suspense fallback={<PageLoader />}>
              <BudgetPage />
            </Suspense>
          }
        />
        <Route
          path="/recurring"
          element={
            <Suspense fallback={<PageLoader />}>
              <RecurringPage />
            </Suspense>
          }
        />
        <Route
          path="/goals"
          element={
            <Suspense fallback={<PageLoader />}>
              <GoalsPage />
            </Suspense>
          }
        />
        <Route
          path="/investments"
          element={
            <Suspense fallback={<PageLoader />}>
              <InvestmentsPage />
            </Suspense>
          }
        />
        <Route
          path="/advice"
          element={
            <Suspense fallback={<PageLoader />}>
              <AdvicePage />
            </Suspense>
          }
        />
        <Route
          path="/rules"
          element={
            <Suspense fallback={<PageLoader />}>
              <RulesPage />
            </Suspense>
          }
        />
        <Route
          path="/wealth"
          element={
            <Suspense fallback={<PageLoader />}>
              <WealthPage />
            </Suspense>
          }
        />
        <Route
          path="/settings/*"
          element={
            <Suspense fallback={<PageLoader />}>
              <SettingsPage />
            </Suspense>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
