import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';

interface Props {
  children: React.ReactNode;
}

export function NoAccountsGuard({ children }: Props) {
  const navigate = useNavigate();
  const { data: accounts, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts').then((r) => r.data),
    staleTime: 30_000,
  });

  if (isLoading) return <>{children}</>;

  const hasAccounts = Array.isArray(accounts)
    ? accounts.length > 0
    : accounts?.groups?.some((g: { accounts: unknown[] }) => g.accounts.length > 0);

  if (!hasAccounts) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-[color:var(--color-surface-hover)] flex items-center justify-center">
          <Wallet size={28} className="text-[color:var(--color-text-muted)]" />
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-1">No accounts yet</h2>
          <p className="text-sm text-[color:var(--color-text-secondary)] max-w-xs">
            Add your first account to start tracking transactions, budgets, and more.
          </p>
        </div>
        <Button variant="primary" onClick={() => navigate('/accounts')}>
          Add your first account
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
