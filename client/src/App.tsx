import { lazy, Suspense, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { AppShell } from '@/components/layout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import InstallPrompt from '@/components/pwa/InstallPrompt';
import OfflineStatus from '@/components/pwa/OfflineStatus';
import { OnboardingWizard, shouldShowOnboarding } from '@/components/onboarding/OnboardingWizard';
import { NoAccountsGuard } from '@/components/NoAccountsGuard';
import { api } from '@/lib/api';

// ─── Lazy page imports ────────────────────────────────────────────────────────

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const SignupPage = lazy(() => import('@/pages/SignupPage'));
const VerifyEmailPage = lazy(() => import('@/pages/VerifyEmailPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage'));
const OfflinePage = lazy(() => import('@/pages/OfflinePage'));
const DashboardPage = lazy(() => import('@/pages/dashboard'));
const AccountsPage = lazy(() => import('@/pages/accounts'));
const TransactionsPage = lazy(() => import('@/pages/transactions'));
const BudgetPage = lazy(() => import('@/pages/budget'));
const CashFlowPage = lazy(() => import('@/pages/cashflow'));
const ReportsPage = lazy(() => import('@/pages/reports'));
const RecurringPage = lazy(() => import('@/pages/recurring'));
const GoalsPage = lazy(() => import('@/pages/goals'));
const InvestmentsPage = lazy(() => import('@/pages/investments'));
const SettingsPage = lazy(() => import('@/pages/settings'));
const RulesPage = lazy(() => import('@/pages/rules/RulesPage'));
const WealthPage = lazy(() => import('@/pages/wealth/WealthPage'));
const ImportPage = lazy(() => import('@/pages/import/ImportPage'));
const AccountBulkImportPage = lazy(() => import('@/pages/accounts/AccountBulkImportPage'));
const ReviewQueuePage = lazy(() => import('./pages/transactions/review/ReviewQueuePage'));
const SystemSettingsLayout   = lazy(() => import('@/pages/settings/system'));
const SystemJobsPage         = lazy(() => import('@/pages/settings/system/JobsPage'));
const SystemAutomationPage   = lazy(() => import('@/pages/settings/system/AutomationPage'));
const SystemIntegrationsPage = lazy(() => import('@/pages/settings/system/IntegrationsPage'));
const SystemAiPage           = lazy(() => import('@/pages/settings/system/AiPage'));

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

function AuthenticatedLayout() {
  const [onboardingDone, setOnboardingDone] = useState(false);

  // Check if user is new (no accounts) and onboarding not yet dismissed
  const { data: accounts } = useQuery({
    queryKey: ['accounts-onboarding'],
    queryFn: () => api.get('/accounts').then((r) => r.data),
    staleTime: Infinity,
  });

  const isNewUser =
    shouldShowOnboarding() &&
    (!accounts ||
      (Array.isArray(accounts)
        ? accounts.length === 0
        : accounts?.groups?.length === 0 ||
          accounts?.groups?.every(
            (g: { accounts: unknown[] }) => g.accounts.length === 0,
          )));

  const showOnboarding = isNewUser && !onboardingDone;

  return (
    <ProtectedRoute>
      <ErrorBoundary>
        <AppShell />
        {showOnboarding && (
          <OnboardingWizard onDone={() => setOnboardingDone(true)} />
        )}
      </ErrorBoundary>
    </ProtectedRoute>
  );
}

// ─── Global Cmd+K search trigger ─────────────────────────────────────────────
// The Cmd+K listener is also registered in Header; App.tsx re-exports the
// setShowSearch toggle to ensure it works when the header hasn't mounted yet.
// (Header handles this directly via its own useEffect — no duplication needed.)

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <>
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
        path="/verify-email"
        element={
          <Suspense fallback={<PageLoader />}>
            <VerifyEmailPage />
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
      <Route
        path="/offline"
        element={
          <Suspense fallback={<PageLoader />}>
            <OfflinePage />
          </Suspense>
        }
      />

      {/* Protected routes — nested under AppShell layout */}
      <Route element={<AuthenticatedLayout />}>
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
          path="/accounts/bulk-import"
          element={
            <Suspense fallback={<PageLoader />}>
              <AccountBulkImportPage />
            </Suspense>
          }
        />
        <Route
          path="/transactions"
          element={
            <Suspense fallback={<PageLoader />}>
              <NoAccountsGuard><TransactionsPage /></NoAccountsGuard>
            </Suspense>
          }
        />
        <Route
          path="/transactions/review"
          element={
            <Suspense fallback={<PageLoader />}>
              <ReviewQueuePage />
            </Suspense>
          }
        />
        <Route
          path="/cash-flow"
          element={
            <Suspense fallback={<PageLoader />}>
              <NoAccountsGuard><CashFlowPage /></NoAccountsGuard>
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
          path="/import"
          element={
            <Suspense fallback={<PageLoader />}>
              <ImportPage />
            </Suspense>
          }
        />
        <Route path="/settings/system" element={<Suspense fallback={<PageLoader />}><SystemSettingsLayout /></Suspense>}>
          <Route index element={<Navigate to="/settings/system/jobs" replace />} />
          <Route path="jobs"         element={<Suspense fallback={<PageLoader />}><SystemJobsPage /></Suspense>} />
          <Route path="automation"   element={<Suspense fallback={<PageLoader />}><SystemAutomationPage /></Suspense>} />
          <Route path="integrations" element={<Suspense fallback={<PageLoader />}><SystemIntegrationsPage /></Suspense>} />
          <Route path="ai"           element={<Suspense fallback={<PageLoader />}><SystemAiPage /></Suspense>} />
        </Route>
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
    <InstallPrompt />
    <OfflineStatus />
    </>
  );
}
