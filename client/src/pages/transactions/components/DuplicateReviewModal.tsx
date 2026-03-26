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
    <div
      style={{
        flex: '1 1 0',
        padding: '1rem',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <div
        style={{
          fontSize: '0.6875rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-muted)',
          marginBottom: '0.125rem',
        }}
      >
        {label}
      </div>

      {/* Merchant / description */}
      <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-text)' }}>
        {tx.merchantName}
      </div>

      {/* Amount */}
      <div
        style={{
          fontSize: '1.125rem',
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: tx.amount < 0 ? 'var(--color-danger)' : 'var(--color-success)',
        }}
      >
        {tx.amount < 0 ? '-' : '+'}
        {fmtCurrency(tx.amount)}
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
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
    <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8125rem' }}>
      <span style={{ color: 'var(--color-text-muted)', flexShrink: 0, minWidth: 60 }}>
        {label}
      </span>
      <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>{value}</span>
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

  const { data, isLoading } = useQuery<DuplicatesResponse>({
    queryKey: ['transactions', 'duplicates'],
    queryFn: () => api.get('/transactions/duplicates').then((r) => r.data),
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });

  const groups = data?.groups ?? [];
  const total = groups.length;
  const allDone = total > 0 && reviewedCount >= total;
  const current = groups[currentIndex];

  function advanceOrClose() {
    setReviewedCount((c) => c + 1);
    if (currentIndex < total - 1) {
      setCurrentIndex((i) => i + 1);
    }
  }

  const dismissMutation = useMutation({
    mutationFn: (ids: { transactionId1: string; transactionId2: string }) =>
      api.post('/transactions/duplicates/dismiss', ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', 'duplicates'] });
      advanceOrClose();
    },
    onError: (err: AxiosError<{ error: string }>) => {
      toast.error(err.response?.data?.error ?? 'Failed to dismiss');
    },
  });

  const mergeMutation = useMutation({
    mutationFn: (ids: { keepId: string; removeId: string }) =>
      api.post('/transactions/duplicates/merge', ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions', 'duplicates'] });
      advanceOrClose();
    },
    onError: (err: AxiosError<{ error: string }>) => {
      toast.error(err.response?.data?.error ?? 'Failed to merge');
    },
  });

  const isBusy = dismissMutation.isPending || mergeMutation.isPending;

  function handleClose() {
    setCurrentIndex(0);
    setReviewedCount(0);
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem 0' }}>
          <Skeleton height={20} width={200} />
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Skeleton height={160} style={{ flex: 1 }} />
            <Skeleton height={160} style={{ flex: 1 }} />
          </div>
        </div>
      ) : total === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '2rem 0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <CheckCircle size={40} style={{ color: 'var(--color-success)' }} />
          <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text)' }}>
            No duplicate transactions found
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            Your transactions look clean!
          </div>
        </div>
      ) : allDone ? (
        <div
          style={{
            textAlign: 'center',
            padding: '2rem 0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <CheckCircle size={40} style={{ color: 'var(--color-success)' }} />
          <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text)' }}>
            All duplicates reviewed!
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            You reviewed {reviewedCount} potential duplicate{reviewedCount !== 1 ? 's' : ''}.
          </div>
        </div>
      ) : current ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Header row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
              Reviewing{' '}
              <strong style={{ color: 'var(--color-text)' }}>
                {currentIndex + 1} of {total}
              </strong>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {/* Confidence badge */}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.25rem 0.625rem',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
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
                style={{
                  background: 'none',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.25rem 0.5rem',
                  cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
                  opacity: currentIndex === 0 ? 0.4 : 1,
                  color: 'var(--color-text-secondary)',
                }}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setCurrentIndex((i) => Math.min(total - 1, i + 1))}
                disabled={currentIndex === total - 1}
                style={{
                  background: 'none',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.25rem 0.5rem',
                  cursor: currentIndex === total - 1 ? 'not-allowed' : 'pointer',
                  opacity: currentIndex === total - 1 ? 0.4 : 1,
                  color: 'var(--color-text-secondary)',
                }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Side-by-side cards */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
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
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', width: '100%' }}>
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
            <div style={{ marginLeft: 'auto' }}>
              <Button variant="ghost" onClick={handleClose}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </ModalFooter>
    </Modal>
  );
}
