import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, Plus } from 'lucide-react';
import { Button, CategoryCombobox, notify } from '@/components/ui';
import { CreateCategoryInline } from './CreateCategoryInline';
import type { ReviewCategory } from '../types';

export interface ReviewTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  aiSuggestedCategoryId: string | null;
  aiSuggestedCategoryName: string | null;
  aiSuggestionConfidence: number | null;
  aiSuggestedCategory: { id: string; name: string; icon: string | null } | null;
  account: { name: string };
}

interface Props {
  transaction: ReviewTransaction;
  categories: ReviewCategory[];
  onConfirm: (
    transactionId: string,
    action: 'approve' | 'reject' | 'skip',
    categoryId?: string,
    createCategory?: { name: string; type: string; icon?: string | null }
  ) => Promise<void>;
  onCreateRule?: (pattern: string) => void;
}

function confidenceColor(confidence: number | null): string {
  if (confidence == null) return 'bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]';
  if (confidence >= 0.8) return 'bg-green-100 text-green-700';
  if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-700';
  return 'bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]';
}

export function ReviewTransactionRow({ transaction: txn, categories, onConfirm, onCreateRule }: Props) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'idle' | 'rejecting' | 'creating'>('idle');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [loading, setLoading] = useState(false);

  const isNoMatch = txn.aiSuggestedCategoryId === null;
  const confidence = txn.aiSuggestionConfidence;
  const formattedDate = new Date(txn.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(txn.amount));
  const isExpense = txn.amount < 0;


  const handleApprove = async () => {
    if (!txn.aiSuggestedCategoryId) return;
    setLoading(true);
    try {
      await onConfirm(txn.id, 'approve', txn.aiSuggestedCategoryId);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!selectedCategoryId) {
      notify.error('Please select a category');
      return;
    }
    setLoading(true);
    try {
      await onConfirm(txn.id, 'reject', selectedCategoryId);
      if (selectedCategoryId !== txn.aiSuggestedCategoryId) {
        onCreateRule?.(txn.description);
      }
    } finally {
      setLoading(false);
      setMode('idle');
    }
  };

  const handleCreateCategory = async (categoryId: string) => {
    setLoading(true);
    try {
      await onConfirm(txn.id, 'approve', categoryId);
    } finally {
      setLoading(false);
      setMode('idle');
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    try {
      await onConfirm(txn.id, 'skip');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)]">
      {/* Top row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[var(--color-text)] truncate">{txn.description}</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            {txn.account.name} · {formattedDate}
          </p>
        </div>
        <span className={`text-base font-semibold flex-shrink-0 ${isExpense ? 'text-red-500' : 'text-green-600'}`}>
          {isExpense ? '-' : '+'}{formattedAmount}
        </span>
      </div>

      {/* Suggestion row */}
      <div className="flex items-center justify-between mt-3 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {isNoMatch ? (
            <span className="text-sm text-[var(--color-text-secondary)]">
              AI suggests new category:{' '}
              <span className="font-medium text-[var(--color-text)]">"{txn.aiSuggestedCategoryName}"</span>
            </span>
          ) : (
            <>
              <span className="text-sm text-[var(--color-text-secondary)]">Suggested:</span>
              <span className="text-sm font-medium text-[var(--color-text)]">
                {txn.aiSuggestedCategory?.icon} {txn.aiSuggestedCategory?.name}
              </span>
              {confidence !== null && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${confidenceColor(confidence)}`}>
                  {Math.round(confidence * 100)}%
                </span>
              )}
            </>
          )}
        </div>

        {mode === 'idle' && (
          <div className="flex items-center gap-2">
            {!isNoMatch && (
              <Button size="sm" onClick={handleApprove} disabled={loading}>
                <Check size={14} className="mr-1" /> Approve
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setMode('rejecting')} disabled={loading}>
              <X size={14} className="mr-1" /> {isNoMatch ? 'Pick existing' : 'Reject'}
            </Button>
            {isNoMatch && (
              <Button size="sm" variant="ghost" onClick={() => setMode('creating')} disabled={loading}>
                <Plus size={14} className="mr-1" /> Create "{txn.aiSuggestedCategoryName}"
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={handleSkip} disabled={loading}>
              Skip
            </Button>
          </div>
        )}
      </div>

      {/* Reject — pick category */}
      {mode === 'rejecting' && (
        <div className="flex items-center gap-2 mt-3">
          <CategoryCombobox
            categories={categories}
            value={selectedCategoryId}
            onChange={setSelectedCategoryId}
            placeholder="Pick a category…"
            className="flex-1"
          />
          <Button size="sm" onClick={handleRejectConfirm} disabled={!selectedCategoryId || loading}>
            Apply
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode('idle')}>
            Cancel
          </Button>
        </div>
      )}

      {/* Create new category inline */}
      {mode === 'creating' && (
        <CreateCategoryInline
          suggestedName={txn.aiSuggestedCategoryName ?? ''}
          onCreated={handleCreateCategory}
          onCancel={() => setMode('idle')}
        />
      )}


    </div>
  );
}
