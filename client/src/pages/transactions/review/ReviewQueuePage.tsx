import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, Inbox, RefreshCw, X, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Skeleton, notify } from '@/components/ui';
import { ReviewTransactionRow, ReviewTransaction } from './components/ReviewTransactionRow';
import { RuleSuggestionBanner, RuleSuggestion } from './components/RuleSuggestionBanner';
import type { ReviewCategory } from './types';

interface ReviewQueueResponse {
  transactions: ReviewTransaction[];
  total: number;
  ruleSuggestions: RuleSuggestion[];
}

export default function ReviewQueuePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [page] = useState(1);
  const [pendingRulePattern, setPendingRulePattern] = useState<string | null>(() => {
    try { return sessionStorage.getItem('pendingRulePattern') ?? null; } catch { return null; }
  });

  const { data, isLoading } = useQuery<ReviewQueueResponse>({
    queryKey: ['auto-categorize-review', page],
    queryFn: () =>
      api.get(`/auto-categorize/review-queue?page=${page}&limit=50`).then((r) => r.data),
  });

  const { data: categories = [] } = useQuery<ReviewCategory[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => r.data),
  });

  const reRunMutation = useMutation({
    mutationFn: () => api.post('/auto-categorize/re-run').then((r) => r.data),
    onSuccess: (result) => {
      if (result.notConfigured) {
        notify.error('AI provider not configured');
        return;
      }
      notify.success(`Re-ran AI on ${result.total} transaction${result.total !== 1 ? 's' : ''}, updated ${result.updated}`);
      qc.invalidateQueries({ queryKey: ['auto-categorize-review'] });
      qc.invalidateQueries({ queryKey: ['auto-categorize-status'] });
    },
    onError: () => notify.error('Re-run failed'),
  });

  const bulkApproveMutation = useMutation({
    mutationFn: () => api.post('/auto-categorize/confirm-bulk').then((r) => r.data),
    onSuccess: (result) => {
      notify.success(`Approved ${result.approved} transactions`);
      qc.invalidateQueries({ queryKey: ['auto-categorize-review'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['auto-categorize-status'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['budget'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: () => notify.error('Bulk approval failed'),
  });

  const bulkRejectMutation = useMutation({
    mutationFn: () => api.post('/auto-categorize/reject-bulk').then((r) => r.data),
    onSuccess: (result) => {
      notify.success(`Rejected ${result.rejected} suggestions`);
      qc.invalidateQueries({ queryKey: ['auto-categorize-review'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['auto-categorize-status'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['budget'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: () => notify.error('Bulk rejection failed'),
  });

  const bulkSkipMutation = useMutation({
    mutationFn: () => api.post('/auto-categorize/skip-bulk').then((r) => r.data),
    onSuccess: (result) => {
      notify.success(`Skipped ${result.skipped} transactions`);
      qc.invalidateQueries({ queryKey: ['auto-categorize-review'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['auto-categorize-status'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['budget'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: () => notify.error('Bulk skip failed'),
  });

  const confirmMutation = useMutation({
    mutationFn: (payload: {
      transactionId: string;
      action: 'approve' | 'reject' | 'skip';
      categoryId?: string;
      createCategory?: { name: string; type: string; icon?: string | null };
    }) => api.post('/auto-categorize/confirm', payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auto-categorize-review'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['auto-categorize-status'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['budget'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: () => notify.error('Failed to confirm categorization'),
  });

  const handleConfirm = async (
    transactionId: string,
    action: 'approve' | 'reject' | 'skip',
    categoryId?: string,
    createCategory?: { name: string; type: string; icon?: string | null }
  ) => {
    await confirmMutation.mutateAsync({ transactionId, action, categoryId, createCategory });
  };

  const setPendingRulePatternPersisted = (val: string | null) => {
    try {
      if (val) sessionStorage.setItem('pendingRulePattern', val);
      else sessionStorage.removeItem('pendingRulePattern');
    } catch {
      // sessionStorage unavailable
    }
    setPendingRulePattern(val);
  };

  const handleCreateRuleFromRow = (description: string) => {
    const firstToken = description.toLowerCase().split(/[\s_-]/)[0].trim();
    setPendingRulePatternPersisted(firstToken);
  };

  const handleCreateRule = (suggestion: RuleSuggestion) => {
    const ruleName = `${suggestion.suggestedCategoryName} (${suggestion.value}*)`;
    navigate(`/rules?prefill=${encodeURIComponent(JSON.stringify({
      name: ruleName,
      field: 'description',
      operator: 'startsWith',
      value: suggestion.value,
      categoryId: suggestion.suggestedCategoryId,
      categoryName: suggestion.suggestedCategoryName,
    }))}`);
  };

  const total = data?.total ?? 0;
  const transactions = data?.transactions ?? [];
  const ruleSuggestions = data?.ruleSuggestions ?? [];
  const hasMatched = transactions.some((t) => t.aiSuggestedCategoryId !== null);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Review AI Suggestions</h1>
          {!isLoading && (
            <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
              {total} transaction{total !== 1 ? 's' : ''} need review
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => reRunMutation.mutate()}
            disabled={reRunMutation.isPending || total === 0}
            title="Re-run AI suggestions on all pending transactions"
          >
            <RefreshCw size={16} className={`mr-2 ${reRunMutation.isPending ? 'animate-spin' : ''}`} />
            Re-run AI
          </Button>
          {total > 0 && (
            <Button
              onClick={() => bulkRejectMutation.mutate()}
              disabled={bulkRejectMutation.isPending}
              variant="secondary"
            >
              <X size={16} className="mr-2" />
              Reject All
            </Button>
          )}
          {total > 0 && (
            <Button
              onClick={() => bulkSkipMutation.mutate()}
              disabled={bulkSkipMutation.isPending}
              variant="ghost"
            >
              Skip All
              <ChevronRight size={14} className="ml-1" />
            </Button>
          )}
          {hasMatched && (
            <Button
              onClick={() => bulkApproveMutation.mutate()}
              disabled={bulkApproveMutation.isPending}
            >
              <CheckCheck size={16} className="mr-2" />
              Accept All
            </Button>
          )}
        </div>
      </div>

      {/* Rule suggestion banners */}
      {ruleSuggestions.length > 0 && (
        <RuleSuggestionBanner
          suggestions={ruleSuggestions}
          onCreateRule={handleCreateRule}
        />
      )}

      {/* Pending rule prompt from row rejection */}
      {pendingRulePattern && (
        <div className="flex items-center justify-between p-3 mb-4 rounded-[var(--radius-md)] bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-sm">
          <span>Create a rule for transactions matching <code className="px-1 rounded bg-white/30">"{pendingRulePattern}*"</code>?</span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                const ruleName = `Rule (${pendingRulePattern}*)`;
                navigate(`/rules?prefill=${encodeURIComponent(JSON.stringify({
                  name: ruleName,
                  field: 'description',
                  operator: 'startsWith',
                  value: pendingRulePattern,
                }))}`);
                setPendingRulePatternPersisted(null);
              }}
            >
              Create Rule
            </Button>
            <button onClick={() => setPendingRulePatternPersisted(null)} className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)]">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-[var(--radius-md)]" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && transactions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Inbox size={48} className="text-[var(--color-text-secondary)] mb-4" />
          <h2 className="text-lg font-semibold text-[var(--color-text)]">All caught up</h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            No transactions need review right now.
          </p>
          <Button variant="ghost" className="mt-4" onClick={() => navigate('/transactions')}>
            Back to Transactions
          </Button>
        </div>
      )}

      {/* Matched suggestions */}
      {!isLoading && transactions.some((t) => t.aiSuggestedCategoryId !== null) && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] mb-3">
            Suggested Categories
          </h2>
          <div className="flex flex-col gap-3">
            {transactions
              .filter((t) => t.aiSuggestedCategoryId !== null)
              .map((txn) => (
                <ReviewTransactionRow
                  key={txn.id}
                  transaction={txn}
                  categories={categories}
                  onConfirm={handleConfirm}
                  onCreateRule={handleCreateRuleFromRow}
                />
              ))}
          </div>
        </section>
      )}

      {/* No-match transactions */}
      {!isLoading && transactions.some((t) => t.aiSuggestedCategoryId === null) && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] mb-3">
            No Category Match
          </h2>
          <div className="flex flex-col gap-3">
            {transactions
              .filter((t) => t.aiSuggestedCategoryId === null)
              .map((txn) => (
                <ReviewTransactionRow
                  key={txn.id}
                  transaction={txn}
                  categories={categories}
                  onConfirm={handleConfirm}
                  onCreateRule={handleCreateRuleFromRow}
                />
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
