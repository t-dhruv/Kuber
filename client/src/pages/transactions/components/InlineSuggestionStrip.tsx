import { useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { notify, CategoryCombobox, type CategoryOption } from '@/components/ui';

interface Props {
  transactionId: string;
  aiSuggestedCategoryId: string | null;
  aiSuggestedCategoryName: string | null;
  aiSuggestionConfidence: number | null;
  currentCategoryId: string | null;
  categories: CategoryOption[];
  onDone: (transactionId: string) => void;
}

function confidencePill(confidence: number | null): { label: string; className: string } {
  if (confidence == null) return { label: '?%', className: 'bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]' };
  const pct = Math.round(confidence * 100);
  if (pct >= 80) return { label: `${pct}%`, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
  if (pct >= 60) return { label: `${pct}%`, className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' };
  return { label: `${pct}%`, className: 'bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]' };
}

export function InlineSuggestionStrip({
  transactionId,
  aiSuggestedCategoryId,
  aiSuggestedCategoryName,
  aiSuggestionConfidence,
  currentCategoryId,
  categories,
  onDone,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectCategoryId, setRejectCategoryId] = useState('');

  const pill = confidencePill(aiSuggestionConfidence);
  const displayName = aiSuggestedCategoryName ?? 'Unknown category';

  async function handleAccept() {
    if (!aiSuggestedCategoryId) return;
    setLoading(true);
    try {
      await api.post('/auto-categorize/confirm', {
        transactionId,
        action: 'approve',
        categoryId: aiSuggestedCategoryId,
      });
      onDone(transactionId);
    } catch {
      notify.error('Failed to accept suggestion');
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    if (currentCategoryId) {
      setLoading(true);
      try {
        await api.post('/auto-categorize/confirm', {
          transactionId,
          action: 'reject',
          categoryId: currentCategoryId,
        });
        onDone(transactionId);
      } catch {
        notify.error('Failed to reject suggestion');
      } finally {
        setLoading(false);
      }
    } else {
      setRejectMode(true);
    }
  }

  async function submitRejectWithCategory() {
    if (!rejectCategoryId) {
      notify.error('Select a category first');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auto-categorize/confirm', {
        transactionId,
        action: 'reject',
        categoryId: rejectCategoryId,
      });
      onDone(transactionId);
    } catch {
      notify.error('Failed to reject suggestion');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-1 px-3 py-2 rounded-[var(--radius-md)] bg-[var(--color-surface-hover)] border border-[var(--color-border)] flex flex-col gap-2 text-sm">
      {!rejectMode ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[var(--color-text-muted)]">AI suggested:</span>
          <span className="font-medium text-[var(--color-text)]">{displayName}</span>
          <span className={`text-[0.6875rem] font-semibold py-0.5 px-1.5 rounded-[var(--radius-full)] ${pill.className}`}>
            {pill.label}
          </span>
          <div className="flex gap-1 ml-auto">
            <button
              onClick={handleAccept}
              disabled={loading || !aiSuggestedCategoryId}
              className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-sm)] text-[0.75rem] font-medium bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Accept
            </button>
            <button
              onClick={handleReject}
              disabled={loading}
              className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-sm)] text-[0.75rem] font-medium bg-[var(--color-surface)] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
              Reject
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[var(--color-text-muted)] shrink-0">Choose correct category:</span>
          <div className="flex-1 min-w-[160px]">
            <CategoryCombobox
              categories={categories}
              value={rejectCategoryId}
              onChange={setRejectCategoryId}
              placeholder="Select category…"
            />
          </div>
          <div className="flex gap-1">
            <button
              onClick={submitRejectWithCategory}
              disabled={loading || !rejectCategoryId}
              className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-sm)] text-[0.75rem] font-medium bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Confirm
            </button>
            <button
              onClick={() => setRejectMode(false)}
              disabled={loading}
              className="px-2 py-1 rounded-[var(--radius-sm)] text-[0.75rem] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
