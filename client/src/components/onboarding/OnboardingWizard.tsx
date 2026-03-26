/**
 * OnboardingWizard.tsx
 * 4-step onboarding for new users. Shows once, then permanently dismissed.
 * Steps: Welcome → Add Account → Add Budget → Done
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronRight, X, Wallet, PiggyBank, Target, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { notify } from '@/components/ui';

const DISMISSED_KEY = 'kuber-onboarding-done';

interface Props {
  onDone: () => void;
}

interface Step {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const STEPS: Step[] = [
  {
    id: 'welcome',
    title: 'Welcome to Kuber!',
    description: "Your self-hosted personal finance manager. Let's get you set up in 3 quick steps.",
    icon: <Sparkles size={32} className="text-indigo-500" />,
  },
  {
    id: 'account',
    title: 'Add your first account',
    description: 'Connect your bank account, credit card, or investment account to start tracking.',
    icon: <Wallet size={32} className="text-blue-500" />,
  },
  {
    id: 'budget',
    title: 'Set a budget',
    description: 'Create spending categories and budgets to stay on track every month.',
    icon: <PiggyBank size={32} className="text-green-500" />,
  },
  {
    id: 'goals',
    title: "You're all set!",
    description: 'Import transactions, set goals, and ask your AI advisor anything about your finances.',
    icon: <Target size={32} className="text-purple-500" />,
  },
];

interface AccountFormData {
  name: string;
  type: string;
  institution: string;
  balance: string;
  currency: string;
}

interface BudgetFormData {
  categoryName: string;
  amount: string;
}

export function OnboardingWizard({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const [accountData, setAccountData] = useState<AccountFormData>({
    name: '', type: 'checking', institution: '', balance: '0', currency: 'USD',
  });
  const [budgetData, setBudgetData] = useState<BudgetFormData>({ categoryName: 'Groceries', amount: '400' });
  const queryClient = useQueryClient();

  const createAccount = useMutation({
    mutationFn: () => api.post('/accounts', {
      name: accountData.name || 'My Chequing Account',
      type: accountData.type,
      institution: accountData.institution || undefined,
      balance: parseFloat(accountData.balance) || 0,
      currency: accountData.currency,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
    onError: () => notify.error('Could not create account'),
  });

  const createBudget = useMutation({
    mutationFn: async () => {
      // First ensure category exists
      const catRes = await api.post('/categories', {
        name: budgetData.categoryName || 'Groceries',
        type: 'expense',
        emoji: '🛒',
      }).catch(() => null);
      const categoryId = catRes?.data?.id;
      if (categoryId) {
        await api.post('/budgets', {
          categoryId,
          amount: parseFloat(budgetData.amount) || 400,
          period: 'monthly',
        });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budgets'] }),
    onError: () => notify.error('Could not create budget'),
  });

  async function handleNext() {
    if (step === 1 && accountData.name) {
      await createAccount.mutateAsync().catch(() => {});
    }
    if (step === 2 && budgetData.categoryName) {
      await createBudget.mutateAsync().catch(() => {});
    }
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      handleDone();
    }
  }

  function handleDone() {
    localStorage.setItem(DISMISSED_KEY, '1');
    onDone();
  }

  const currentStep = STEPS[step];
  const isLoading = createAccount.isPending || createBudget.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-[color:var(--surface)] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-[color:var(--border)]">
          <div
            className="h-full bg-indigo-500 transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <div className="flex gap-2">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                className={`w-2 h-2 rounded-full transition-colors ${i <= step ? 'bg-indigo-500' : 'bg-[color:var(--border)]'}`}
              />
            ))}
          </div>
          <button
            onClick={handleDone}
            className="p-1 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] rounded"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-4">
          <div className="flex flex-col items-center text-center py-4 gap-3">
            {currentStep.icon}
            <h2 className="text-xl font-bold">{currentStep.title}</h2>
            <p className="text-[color:var(--text-secondary)] text-sm leading-relaxed">{currentStep.description}</p>
          </div>

          {/* Step 1: Account form */}
          {step === 1 && (
            <div className="space-y-3 mt-2">
              <input
                className="w-full px-3 py-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-hover)] text-sm"
                placeholder="Account name (e.g. TD Chequing)"
                value={accountData.name}
                onChange={(e) => setAccountData((d) => ({ ...d, name: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="px-3 py-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-hover)] text-sm"
                  value={accountData.type}
                  onChange={(e) => setAccountData((d) => ({ ...d, type: e.target.value }))}
                >
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                  <option value="credit">Credit Card</option>
                  <option value="investment">Investment</option>
                </select>
                <select
                  className="px-3 py-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-hover)] text-sm"
                  value={accountData.currency}
                  onChange={(e) => setAccountData((d) => ({ ...d, currency: e.target.value }))}
                >
                  <option>USD</option><option>CAD</option><option>EUR</option><option>GBP</option>
                </select>
              </div>
              <input
                className="w-full px-3 py-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-hover)] text-sm"
                placeholder="Current balance (e.g. 2500)"
                type="number"
                value={accountData.balance}
                onChange={(e) => setAccountData((d) => ({ ...d, balance: e.target.value }))}
              />
            </div>
          )}

          {/* Step 2: Budget form */}
          {step === 2 && (
            <div className="space-y-3 mt-2">
              <input
                className="w-full px-3 py-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-hover)] text-sm"
                placeholder="Category name (e.g. Groceries)"
                value={budgetData.categoryName}
                onChange={(e) => setBudgetData((d) => ({ ...d, categoryName: e.target.value }))}
              />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-secondary)] text-sm">$</span>
                <input
                  className="w-full pl-7 pr-3 py-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-hover)] text-sm"
                  placeholder="Monthly budget amount"
                  type="number"
                  value={budgetData.amount}
                  onChange={(e) => setBudgetData((d) => ({ ...d, amount: e.target.value }))}
                />
              </div>
            </div>
          )}

          {/* Step 3: Done — feature highlights */}
          {step === 3 && (
            <div className="mt-2 space-y-2">
              {[
                'Drop CSV/PDF bank statements to import transactions',
                'Ask your AI advisor anything about your finances',
                'Set goals, budgets, and recurring items',
                'Track investments, assets, TFSA/RRSP room',
              ].map((tip) => (
                <div key={tip} className="flex items-start gap-2 text-sm text-[color:var(--text-secondary)]">
                  <CheckCircle2 size={15} className="text-green-500 mt-0.5 shrink-0" />
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center justify-between">
          <button
            onClick={handleDone}
            className="text-sm text-[color:var(--text-secondary)] hover:underline"
          >
            Skip setup
          </button>
          <Button variant="primary" onClick={handleNext} disabled={isLoading}>
            {isLoading ? 'Saving…' : step === STEPS.length - 1 ? 'Get started' : (
              <span className="flex items-center gap-1">Next <ChevronRight size={16} /></span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function shouldShowOnboarding(): boolean {
  return localStorage.getItem(DISMISSED_KEY) !== '1';
}
