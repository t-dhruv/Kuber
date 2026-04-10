import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, SlidersHorizontal, Plus, ChevronRight, RotateCcw, X, Check,
  ChevronLeft, ChevronRight as ChevronRightIcon, Upload, Scissors, Sparkles, Camera, ArrowLeftRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  Button, Input, Select, Modal, ModalFooter, Skeleton, Badge, Toggle, Card, notify, ConfirmDialog,
} from '@/components/ui';
import { ImportModal } from './components/ImportModal';
import { SplitTransactionModal } from './components/SplitTransactionModal';
import { DuplicateReviewModal } from './components/DuplicateReviewModal';
import { ReceiptOcrModal } from './components/ReceiptOcrModal';
import { AiSetupNudge } from '@/components/ui/AiSetupNudge';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  name: string;
  lastFour?: string;
  institutionName?: string;
}

interface Category {
  id: string;
  name: string;
  emoji?: string | null;
  type: string;
  groupId?: string | null;
  groupName?: string | null;
}

interface Tag {
  id: string;
  name: string;
}

interface Transaction {
  id: string;
  merchantName: string;
  categoryId: string;
  categoryName: string;
  categoryColor?: string;
  categoryIcon?: string;
  accountId: string;
  accountName: string;
  accountLastFour?: string;
  amount: number;
  date: string;
  notes?: string;
  tags: Tag[];
  isRecurring: boolean;
  needsReview: boolean;
  isHidden: boolean;
  isPending: boolean;
  isSplit: boolean;
  splitDetails?: Array<{ categoryId: string; amount: number; note?: string }> | null;
  isTransfer: boolean;
  transferId?: string | null;
}

interface TransactionListResponse {
  transactions: Transaction[];
  total: number;
  page: number;
  totalPages: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(amount));

function fmtGroupDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtInputDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function merchantInitial(name: string) {
  return (name ?? '?')[0].toUpperCase();
}

// ─── Group transactions by date ───────────────────────────────────────────────

function groupByDate(txns: Transaction[]): { date: string; transactions: Transaction[]; dayTotal: number }[] {
  const map = new Map<string, Transaction[]>();
  for (const txn of txns) {
    const key = txn.date.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(txn);
  }
  return Array.from(map.entries()).map(([date, transactions]) => ({
    date,
    transactions,
    dayTotal: transactions.reduce((sum, t) => sum + t.amount, 0),
  }));
}

// ─── Category Picker ──────────────────────────────────────────────────────────

function CategoryPicker({
  categories,
  selectedId,
  onSelect,
}: {
  categories: Category[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );
  const groups = Array.from(new Set(filtered.map((c) => c.groupName ?? 'Other')));

  return (
    <div>
      <div className="mb-2">
        <Input
          placeholder="Search categories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search size={14} />}
        />
      </div>
      <div className="flex flex-col gap-3 overflow-y-auto max-h-[220px]">
        {groups.map((group) => (
          <div key={group}>
            <div className="text-[0.6875rem] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.06em] px-1 mb-1">
              {group}
            </div>
            {filtered.filter((c) => (c.groupName ?? 'Other') === group).map((cat) => (
              <button
                key={cat.id}
                onClick={() => onSelect(cat.id)}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-[var(--radius-sm)] border-none cursor-pointer text-left"
                style={{
                  backgroundColor: selectedId === cat.id ? 'var(--color-accent-light)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (selectedId !== cat.id) e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
                }}
                onMouseLeave={(e) => {
                  if (selectedId !== cat.id) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span className="w-6 h-6 rounded-[var(--radius-full)] bg-[var(--color-accent)] flex items-center justify-center text-xs shrink-0">
                  {cat.emoji ?? cat.name[0]}
                </span>
                <span className={`text-sm text-[var(--color-text)] ${selectedId === cat.id ? 'font-semibold' : 'font-normal'}`}>
                  {cat.name}
                </span>
                {selectedId === cat.id && <Check size={14} className="ml-auto text-[var(--color-accent)]" />}
              </button>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="p-4 text-center text-[var(--color-text-muted)] text-sm">
            No categories found
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Transaction Detail Drawer ────────────────────────────────────────────────

interface DrawerProps {
  transaction: Transaction | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}

function TransactionDrawer({ transaction, categories, onClose, onSaved }: DrawerProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Partial<Transaction> & { tagInput?: string }>({});
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [tagInput, setTagInput] = useState('');

  // Sync form when transaction changes
  useEffect(() => {
    if (transaction) {
      setForm({ ...transaction });
      setShowCategoryPicker(false);
      setTagInput('');
    }
  }, [transaction?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMutation = useMutation({
    mutationFn: async () => {
      // 1. Save core fields
      await api.put(`/transactions/${transaction!.id}`, {
        merchantName: form.merchantName,
        date: form.date,
        amount: form.amount,
        categoryId: form.categoryId,
        notes: form.notes,
        needsReview: form.needsReview,
        isRecurring: form.isRecurring,
        isHidden: form.isHidden,
      });

      // 2. Sync tags
      const originalTagIds = new Set((transaction!.tags ?? []).map((t) => t.id));
      const formTags = form.tags ?? [];

      // Resolve new tags (id starts with 'new-') — create them first
      const resolvedTags: Tag[] = [];
      for (const tag of formTags) {
        if (tag.id.startsWith('new-')) {
          const created = await api.post('/settings/tags', { name: tag.name });
          resolvedTags.push({ id: created.data.id, name: created.data.name });
        } else {
          resolvedTags.push(tag);
        }
      }

      const resolvedTagIds = new Set(resolvedTags.map((t) => t.id));

      // Add tags not in original
      const toAdd = resolvedTags.filter((t) => !originalTagIds.has(t.id)).map((t) => t.id);
      if (toAdd.length > 0) {
        await api.post(`/transactions/${transaction!.id}/tags`, { tagIds: toAdd });
      }

      // Remove tags not in new set
      const toRemove = [...originalTagIds].filter((id) => !resolvedTagIds.has(id));
      for (const tagId of toRemove) {
        await api.delete(`/transactions/${transaction!.id}/tags/${tagId}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      onSaved();
    },
    onError: (err: any) => notify.error(err?.response?.data?.error ?? 'Failed to save transaction'),
  });

  const [confirmDelete, setConfirmDelete] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/transactions/${transaction!.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      onClose();
    },
    onError: () => notify.error('Failed to delete transaction'),
  });

  const selectedCategory = categories.find((c) => c.id === form.categoryId);

  function addTag(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (form.tags?.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) return;
    setForm((f) => ({ ...f, tags: [...(f.tags ?? []), { id: `new-${Date.now()}`, name: trimmed }] }));
    setTagInput('');
  }

  function removeTag(id: string) {
    setForm((f) => ({ ...f, tags: (f.tags ?? []).filter((t) => t.id !== id) }));
  }

  const open = !!transaction;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 bottom-0 w-full sm:w-[380px] z-50 bg-[var(--color-surface)] border-l border-[var(--color-border)] shadow-[var(--shadow-lg)] flex flex-col overflow-y-auto transition-transform duration-[250ms] ease-[ease]"
        style={{ transform: open ? 'translateX(0)' : 'translateX(100%)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] shrink-0">
          <h2 className="text-base font-semibold text-[var(--color-text)] m-0">
            Transaction Details
          </h2>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none cursor-pointer text-[var(--color-text-muted)] p-1">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        {transaction && (
          <div className="p-5 flex flex-col gap-4 flex-1">
            {/* Merchant */}
            <Input
              label="Merchant"
              value={form.merchantName ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, merchantName: e.target.value }))}
            />

            {/* Date */}
            <Input
              label="Date"
              type="date"
              value={fmtInputDate(form.date ?? '')}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />

            {/* Amount */}
            <Input
              label="Amount"
              type="number"
              step="0.01"
              value={form.amount ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
            />

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                Category
              </label>
              <button
                onClick={() => setShowCategoryPicker((v) => !v)}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] cursor-pointer text-left"
              >
                {selectedCategory ? (
                  <>
                    <span className="w-[22px] h-[22px] rounded-[var(--radius-full)] bg-[var(--color-accent)] flex items-center justify-center text-[0.6875rem] shrink-0">
                      {selectedCategory.emoji ?? selectedCategory.name[0]}
                    </span>
                    <span className="text-sm text-[var(--color-text)] flex-1">{selectedCategory.name}</span>
                  </>
                ) : (
                  <span className="text-sm text-[var(--color-text-muted)] flex-1">Select category...</span>
                )}
                <ChevronRightIcon
                  size={14}
                  className="text-[var(--color-text-muted)] transition-transform duration-[150ms]"
                  style={{ transform: showCategoryPicker ? 'rotate(90deg)' : 'none' }}
                />
              </button>
              {showCategoryPicker && (
                <div className="mt-2 border border-[var(--color-border)] rounded-[var(--radius-md)] p-2">
                  <CategoryPicker
                    categories={categories}
                    selectedId={form.categoryId ?? ''}
                    onSelect={(id) => { setForm((f) => ({ ...f, categoryId: id })); setShowCategoryPicker(false); }}
                  />
                </div>
              )}
            </div>

            {/* Account (read-only) */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                Account
              </label>
              <div className="px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text-secondary)]">
                {transaction.accountName}{transaction.accountLastFour ? ` ••${transaction.accountLastFour}` : ''}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                Notes
              </label>
              <textarea
                value={form.notes ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-sm resize-y font-[inherit] box-border"
                placeholder="Add a note..."
              />
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                Tags
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(form.tags ?? []).map((tag) => (
                  <span key={tag.id} className="inline-flex items-center gap-1 py-0.5 pr-2 pl-2.5 rounded-[var(--radius-full)] bg-[var(--color-accent-light)] text-[var(--color-accent)] text-xs font-medium">
                    {tag.name}
                    <button onClick={() => removeTag(tag.id)} aria-label={`Remove tag ${tag.name}`} className="bg-transparent border-none cursor-pointer p-0 text-[inherit] flex items-center">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }}
                  placeholder="Add tag..."
                  className="flex-1 px-2.5 py-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-[0.8125rem] font-[inherit]"
                />
                <Button variant="secondary" size="sm" onClick={() => addTag(tagInput)}>Add</Button>
              </div>
            </div>

            {/* Toggles */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--color-text)]">Needs Review</span>
                <Toggle
                  id="txn-needs-review"
                  checked={form.needsReview ?? false}
                  onChange={(e) => setForm((f) => ({ ...f, needsReview: e.target.checked }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--color-text)]">Is Recurring</span>
                <Toggle
                  id="txn-is-recurring"
                  checked={form.isRecurring ?? false}
                  onChange={(e) => setForm((f) => ({ ...f, isRecurring: e.target.checked }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--color-text)]">Hide from reports</span>
                <Toggle
                  id="txn-is-hidden"
                  checked={form.isHidden ?? false}
                  onChange={(e) => setForm((f) => ({ ...f, isHidden: e.target.checked }))}
                />
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {transaction && (
          <div className="px-5 py-4 border-t border-[var(--color-border)] flex gap-2 shrink-0">
            <Button
              variant="primary"
              loading={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="flex-1"
            >
              Save
            </Button>
            <Button
              variant="danger"
              loading={deleteMutation.isPending}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete Transaction"
        message={<>Delete <strong>{transaction?.merchantName}</strong>? This cannot be undone.</>}
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
      />
    </>
  );
}

// ─── Add Transaction Modal ────────────────────────────────────────────────────

interface AddModalProps {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  categories: Category[];
}

function AddTransactionModal({ open, onClose, accounts, categories }: AddModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    date: fmtInputDate(new Date().toISOString()),
    description: '',
    amount: '',
    accountId: '',
    categoryId: '',
    notes: '',
  });

  const mutation = useMutation({
    mutationFn: () => api.post('/transactions', {
      ...form,
      amount: parseFloat(form.amount) || 0,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      onClose();
      setForm({ date: fmtInputDate(new Date().toISOString()), description: '', amount: '', accountId: '', categoryId: '', notes: '' });
    },
    onError: (err: any) => notify.error(err?.response?.data?.error ?? 'Failed to add transaction'),
  });

  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: `${a.name}${a.lastFour ? ` ••${a.lastFour}` : ''}`,
  }));

  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: `${c.emoji ?? ''} ${c.name}`.trim(),
  }));

  return (
    <Modal open={open} onClose={onClose} title="Add Transaction" size="md">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Date"
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          />
          <div>
            <Input
              label="Amount"
              type="number"
              step="0.01"
              placeholder="-45.00"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
            <p className="text-xs text-[color:var(--color-text-muted)] mt-1">
              Negative = expense, positive = income
            </p>
          </div>
        </div>
        <Input
          label="Merchant / Description"
          placeholder="e.g. Whole Foods Market"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
        <Select
          label="Account"
          options={accountOptions}
          placeholder="Select account..."
          value={form.accountId}
          onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
        />
        <Select
          label="Category"
          options={categoryOptions}
          placeholder="Select category..."
          value={form.categoryId}
          onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
        />
        <div>
          <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
            Notes
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
            placeholder="Optional notes..."
            className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-sm resize-y font-[inherit] box-border"
          />
        </div>
      </div>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
          disabled={!form.description || !form.amount || !form.accountId}
        >
          Add Transaction
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ─── Filters Panel ────────────────────────────────────────────────────────────

interface FiltersPanelProps {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  categories: Category[];
  searchParams: URLSearchParams;
  setSearchParams: (params: URLSearchParams) => void;
}

function FiltersPanel({ open, onClose, accounts, categories, searchParams, setSearchParams }: FiltersPanelProps) {
  const [localAccountId, setLocalAccountId] = useState(searchParams.get('accountId') ?? '');
  const [localCategoryIds, setLocalCategoryIds] = useState<string[]>(
    searchParams.getAll('categoryId')
  );
  const [localMinAmount, setLocalMinAmount] = useState(searchParams.get('minAmount') ?? '');
  const [localMaxAmount, setLocalMaxAmount] = useState(searchParams.get('maxAmount') ?? '');
  const [localNeedsReview, setLocalNeedsReview] = useState(searchParams.get('needsReview') === 'true');
  const [localRecurring, setLocalRecurring] = useState(searchParams.get('recurring') === 'true');
  const [localHidden, setLocalHidden] = useState(searchParams.get('hidden') === 'true');
  const [localType, setLocalType] = useState<'all' | 'income' | 'expense'>(
    (searchParams.get('type') as 'income' | 'expense' | null) ?? 'all'
  );
  const [localPending, setLocalPending] = useState(searchParams.get('pending') === 'true');
  const [localFrom, setLocalFrom] = useState(searchParams.get('from') ?? '');
  const [localTo, setLocalTo] = useState(searchParams.get('to') ?? '');

  function applyFilters() {
    const next = new URLSearchParams(searchParams);
    next.delete('accountId');
    next.delete('categoryId');
    next.delete('minAmount');
    next.delete('maxAmount');
    next.delete('needsReview');
    next.delete('recurring');
    next.delete('hidden');
    next.delete('type');
    next.delete('pending');
    next.delete('from');
    next.delete('to');
    next.set('page', '1');

    if (localAccountId) next.set('accountId', localAccountId);
    localCategoryIds.forEach((id) => next.append('categoryId', id));
    if (localMinAmount) next.set('minAmount', localMinAmount);
    if (localMaxAmount) next.set('maxAmount', localMaxAmount);
    if (localNeedsReview) next.set('needsReview', 'true');
    if (localRecurring) next.set('recurring', 'true');
    if (localHidden) next.set('hidden', 'true');
    if (localType !== 'all') next.set('type', localType);
    if (localPending) next.set('pending', 'true');
    if (localFrom) next.set('from', localFrom);
    if (localTo) next.set('to', localTo);

    setSearchParams(next);
    onClose();
  }

  function clearFilters() {
    setLocalAccountId('');
    setLocalCategoryIds([]);
    setLocalMinAmount('');
    setLocalMaxAmount('');
    setLocalNeedsReview(false);
    setLocalRecurring(false);
    setLocalHidden(false);
    setLocalType('all');
    setLocalPending(false);
    setLocalFrom('');
    setLocalTo('');
  }

  function toggleCategory(id: string) {
    setLocalCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/[0.15] z-30"
          onClick={onClose}
        />
      )}
      <div
        className="fixed top-0 right-0 bottom-0 w-full sm:w-[320px] z-[35] bg-[var(--color-surface)] border-l border-[var(--color-border)] shadow-[var(--shadow-lg)] flex flex-col overflow-y-auto transition-transform duration-[250ms] ease-[ease]"
        style={{ transform: open ? 'translateX(0)' : 'translateX(100%)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] shrink-0">
          <h2 className="text-base font-semibold text-[var(--color-text)] m-0">Filters</h2>
          <button onClick={onClose} aria-label="Close filters" className="bg-transparent border-none cursor-pointer text-[var(--color-text-muted)] p-1">
            <X size={18} />
          </button>
        </div>

        {/* Filter sections */}
        <div className="p-5 flex flex-col gap-6 flex-1">
          {/* Date Range */}
          <div>
            <div className="text-[0.8125rem] font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em] mb-2">
              Date Range
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">From</label>
                <input
                  type="date"
                  value={localFrom}
                  onChange={(e) => setLocalFrom(e.target.value)}
                  className="w-full px-2 py-[0.4rem] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-[0.8125rem] font-[inherit] box-border"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">To</label>
                <input
                  type="date"
                  value={localTo}
                  onChange={(e) => setLocalTo(e.target.value)}
                  className="w-full px-2 py-[0.4rem] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-[0.8125rem] font-[inherit] box-border"
                />
              </div>
            </div>
          </div>

          {/* Account */}
          <div>
            <div className="text-[0.8125rem] font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em] mb-2">
              Account
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={localAccountId === ''} onChange={() => setLocalAccountId('')} className="accent-[var(--color-accent)]" />
                <span className="text-sm text-[var(--color-text)]">All accounts</span>
              </label>
              {accounts.map((acc) => (
                <label key={acc.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={localAccountId === acc.id} onChange={() => setLocalAccountId(acc.id)} className="accent-[var(--color-accent)]" />
                  <span className="text-sm text-[var(--color-text)]">
                    {acc.name}{acc.lastFour ? ` ••${acc.lastFour}` : ''}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div>
            <div className="text-[0.8125rem] font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em] mb-2">
              Categories
            </div>
            <div className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto">
              {categories.map((cat) => (
                <label key={cat.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localCategoryIds.includes(cat.id)}
                    onChange={() => toggleCategory(cat.id)}
                    className="accent-[var(--color-accent)]"
                  />
                  <span className="text-xs">{cat.emoji ?? ''}</span>
                  <span className="text-sm text-[var(--color-text)]">{cat.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Amount range */}
          <div>
            <div className="text-[0.8125rem] font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em] mb-2">
              Amount Range
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Min"
                type="number"
                value={localMinAmount}
                onChange={(e) => setLocalMinAmount(e.target.value)}
              />
              <Input
                placeholder="Max"
                type="number"
                value={localMaxAmount}
                onChange={(e) => setLocalMaxAmount(e.target.value)}
              />
            </div>
          </div>

          {/* Type filter pills */}
          <div>
            <div className="text-[0.8125rem] font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em] mb-2">
              Type
            </div>
            <div className="flex gap-1.5">
              {(['all', 'income', 'expense'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setLocalType(t)}
                  className="flex-1 py-1.5 rounded-[var(--radius-full)] border border-[var(--color-border)] cursor-pointer text-[0.8125rem] font-medium transition-[background-color,color] duration-[150ms]"
                  style={{
                    backgroundColor: localType === t ? 'var(--color-accent)' : 'var(--color-surface)',
                    color: localType === t ? '#fff' : 'var(--color-text-secondary)',
                  }}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div>
            <div className="text-[0.8125rem] font-semibold text-[var(--color-text-secondary)] uppercase tracking-[0.04em] mb-2.5">
              Other
            </div>
            <div className="flex flex-col gap-3">
              {[
                { label: 'Needs Review only', value: localNeedsReview, onChange: setLocalNeedsReview },
                { label: 'Recurring only', value: localRecurring, onChange: setLocalRecurring },
                { label: 'Show Hidden', value: localHidden, onChange: setLocalHidden },
                { label: 'Include Pending', value: localPending, onChange: setLocalPending },
              ].map(({ label, value, onChange }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-sm text-[var(--color-text)]">{label}</span>
                  <Toggle checked={value} onChange={(e) => onChange(e.target.checked)} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--color-border)] flex gap-2 shrink-0">
          <Button variant="secondary" onClick={clearFilters} className="flex-1">Clear</Button>
          <Button variant="primary" onClick={applyFilters} className="flex-1">Apply</Button>
        </div>
      </div>
    </>
  );
}

// ─── Bulk Actions Bar ─────────────────────────────────────────────────────────

interface BulkActionsBarProps {
  count: number;
  categories: Category[];
  onRecategorize: (categoryId: string) => void;
  onMarkReviewed: () => void;
  onHide: () => void;
  onDelete: () => void;
  onClear: () => void;
}

function BulkActionsBar({ count, categories, onRecategorize, onMarkReviewed, onHide, onDelete, onClear }: BulkActionsBarProps) {
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="sticky top-0 z-20 bg-[var(--color-accent)] px-4 py-2.5 flex items-center gap-2 rounded-[var(--radius-md)] mb-2 flex-wrap">
      <span className="text-sm font-semibold text-white mr-auto">
        {count} selected
      </span>

      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => setShowCategoryPicker((v) => !v)}
          className="bg-white/20 border-none cursor-pointer text-white px-3 py-1.5 rounded-[var(--radius-sm)] text-[0.8125rem] font-medium"
        >
          Recategorize
        </button>
        {showCategoryPicker && (
          <div className="absolute top-full left-0 mt-1.5 w-[260px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)] p-2 z-10">
            <CategoryPicker
              categories={categories}
              selectedId=""
              onSelect={(id) => { onRecategorize(id); setShowCategoryPicker(false); }}
            />
          </div>
        )}
      </div>

      {[
        { label: 'Mark Reviewed', action: onMarkReviewed },
        { label: 'Hide', action: onHide },
        { label: 'Delete', action: onDelete },
      ].map(({ label, action }) => (
        <button
          key={label}
          onClick={action}
          className="bg-white/20 border-none cursor-pointer text-white px-3 py-1.5 rounded-[var(--radius-sm)] text-[0.8125rem] font-medium"
        >
          {label}
        </button>
      ))}

      <button onClick={onClear} aria-label="Clear filters" className="bg-transparent border-none cursor-pointer text-white/80 p-1">
        <X size={16} />
      </button>
    </div>
  );
}

// ─── Transaction Row ──────────────────────────────────────────────────────────

interface TransactionRowProps {
  txn: Transaction;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onOpen: (txn: Transaction) => void;
  onMerchantEdit: (id: string, merchant: string) => void;
  onSplit: (txn: Transaction) => void;
}

function TransactionRow({ txn, selected, onSelect, onOpen, onMerchantEdit, onSplit }: TransactionRowProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(txn.merchantName);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setEditing(true);
    setEditValue(txn.merchantName);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commitEdit() {
    setEditing(false);
    if (editValue.trim() && editValue !== txn.merchantName) {
      onMerchantEdit(txn.id, editValue.trim());
    }
  }

  return (
    <div
      className="flex items-center h-[52px] px-3 gap-3 cursor-default"
      style={{ backgroundColor: selected ? 'var(--color-accent-light)' : 'transparent' }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)'; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.backgroundColor = selected ? 'var(--color-accent-light)' : 'transparent'; }}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => onSelect(txn.id, e.target.checked)}
        className="accent-[var(--color-accent)] shrink-0 cursor-pointer"
      />

      {/* Category circle */}
      <div
        className="w-8 h-8 rounded-[var(--radius-full)] shrink-0 flex items-center justify-center text-white text-xs font-bold"
        style={{ backgroundColor: txn.categoryColor ?? 'var(--color-accent)' }}
      >
        {txn.categoryIcon ?? merchantInitial(txn.merchantName)}
      </div>

      {/* Merchant name */}
      <div className="flex-[1_1_180px] min-w-0" onDoubleClick={startEdit}>
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
            className="text-sm font-medium text-[var(--color-text)] border border-[var(--color-accent)] rounded-[var(--radius-sm)] py-0.5 px-1.5 bg-[var(--color-surface)] font-[inherit] w-full"
          />
        ) : (
          <div className="text-sm font-medium text-[var(--color-text)] whitespace-nowrap overflow-hidden text-ellipsis">
            {txn.merchantName}
          </div>
        )}
      </div>

      {/* Category name — hidden on mobile */}
      <div className="hidden sm:block flex-[0_0_130px] text-[0.8125rem] text-[var(--color-text-secondary)] whitespace-nowrap overflow-hidden text-ellipsis">
        {txn.categoryName}
      </div>

      {/* Account — hidden on mobile and tablet */}
      <div className="hidden md:block flex-[0_0_150px] text-[0.8125rem] text-[var(--color-text-muted)] whitespace-nowrap overflow-hidden text-ellipsis">
        {txn.accountName}{txn.accountLastFour ? ` ••${txn.accountLastFour}` : ''}
      </div>

      {/* Badges — hidden on mobile */}
      <div className="hidden sm:flex gap-1 flex-[0_0_auto]">
        {txn.isRecurring && (
          <span title="Recurring" className="text-[var(--color-info)] text-sm">
            <RotateCcw size={13} />
          </span>
        )}
        {txn.needsReview && (
          <span className="text-[0.6875rem] font-semibold py-0.5 px-1.5 rounded-[var(--radius-full)] bg-[var(--color-warning-light)] text-[var(--color-warning)]">
            Review
          </span>
        )}
        {txn.isPending && (
          <span className="text-[0.6875rem] font-semibold py-0.5 px-1.5 rounded-[var(--radius-full)] bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
            Pending
          </span>
        )}
        {txn.isSplit && (
          <span className="text-[0.6875rem] font-semibold py-0.5 px-1.5 rounded-[var(--radius-full)] bg-[var(--color-accent-light)] text-[var(--color-accent)]">
            Split
          </span>
        )}
        {txn.isTransfer && (
          <span className="text-[0.6875rem] font-semibold py-0.5 px-1.5 rounded-[var(--radius-full)] bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
            Transfer
          </span>
        )}
      </div>

      {/* Split button — hidden on mobile */}
      <button
        className="hidden sm:flex items-center gap-1 bg-transparent border-none cursor-pointer p-1 shrink-0"
        onClick={(e) => { e.stopPropagation(); onSplit(txn); }}
        title={txn.isSplit ? 'Edit split' : 'Split transaction'}
        style={{ color: txn.isSplit ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
      >
        <Scissors size={14} />
      </button>

      {/* Amount */}
      <div
        className="flex-[0_0_90px] text-right text-sm font-semibold [font-variant-numeric:tabular-nums]"
        style={{ color: txn.amount < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}
      >
        {txn.amount < 0 ? '-' : '+'}{fmtCurrency(txn.amount)}
      </div>

      {/* Arrow */}
      <button
        onClick={() => onOpen(txn)}
        className="bg-transparent border-none cursor-pointer text-[var(--color-text-muted)] p-1 shrink-0"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between py-3 border-t border-[var(--color-border)]">
      <span className="text-[0.8125rem] text-[var(--color-text-muted)]">
        Showing {start}–{end} of {total} transactions
      </span>
      <div className="flex gap-1 items-center">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="bg-transparent border border-[var(--color-border)] rounded-[var(--radius-sm)] px-2 py-1 text-[var(--color-text-secondary)]"
          style={{ cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.4 : 1 }}
        >
          <ChevronLeft size={14} />
        </button>
        {pages.map((p, i) => (
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="px-1 text-[var(--color-text-muted)] text-sm">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p as number)}
              className="min-w-8 px-2 py-1 rounded-[var(--radius-sm)] text-[0.8125rem] cursor-pointer"
              style={{
                border: p === page ? 'none' : '1px solid var(--color-border)',
                backgroundColor: p === page ? 'var(--color-accent)' : 'transparent',
                color: p === page ? '#fff' : 'var(--color-text-secondary)',
                fontWeight: p === page ? 600 : 400,
              }}
            >
              {p}
            </button>
          )
        ))}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className="bg-transparent border border-[var(--color-border)] rounded-[var(--radius-sm)] px-2 py-1 text-[var(--color-text-secondary)]"
          style={{ cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.4 : 1 }}
        >
          <ChevronRightIcon size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Transfer Modal ───────────────────────────────────────────────────────────

interface TransferModalProps {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
}

function TransferModal({ open, onClose, accounts }: TransferModalProps) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }));

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/transactions/transfer', {
        fromAccountId,
        toAccountId,
        amount: parseFloat(amount),
        date,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      notify.success('Transfer recorded');
      onClose();
      setFromAccountId('');
      setToAccountId('');
      setAmount('');
      setDate(today);
      setNotes('');
    },
    onError: (err: any) => {
      notify.error(err?.response?.data?.error ?? 'Transfer failed');
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Record Transfer" size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="flex flex-col gap-4 p-1">
          <Select
            label="From Account"
            value={fromAccountId}
            onChange={(e) => setFromAccountId(e.target.value)}
            options={accountOptions}
            placeholder="Select account…"
          />
          <Select
            label="To Account"
            value={toAccountId}
            onChange={(e) => setToAccountId(e.target.value)}
            options={accountOptions}
            placeholder="Select account…"
          />
          <Input
            label="Amount"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Input
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add a note…"
          />
        </div>
        <ModalFooter>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            type="submit"
            loading={mutation.isPending}
            disabled={!fromAccountId || !toAccountId || !amount || !date}
          >
            Record Transfer
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerTxn, setDrawerTxn] = useState<Transaction | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showAutoCatPanel, setShowAutoCatPanel] = useState(false);
  const [splitTxn, setSplitTxn] = useState<Transaction | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const search = searchParams.get('search') ?? '';

  // ── Data queries ──

  const { data: txnData, isLoading: txnsLoading } = useQuery<TransactionListResponse>({
    queryKey: ['transactions', Object.fromEntries(searchParams)],
    queryFn: () => api.get('/transactions?' + searchParams.toString()).then((r) => r.data),
  });

  const { data: accountsData } = useQuery<{ groups: { type: string; totalBalance: number; accounts: Account[] }[] }>({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts').then((r) => r.data),
  });

  const { data: categoriesData } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => r.data),
  });

  const { data: duplicatesData } = useQuery<{ count: number }>({
    queryKey: ['transactions', 'duplicates', 'count'],
    queryFn: () =>
      api.get('/transactions/duplicates').then((r) => ({ count: r.data.count as number })),
    staleTime: 5 * 60 * 1000,
  });

  const duplicateCount = duplicatesData?.count ?? 0;

  // ── Auto-categorize ──

  const { data: autoCatStatus, refetch: refetchAutoCatStatus, isFetching: autoCatStatusFetching } = useQuery<{
    configured: boolean;
    notConfigured?: boolean;
    uncategorizedCount: number;
  }>({
    queryKey: ['auto-categorize-status'],
    queryFn: () => api.get('/auto-categorize/status').then((r) => r.data),
    enabled: false,
  });

  const autoCatMutation = useMutation({
    mutationFn: () => api.post('/auto-categorize/batch').then((r) => r.data as { updated: number }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setShowAutoCatPanel(false);
      notify.success(`Updated ${data.updated} transaction${data.updated !== 1 ? 's' : ''}`);
    },
    onError: () => notify.error('Auto-categorize failed. Please try again.'),
  });

  const accounts = accountsData?.groups?.flatMap((g) => g.accounts) ?? [];
  const categories = categoriesData ?? [];
  const transactions: Transaction[] = txnData?.transactions ?? [];
  const total = txnData?.total ?? 0;

  // ── URL param helpers ──

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.set('page', '1');
    setSearchParams(next);
  }

  function setPage(p: number) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(p));
    setSearchParams(next);
  }

  // ── Selection ──

  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map((t) => t.id)));
    }
  }

  // ── Bulk mutations ──

  const bulkRecategorizeMutation = useMutation({
    mutationFn: (categoryId: string) =>
      api.post('/transactions/bulk', { action: 'recategorize', ids: Array.from(selectedIds), categoryId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['transactions'] }); setSelectedIds(new Set()); },
  });

  const bulkMarkReviewedMutation = useMutation({
    mutationFn: () =>
      api.post('/transactions/bulk', { action: 'mark-reviewed', ids: Array.from(selectedIds) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['transactions'] }); setSelectedIds(new Set()); },
  });

  const bulkHideMutation = useMutation({
    mutationFn: () =>
      api.post('/transactions/bulk', { action: 'hide', ids: Array.from(selectedIds) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['transactions'] }); setSelectedIds(new Set()); },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: () =>
      api.post('/transactions/bulk', { action: 'delete', ids: Array.from(selectedIds) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['transactions'] }); setSelectedIds(new Set()); },
  });

  // ── Inline merchant edit ──

  const merchantEditMutation = useMutation({
    mutationFn: ({ id, merchantName }: { id: string; merchantName: string }) =>
      api.put(`/transactions/${id}`, { description: merchantName }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['transactions'] }),
  });

  const handleMerchantEdit = useCallback((id: string, merchantName: string) => {
    merchantEditMutation.mutate({ id, merchantName });
  }, [merchantEditMutation]);

  // ── Active filter count ──

  const activeFilterCount = [
    searchParams.get('accountId'),
    ...searchParams.getAll('categoryId'),
    searchParams.get('minAmount'),
    searchParams.get('maxAmount'),
    searchParams.get('needsReview'),
    searchParams.get('recurring'),
    searchParams.get('hidden'),
    searchParams.get('type'),
    searchParams.get('pending'),
    searchParams.get('from'),
    searchParams.get('to'),
  ].filter(Boolean).length;

  const groups = groupByDate(transactions);
  const allSelected = transactions.length > 0 && selectedIds.size === transactions.length;
  const someSelected = selectedIds.size > 0;

  return (
    <div className="py-4 flex flex-col gap-3">
      {/* Page header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-[1.375rem] font-bold text-[var(--color-text)] m-0 mr-auto">
          Transactions
        </h1>

        {/* Search — full width on mobile */}
        <div className="w-full sm:w-60">
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setParam('search', e.target.value)}
            leftIcon={<Search size={14} />}
          />
        </div>

        {/* Date range — hidden on mobile, shown on sm+ */}
        <div className="hidden sm:flex items-center gap-1.5">
          <input
            type="date"
            value={searchParams.get('startDate') ?? ''}
            onChange={(e) => setParam('startDate', e.target.value)}
            className="px-2.5 py-[0.4rem] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-[0.8125rem] font-[inherit]"
          />
          <span className="text-[var(--color-text-muted)] text-[0.8125rem]">–</span>
          <input
            type="date"
            value={searchParams.get('endDate') ?? ''}
            onChange={(e) => setParam('endDate', e.target.value)}
            className="px-2.5 py-[0.4rem] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-[0.8125rem] font-[inherit]"
          />
        </div>

        {/* Filters button */}
        <button
          onClick={() => setShowFilters(true)}
          className="flex items-center gap-1.5 py-[0.4rem] px-[0.875rem] rounded-[var(--radius-md)] border border-[var(--color-border)] cursor-pointer text-sm font-medium"
          style={{
            backgroundColor: activeFilterCount > 0 ? 'var(--color-accent-light)' : 'var(--color-surface)',
            color: activeFilterCount > 0 ? 'var(--color-accent)' : 'var(--color-text-secondary)',
          }}
        >
          <SlidersHorizontal size={14} />
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-[var(--color-accent)] text-white rounded-[var(--radius-full)] px-1.5 text-[0.6875rem] font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Auto-categorize button */}
        <Button
          variant="secondary"
          icon={<Sparkles size={14} />}
          onClick={async () => {
            setShowAutoCatPanel(true);
            await refetchAutoCatStatus();
          }}
        >
          Auto-categorize
        </Button>

        {/* Scan Receipt button */}
        <Button
          variant="secondary"
          icon={<Camera size={14} />}
          onClick={() => setShowReceiptModal(true)}
        >
          Scan Receipt
        </Button>

        {/* Transfer button */}
        <Button
          variant="secondary"
          icon={<ArrowLeftRight size={14} />}
          onClick={() => setShowTransferModal(true)}
        >
          Transfer
        </Button>

        {/* Import CSV button */}
        <Button
          variant="secondary"
          icon={<Upload size={14} />}
          onClick={() => setShowImportModal(true)}
        >
          Import CSV
        </Button>

        {/* Add button */}
        <Button
          variant="primary"
          icon={<Plus size={14} />}
          onClick={() => setShowAddModal(true)}
        >
          Add
        </Button>
      </div>

      {/* Auto-categorize panel */}
      {showAutoCatPanel && (
        <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 flex flex-col gap-3">
          {autoCatStatusFetching && (
            <p className="text-sm text-[color:var(--color-text-secondary)]">Checking AI status…</p>
          )}
          {!autoCatStatusFetching && autoCatStatus && !autoCatStatus?.configured && (
            <>
              <AiSetupNudge message="Auto-categorize requires an AI provider. Set one up to automatically categorize your uncategorized transactions." />
              <div className="flex justify-end">
                <button onClick={() => setShowAutoCatPanel(false)} className="text-sm text-[color:var(--color-text-secondary)] hover:underline">Dismiss</button>
              </div>
            </>
          )}
          {!autoCatStatusFetching && autoCatStatus && !autoCatStatus.notConfigured && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-[color:var(--color-text-secondary)]">
                {autoCatStatus.uncategorizedCount > 0
                  ? `Auto-categorize ${autoCatStatus.uncategorizedCount} uncategorized transaction${autoCatStatus.uncategorizedCount !== 1 ? 's' : ''}?`
                  : 'All transactions are already categorized.'}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowAutoCatPanel(false)} className="text-sm text-[color:var(--color-text-secondary)] hover:underline">Cancel</button>
                {autoCatStatus.uncategorizedCount > 0 && (
                  <Button
                    variant="primary"
                    disabled={autoCatMutation.isPending}
                    onClick={() => autoCatMutation.mutate()}
                  >
                    {autoCatMutation.isPending ? 'Categorizing…' : 'Confirm'}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk actions */}
      {someSelected && (
        <BulkActionsBar
          count={selectedIds.size}
          categories={categories}
          onRecategorize={(id) => bulkRecategorizeMutation.mutate(id)}
          onMarkReviewed={() => bulkMarkReviewedMutation.mutate()}
          onHide={() => bulkHideMutation.mutate()}
          onDelete={() => bulkDeleteMutation.mutate()}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      {/* Duplicate transactions warning banner */}
      {duplicateCount > 0 && (
        <button
          onClick={() => setShowDuplicateModal(true)}
          className="flex items-center gap-2 w-full py-2.5 px-4 rounded-[var(--radius-md)] border border-[#f59e0b] bg-[#fffbeb] text-[#92400e] cursor-pointer text-sm font-medium text-left"
        >
          <span className="text-base">⚠</span>
          <span>
            <strong>{duplicateCount}</strong> potential duplicate transaction
            {duplicateCount !== 1 ? 's' : ''} found —{' '}
            <span className="underline">Review</span>
          </span>
        </button>
      )}

      {/* Transaction list */}
      <Card padding="none">
        {/* Column header */}
        <div className="flex items-center h-10 px-3 gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            className="accent-[var(--color-accent)] shrink-0 cursor-pointer"
          />
          <div className="w-8 shrink-0" />
          <div className="flex-[1_1_180px] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.04em]">Merchant</div>
          <div className="hidden sm:block flex-[0_0_130px] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.04em]">Category</div>
          <div className="hidden md:block flex-[0_0_150px] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.04em]">Account</div>
          <div className="hidden sm:block flex-[0_0_auto] min-w-[60px]" />
          <div className="flex-[0_0_90px] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.04em] text-right">Amount</div>
          <div className="w-6 shrink-0" />
        </div>

        {txnsLoading ? (
          <div className="p-4 flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 h-[52px]">
                <Skeleton width={16} height={16} />
                <Skeleton width={32} height={32} rounded />
                <Skeleton height={14} style={{ flex: '1 1 180px' }} />
                <Skeleton height={14} style={{ flex: '0 0 130px' }} />
                <Skeleton height={14} style={{ flex: '0 0 150px' }} />
                <Skeleton height={14} width={80} />
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="p-12 text-center text-[var(--color-text-muted)] text-sm">
            <p className="m-0 font-medium">No transactions found.</p>
            <p className="m-0 mt-1 text-xs">Transactions will appear here once you add accounts and transactions.</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.date}>
              {/* Date group header */}
              <div className="flex items-center justify-between py-1.5 px-3 bg-[var(--color-bg)] border-b border-[var(--color-border)] border-t border-t-[var(--color-border)]">
                <span className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-[0.04em]">
                  {fmtGroupDate(group.date)}
                </span>
                <span
                  className="text-[0.8125rem] font-semibold [font-variant-numeric:tabular-nums]"
                  style={{ color: group.dayTotal < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}
                >
                  {group.dayTotal < 0 ? '-' : '+'}{fmtCurrency(group.dayTotal)}
                </span>
              </div>

              {/* Rows */}
              {group.transactions.map((txn, idx) => (
                <div key={txn.id}>
                  <TransactionRow
                    txn={txn}
                    selected={selectedIds.has(txn.id)}
                    onSelect={toggleSelect}
                    onOpen={setDrawerTxn}
                    onMerchantEdit={handleMerchantEdit}
                    onSplit={setSplitTxn}
                  />
                  {idx < group.transactions.length - 1 && (
                    <div className="h-px bg-[var(--color-border)] ml-3" />
                  )}
                </div>
              ))}
            </div>
          ))
        )}

        {/* Pagination */}
        {!txnsLoading && total > PAGE_SIZE && (
          <div className="px-3">
            <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
          </div>
        )}
      </Card>

      {/* Summary Stats Panel */}
      {!txnsLoading && transactions.length > 0 && (() => {
        const expenses = transactions.filter((t) => t.amount < 0);
        const totalSpending = expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);
        const largestExpense = expenses.length > 0 ? Math.max(...expenses.map((t) => Math.abs(t.amount))) : 0;
        const avgAmount = transactions.length > 0 ? transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0) / transactions.length : 0;
        const dates = transactions.map((t) => t.date).sort();
        const firstDate = dates[0] ? new Date(dates[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
        const lastDate = dates[dates.length - 1] ? new Date(dates[dates.length - 1]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

        return (
          <Card padding="lg">
            <div className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-[0.06em] mb-3">
              Summary
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              {[
                { label: 'Total transactions', value: String(transactions.length) },
                { label: 'Total spending', value: fmtCurrency(totalSpending) },
                { label: 'Largest expense', value: largestExpense > 0 ? fmtCurrency(largestExpense) : '—' },
                { label: 'Average transaction', value: fmtCurrency(avgAmount) },
                { label: 'First transaction', value: firstDate },
                { label: 'Last transaction', value: lastDate },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div className="text-xs text-[var(--color-text-muted)] mb-0.5">{label}</div>
                  <div className="text-[0.9375rem] font-semibold text-[var(--color-text)] [font-variant-numeric:tabular-nums]">{value}</div>
                </div>
              ))}
            </div>
          </Card>
        );
      })()}

      {/* Filters panel */}
      <FiltersPanel
        open={showFilters}
        onClose={() => setShowFilters(false)}
        accounts={accounts}
        categories={categories}
        searchParams={searchParams}
        setSearchParams={setSearchParams}
      />

      {/* Transaction detail drawer */}
      <TransactionDrawer
        transaction={drawerTxn}
        categories={categories}
        onClose={() => setDrawerTxn(null)}
        onSaved={() => setDrawerTxn(null)}
      />

      {/* Add transaction modal */}
      <AddTransactionModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        accounts={accounts}
        categories={categories}
      />

      {/* Transfer modal */}
      <TransferModal
        open={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        accounts={accounts}
      />

      {/* Import CSV modal */}
      <ImportModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImported={() => queryClient.invalidateQueries({ queryKey: ['transactions'] })}
      />

      {/* Receipt OCR modal */}
      {showReceiptModal && (
        <ReceiptOcrModal
          onClose={() => setShowReceiptModal(false)}
        />
      )}

      {/* Duplicate review modal */}
      <DuplicateReviewModal
        isOpen={showDuplicateModal}
        onClose={() => {
          setShowDuplicateModal(false);
          queryClient.invalidateQueries({ queryKey: ['transactions', 'duplicates', 'count'] });
        }}
      />

      {/* Split transaction modal */}
      {splitTxn && (
        <SplitTransactionModal
          transaction={splitTxn}
          categories={categories}
          isOpen={!!splitTxn}
          onClose={() => setSplitTxn(null)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            setSplitTxn(null);
          }}
        />
      )}
    </div>
  );
}
