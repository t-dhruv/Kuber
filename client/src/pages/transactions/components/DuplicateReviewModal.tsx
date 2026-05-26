import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, AlertTriangle, CheckCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal, ModalFooter, Button, Skeleton, toast } from '@/components/ui'; // eslint-disable-line @typescript-eslint/no-unused-vars
import type { AxiosError } from 'axios';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DuplicateTx {
  id: string;
  date: string;
  description: string;
  merchantName: string;
  amount: number;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  isSplit: boolean;
}

interface DuplicateGroup {
  confidence: 'high' | 'medium';
  transactions: [DuplicateTx, DuplicateTx];
}

interface DuplicatesResponse {
  count: number;
  groups: DuplicateGroup[];
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    Math.abs(amount)
  );

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

// ─── Transaction Card ─────────────────────────────────────────────────────────

function TxCard({ tx, label }: { tx: DuplicateTx; label: string }) {
  return (
    <div className="flex-1 p-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] flex flex-col gap-2">
      <div className="text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-[var(--color-text-muted)] mb-[0.125rem]">
        {label}
      </div>

      {/* Merchant / description */}
      <div className="text-[0.9375rem] font-semibold text-[var(--color-text)]">
        {tx.merchantName}
      </div>

      {/* Amount */}
      <div
        className="text-lg font-bold [font-variant-numeric:tabular-nums]"
        style={{ color: tx.amount < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}
      >
        {tx.amount < 0 ? '-' : '+'}
        {fmtCurrency(tx.amount)}
      </div>

      {/* Meta */}
      <div className="flex flex-col gap-1">
        <MetaRow label="Date" value={fmtDate(tx.date)} />
        <MetaRow label="Account" value={tx.accountName} />
        {tx.categoryName && (
          <MetaRow
            label="Category"
            value={`${tx.categoryIcon ? tx.categoryIcon + ' ' : ''}${tx.categoryName}`}
          />
        )}
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-[0.8125rem]">
      <span className="text-[var(--color-text-muted)] shrink-0 min-w-[60px]">
        {label}
      </span>
      <span className="text-[var(--color-text-secondary)] font-medium">{value}</span>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface DuplicateReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DuplicateReviewModal({ isOpen, onClose }: DuplicateReviewModalProps) {
  const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [dismissAllConfirm, setDismissAllConfirm] = useState(false);

  const { data, isLoading } = useQuery<DuplicatesResponse>({
    queryKey: ['transactions', 'duplicates'],
    queryFn: () => api.get('/transactions/duplicates').then((r) => r.data),
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });

  const groups = data?.groups ?? [];
  const total = groups.length;
  const allDone = !isLoading && total === 0 && reviewedCount > 0;
  const current = groups[currentIndex];

  function removeReviewedGroup(ids: string[]) {
    const idSet = new Set(ids);
    queryClient.setQueryData<DuplicatesResponse>(['transactions', 'duplicates'], (prev) => {
      if (!prev) return prev;
      const nextGroups = prev.groups.filter((group) =>
        !group.transactions.some((tx) => idSet.has(tx.id))
      );
      return { count: nextGroups.length, groups: nextGroups };
    });
    setReviewedCount((c) => c + 1);
    setCurrentIndex((i) => Math.max(0, Math.min(i, total - 2)));
  }

  const dismissMutation = useMutation({
    mutationFn: (ids: { transactionId1: string; transactionId2: string }) =>
      api.post('/transactions/duplicates/dismiss', ids),
    onSuccess: (_data, ids) => {
      removeReviewedGroup([ids.transactionId1, ids.transactionId2]);
    },
    onError: (err: AxiosError<{ error: string }>) => {
      toast.error(err.response?.data?.error ?? 'Failed to dismiss');
    },
  });

  const mergeMutation = useMutation({
    mutationFn: (ids: { keepId: string; removeId: string }) =>
      api.post('/transactions/duplicates/merge', ids),
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      removeReviewedGroup([ids.keepId, ids.removeId]);
    },
    onError: (err: AxiosError<{ error: string }>) => {
      toast.error(err.response?.data?.error ?? 'Failed to merge');
    },
  });

  const isBusy = dismissMutation.isPending || mergeMutation.isPending;

  const dismissAllMutation = useMutation({
    mutationFn: async () => {
      for (const group of groups) {
        await api.post('/transactions/duplicates/dismiss', {
          transactionId1: group.transactions[0].id,
          transactionId2: group.transactions[1].id,
        });
      }
    },
    onSuccess: () => {
      setReviewedCount((c) => c + groups.length);
      setCurrentIndex(0);
      setDismissAllConfirm(false);
      queryClient.setQueryData<DuplicatesResponse>(['transactions', 'duplicates'], { count: 0, groups: [] });
      queryClient.invalidateQueries({ queryKey: ['transactions', 'duplicates', 'count'] });
      toast.success('Dismissed all duplicate reviews');
    },
    onError: (err: AxiosError<{ error: string }>) => {
      toast.error(err.response?.data?.error ?? 'Failed to dismiss all duplicate reviews');
    },
  });

  function handleClose() {
    setCurrentIndex(0);
    setReviewedCount(0);
    setDismissAllConfirm(false);
    onClose();
  }

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title="Review Duplicate Transactions"
      size="lg"
    >
      {isLoading ? (
        <div className="flex flex-col gap-3 py-2">
          <Skeleton height={20} width={200} />
          <div className="flex gap-4">
            <Skeleton height={160} style={{ flex: 1 }} />
            <Skeleton height={160} style={{ flex: 1 }} />
          </div>
        </div>
      ) : total === 0 ? (
        <div className="text-center py-8 flex flex-col items-center gap-3">
          <CheckCircle size={40} className="text-[var(--color-success)]" />
          <div className="text-base font-semibold text-[var(--color-text)]">
            No duplicate transactions found
          </div>
          <div className="text-sm text-[var(--color-text-muted)]">
            Your transactions look clean!
          </div>
        </div>
      ) : allDone ? (
        <div className="text-center py-8 flex flex-col items-center gap-3">
          <CheckCircle size={40} className="text-[var(--color-success)]" />
          <div className="text-base font-semibold text-[var(--color-text)]">
            All duplicates reviewed!
          </div>
          <div className="text-sm text-[var(--color-text-muted)]">
            You reviewed {reviewedCount} potential duplicate{reviewedCount !== 1 ? 's' : ''}.
          </div>
        </div>
      ) : current ? (
        <div className="flex flex-col gap-4">
          {/* Header row */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm text-[var(--color-text-muted)]">
              Reviewing{' '}
              <strong className="text-[var(--color-text)]">
                {currentIndex + 1} of {total}
              </strong>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={isBusy || dismissAllMutation.isPending}
                onClick={() => setDismissAllConfirm(true)}
              >
                Dismiss All
              </Button>

              {/* Confidence badge */}
              <span
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-full)] text-xs font-semibold"
                style={{
                  backgroundColor:
                    current.confidence === 'high'
                      ? 'var(--color-danger-light, #fee2e2)'
                      : 'var(--color-warning-light, #fef9c3)',
                  color:
                    current.confidence === 'high'
                      ? 'var(--color-danger)'
                      : 'var(--color-warning, #b45309)',
                }}
              >
                <AlertTriangle size={11} />
                {current.confidence === 'high' ? 'High confidence' : 'Medium confidence'}
              </span>

              {/* Prev / next navigation */}
              <button
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                disabled={currentIndex === 0}
                className="bg-none border border-[var(--color-border)] rounded-[var(--radius-sm)] px-2 py-1 text-[var(--color-text-secondary)]"
                style={{
                  cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
                  opacity: currentIndex === 0 ? 0.4 : 1,
                }}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setCurrentIndex((i) => Math.min(total - 1, i + 1))}
                disabled={currentIndex === total - 1}
                className="bg-none border border-[var(--color-border)] rounded-[var(--radius-sm)] px-2 py-1 text-[var(--color-text-secondary)]"
                style={{
                  cursor: currentIndex === total - 1 ? 'not-allowed' : 'pointer',
                  opacity: currentIndex === total - 1 ? 0.4 : 1,
                }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Side-by-side cards */}
          <div className="flex gap-4 flex-wrap">
            <TxCard tx={current.transactions[0]} label="Transaction 1" />
            <TxCard tx={current.transactions[1]} label="Transaction 2" />
          </div>
        </div>
      ) : null}

      <ModalFooter>
        {allDone || total === 0 ? (
          <Button variant="primary" onClick={handleClose}>
            Close
          </Button>
        ) : current ? (
          <div className="flex gap-2 flex-wrap w-full">
            <Button
              variant="secondary"
              disabled={isBusy}
              onClick={() =>
                dismissMutation.mutate({
                  transactionId1: current.transactions[0].id,
                  transactionId2: current.transactions[1].id,
                })
              }
            >
              Keep Both (Not a Duplicate)
            </Button>
            <Button
              variant="secondary"
              disabled={isBusy}
              onClick={() =>
                mergeMutation.mutate({
                  keepId: current.transactions[0].id,
                  removeId: current.transactions[1].id,
                })
              }
            >
              Merge (Keep First)
            </Button>
            <Button
              variant="secondary"
              disabled={isBusy}
              onClick={() =>
                mergeMutation.mutate({
                  keepId: current.transactions[1].id,
                  removeId: current.transactions[0].id,
                })
              }
            >
              Merge (Keep Second)
            </Button>
            <div className="ml-auto">
              <Button variant="ghost" onClick={handleClose}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </ModalFooter>

      <Modal
        open={dismissAllConfirm}
        onClose={() => setDismissAllConfirm(false)}
        title="Dismiss All Duplicate Reviews"
        size="sm"
      >
        <p className="text-sm text-[var(--color-text)]">
          Mark all {groups.length} visible duplicate review{groups.length !== 1 ? 's' : ''} as not duplicates?
        </p>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setDismissAllConfirm(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={dismissAllMutation.isPending}
            onClick={() => dismissAllMutation.mutate()}
          >
            Dismiss all
          </Button>
        </ModalFooter>
      </Modal>
    </Modal>
  );
}
