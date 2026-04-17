import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Settings, Pencil, Plus, ChevronDown, ChevronUp, AlertTriangle, X, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Input, Select, Modal, ModalFooter, Skeleton, Card, toast, CategoryCombobox } from '@/components/ui';
import { useAiStream } from '@/hooks/useAiStream';

// ─── Formatters ──────────────────────────────────────────────────────────────

const fmtCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── Types ────────────────────────────────────────────────────────────────────

type BudgetType = 'FIXED' | 'FLEXIBLE' | 'NON_MONTHLY';

interface CategoryRow {
  id: string;
  name: string;
  icon: string | null;
  budgeted: number;
  actual: number;
  remaining: number;
  percent: number;
  budgetType?: BudgetType; // NEW — may be absent until backend propagates
}

interface ExpenseGroup {
  name: string;
  budgeted: number;
  actual: number;
  categories: CategoryRow[];
}

interface BudgetData {
  year: number;
  month: number;
  income: {
    budgeted: number;
    actual: number;
    categories: CategoryRow[];
  };
  expenses: {
    budgeted: number;
    actual: number;
    groups: ExpenseGroup[];
    byType?: {              // NEW — optional until backend adds it
      fixed: CategoryRow[];
      flexible: CategoryRow[];
      nonMonthly: CategoryRow[];
    };
  };
  unbudgeted?: CategoryRow[]; // NEW
  leftToBudget: number;
  savingsRate: number;
}

interface CategoryOption {
  id: string;
  name: string;
  icon?: string;
  group?: string;
}

interface CategoryGroup {
  groupId: string;
  groupName: string;
  type: string;
  categories: Array<{ id: string; name: string; icon: string | null; color: string | null }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function progressColor(actual: number, budget: number): string {
  if (budget <= 0) return 'var(--color-success)';
  const pct = actual / budget;
  if (pct >= 1) return 'var(--color-danger)';
  if (pct >= 0.75) return 'var(--color-warning)';
  return 'var(--color-success)';
}

function remainingColor(remaining: number): string {
  return remaining < 0 ? 'var(--color-danger)' : 'var(--color-text)';
}

function savingsRateStyle(rate: number): { bg: string; color: string } {
  if (rate >= 20) return { bg: 'var(--color-success-light)', color: 'var(--color-success)' };
  if (rate >= 10) return { bg: 'var(--color-warning-light)', color: 'var(--color-warning)' };
  return { bg: 'var(--color-danger-light)', color: 'var(--color-danger)' };
}

const BUDGET_TYPE_LABELS: Record<BudgetType, string> = {
  FIXED: 'Fixed',
  FLEXIBLE: 'Flexible',
  NON_MONTHLY: 'Non-Monthly',
};

const BUDGET_TYPE_OPTIONS = [
  { value: 'FIXED', label: 'Fixed — recurring, same amount (rent, phone, insurance)' },
  { value: 'FLEXIBLE', label: 'Flexible — variable monthly (groceries, dining)' },
  { value: 'NON_MONTHLY', label: 'Non-Monthly — periodic (annual, quarterly)' },
];

// ─── Inline Editable Budget Cell ──────────────────────────────────────────────

function EditableBudgetCell({
  value,
  budgetType,
  onSave,
}: {
  value: number;
  budgetType?: BudgetType;
  onSave: (newValue: number, newType: BudgetType) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftType, setDraftType] = useState<BudgetType>(budgetType ?? 'FLEXIBLE');
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(value.toFixed(2));
    setDraftType(budgetType ?? 'FLEXIBLE');
    setEditing(true);
  }

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const parsed = parseFloat(draft);
    if (!isNaN(parsed)) {
      onSave(parsed, draftType);
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5 items-end">
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-[90px] text-sm border border-[var(--color-accent)] rounded-[var(--radius-sm)] bg-[var(--color-surface)] text-[var(--color-text)] outline-none text-right px-1.5 py-0.5"
        />
        <select
          value={draftType}
          onChange={(e) => setDraftType(e.target.value as BudgetType)}
          onBlur={commit}
          className="text-[0.6875rem] border border-[var(--color-border)] rounded-[var(--radius-sm)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] px-1 py-px cursor-pointer max-w-[120px]"
        >
          {BUDGET_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{BUDGET_TYPE_LABELS[o.value as BudgetType]}</option>
          ))}
        </select>
        <div className="flex gap-1">
          <button
            onClick={commit}
            className="text-[0.6875rem] px-2 py-px border border-[var(--color-accent)] rounded-[var(--radius-sm)] bg-[var(--color-accent)] text-white cursor-pointer"
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            className="text-[0.6875rem] px-2 py-px border border-[var(--color-border)] rounded-[var(--radius-sm)] bg-transparent text-[var(--color-text-muted)] cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={startEdit}
      className="inline-flex flex-col items-end gap-px cursor-pointer px-1 py-0.5 rounded-[var(--radius-sm)] transition-[border-color] duration-150"
      style={{ borderBottom: hovered ? '1px dashed var(--color-border-strong)' : '1px dashed transparent' }}
    >
      <div className="inline-flex items-center gap-1 text-sm text-[var(--color-text)]">
        {hovered && (
          <Pencil size={11} className="text-[var(--color-text-muted)] shrink-0" />
        )}
        {fmtCurrency(value)}
      </div>
      {budgetType && (
        <span className="text-[0.625rem] text-[var(--color-text-muted)] uppercase tracking-[0.05em]">
          {BUDGET_TYPE_LABELS[budgetType]}
        </span>
      )}
    </div>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ actual, budget }: { actual: number; budget: number }) {
  const pct = budget > 0 ? Math.min(actual / budget, 1) : 0;
  const color = progressColor(actual, budget);
  const label = budget > 0 ? `${Math.round((actual / budget) * 100)}%` : '—';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-[5px] bg-[var(--color-border)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-in-out"
          style={{ width: `${pct * 100}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs text-[var(--color-text-muted)] min-w-10 text-right">
        {label}
      </span>
    </div>
  );
}

// ─── Add Budget Modal (used for unbudgeted categories) ────────────────────────

function AddBudgetModal({
  open,
  onClose,
  preselectedCategoryId,
  preselectedCategoryName,
  allCategories,
  year,
  month,
}: {
  open: boolean;
  onClose: () => void;
  preselectedCategoryId?: string;
  preselectedCategoryName?: string;
  allCategories: CategoryOption[];
  year: number;
  month: number;
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState(preselectedCategoryId ?? '');
  const [amount, setAmount] = useState('');
  const [budgetType, setBudgetType] = useState<BudgetType>('FLEXIBLE');
  const queryClient = useQueryClient();

  // Sync preselected when modal opens with a new category
  useEffect(() => {
    if (open) {
      setSelectedCategoryId(preselectedCategoryId ?? '');
      setAmount('');
      setBudgetType('FLEXIBLE');
    }
  }, [open, preselectedCategoryId]);

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/budgets', {
        categoryId: selectedCategoryId,
        amount: parseFloat(amount),
        budgetType,
        month,
        year,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets', year, month] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: () => toast.error('Failed to save budget'),
  });

  function handleSubmit() {
    if (!selectedCategoryId || !amount || isNaN(parseFloat(amount))) return;
    mutation.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={preselectedCategoryName ? `Add budget for ${preselectedCategoryName}` : 'Add Budget'}
      size="sm"
    >
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex flex-col gap-4">
        {!preselectedCategoryId && (
          <CategoryCombobox
            label="Category"
            categories={allCategories.map((c) => ({ id: c.id, name: c.name, emoji: c.icon }))}
            value={selectedCategoryId}
            onChange={setSelectedCategoryId}
            placeholder="Select a category..."
          />
        )}

        <Input
          label="Budget amount"
          type="number"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0"
          step="0.01"
        />

        <Select
          label="Budget type"
          value={budgetType}
          onChange={(e) => setBudgetType(e.target.value as BudgetType)}
          options={BUDGET_TYPE_OPTIONS}
        />

        <ModalFooter>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            loading={mutation.isPending}
            disabled={!selectedCategoryId || !amount}
          >
            Add Budget
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// ─── Add Category to Group Modal ──────────────────────────────────────────────

function AddCategoryModal({
  open,
  onClose,
  groupName,
  existingCategoryIds,
  allCategories,
  year,
  month,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  groupName: string;
  existingCategoryIds: string[];
  allCategories: CategoryOption[];
  year: number;
  month: number;
  onSaved: () => void;
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [budgetType, setBudgetType] = useState<BudgetType>('FLEXIBLE');
  const queryClient = useQueryClient();

  const availableCategories = allCategories.filter(
    (c) => !existingCategoryIds.includes(c.id)
  );

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/budgets', {
        categoryId: selectedCategoryId,
        amount: parseFloat(amount),
        budgetType,
        month,
        year,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets', year, month] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onSaved();
      onClose();
      setSelectedCategoryId('');
      setAmount('');
      setBudgetType('FLEXIBLE');
    },
    onError: () => toast.error('Failed to save budget'),
  });

  function handleSubmit() {
    if (!selectedCategoryId || !amount || isNaN(parseFloat(amount))) return;
    mutation.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Add category to ${groupName}`}
      size="sm"
    >
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex flex-col gap-4">
        <CategoryCombobox
          label="Category"
          categories={availableCategories.map((c) => ({ id: c.id, name: c.name, emoji: c.icon }))}
          value={selectedCategoryId}
          onChange={setSelectedCategoryId}
          placeholder="Select a category..."
        />

        <Input
          label="Budget amount"
          type="number"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0"
          step="0.01"
        />

        <Select
          label="Budget type"
          value={budgetType}
          onChange={(e) => setBudgetType(e.target.value as BudgetType)}
          options={BUDGET_TYPE_OPTIONS}
        />

        <ModalFooter>
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            loading={mutation.isPending}
            disabled={!selectedCategoryId || !amount}
          >
            Add to Budget
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// ─── Budget Row ───────────────────────────────────────────────────────────────

function BudgetRow({
  item,
  year,
  month,
  onNavigateToTransactions,
}: {
  item: CategoryRow;
  year: number;
  month: number;
  onNavigateToTransactions?: (categoryId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [hovered, setHovered] = useState(false);

  const saveMutation = useMutation({
    mutationFn: ({ amount, budgetType }: { amount: number; budgetType: BudgetType }) =>
      api.post('/budgets', {
        categoryId: item.id,
        amount,
        budgetType,
        month,
        year,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets', year, month] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: () => toast.error('Failed to save budget'),
  });

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="rounded-[var(--radius-sm)] transition-colors duration-100 px-2"
      style={{ backgroundColor: hovered ? 'var(--color-surface-hover)' : 'transparent' }}
    >
      {/* Main row — responsive: name+amount on mobile, full 4-col on sm+ */}
      <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_120px_100px_90px] items-center gap-2 min-h-[44px]">
        {/* Name */}
        <div
          onClick={() => onNavigateToTransactions?.(item.id)}
          className="flex items-center gap-2 cursor-pointer overflow-hidden"
        >
          {item.icon && (
            <span className="text-base shrink-0">{item.icon}</span>
          )}
          <span className="text-sm font-medium text-[var(--color-text)] whitespace-nowrap overflow-hidden text-ellipsis">
            {item.name}
          </span>
        </div>

        {/* Budget (editable with type selector) */}
        <div className="text-right">
          <EditableBudgetCell
            value={item.budgeted}
            budgetType={item.budgetType}
            onSave={(amount, budgetType) => saveMutation.mutate({ amount, budgetType })}
          />
        </div>

        {/* Actual — hidden on mobile */}
        <div className="hidden sm:block text-right text-sm text-[var(--color-text)]">
          {fmtCurrency(item.actual)}
        </div>

        {/* Remaining — hidden on mobile */}
        <div className="hidden sm:block text-right text-sm font-medium" style={{ color: remainingColor(item.remaining) }}>
          {fmtCurrency(item.remaining)}
        </div>
      </div>

      {/* Progress bar row */}
      <div className="pb-1">
        <ProgressBar actual={item.actual} budget={item.budgeted} />
      </div>
    </div>
  );
}

// ─── Budget Type Section (Fixed / Flexible / Non-Monthly) ────────────────────

function BudgetTypeSection({
  title,
  categories,
  year,
  month,
  allCategories,
  defaultExpanded,
  onNavigateToTransactions,
}: {
  title: string;
  categories: CategoryRow[];
  year: number;
  month: number;
  allCategories: CategoryOption[];
  defaultExpanded: boolean;
  onNavigateToTransactions?: (categoryId: string) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const totalBudgeted = categories.reduce((s, c) => s + c.budgeted, 0);
  const totalActual = categories.reduce((s, c) => s + c.actual, 0);
  const totalRemaining = totalBudgeted - totalActual;

  return (
    <div className="mb-6">
      {/* Section header — clickable to collapse */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full border-none cursor-pointer p-2 rounded-[var(--radius-md)] grid gap-3 items-center bg-[var(--color-surface-subtle,var(--color-border))]"
        style={{
          gridTemplateColumns: '1fr auto auto auto auto',
          marginBottom: expanded ? '0.25rem' : 0,
        }}
      >
        <div className="flex items-center gap-1.5">
          {expanded ? (
            <ChevronUp size={14} className="text-[var(--color-text-muted)]" />
          ) : (
            <ChevronDown size={14} className="text-[var(--color-text-muted)]" />
          )}
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
            {title}
          </span>
          <span className="text-[0.6875rem] text-[var(--color-text-muted)] font-normal">
            ({categories.length})
          </span>
        </div>
        <span className="text-xs text-[var(--color-text-muted)] text-right">
          Budgeted
        </span>
        <span className="text-[0.8125rem] font-semibold text-[var(--color-text)] text-right min-w-[80px]">
          {fmtCurrency(totalBudgeted)}
        </span>
        <span className="text-xs text-[var(--color-text-muted)] text-right">
          Spent
        </span>
        <span className="text-[0.8125rem] font-semibold text-right min-w-[80px]" style={{ color: remainingColor(totalRemaining) }}>
          {fmtCurrency(totalActual)}
        </span>
      </button>

      {expanded && (
        <>
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_120px_100px_90px] gap-2 px-2 mb-0.5">
            <div />
            <div className="text-right text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Budget</div>
            <div className="hidden sm:block text-right text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Actual</div>
            <div className="hidden sm:block text-right text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">Remaining</div>
          </div>

          <div className="h-px bg-[var(--color-border)] mb-1" />

          {categories.length === 0 ? (
            <div className="py-3 px-2 text-[0.8125rem] text-[var(--color-text-muted)]">
              No categories in this section.
            </div>
          ) : (
            categories.map((item) => (
              <BudgetRow
                key={item.id}
                item={item}
                year={year}
                month={month}
                onNavigateToTransactions={onNavigateToTransactions}
              />
            ))
          )}

          {/* Totals footer */}
          <div className="h-px bg-[var(--color-border)] my-1" />
          <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_120px_100px_90px] gap-2 items-center px-2 py-1.5">
            <span className="text-[0.8125rem] font-semibold text-[var(--color-text-secondary)]">
              Total {title}:
            </span>
            <span className="text-right text-sm font-semibold text-[var(--color-text)]">
              {fmtCurrency(totalBudgeted)}
            </span>
            <span className="hidden sm:block text-right text-sm font-semibold text-[var(--color-text)]">
              {fmtCurrency(totalActual)}
            </span>
            <span className="hidden sm:block text-right text-sm font-semibold" style={{ color: remainingColor(totalRemaining) }}>
              {fmtCurrency(totalRemaining)}
            </span>
          </div>

          {/* Add category button */}
          <div className="pt-1 px-2">
            <button
              onClick={() => setAddModalOpen(true)}
              className="inline-flex items-center gap-1 bg-transparent border-none cursor-pointer text-[0.8125rem] text-[var(--color-accent)] font-medium py-1"
            >
              <Plus size={14} />
              Add category
            </button>
          </div>

          <AddCategoryModal
            open={addModalOpen}
            onClose={() => setAddModalOpen(false)}
            groupName={title}
            existingCategoryIds={categories.map((c) => c.id)}
            allCategories={allCategories}
            year={year}
            month={month}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ['budgets', year, month] })}
          />
        </>
      )}
    </div>
  );
}

// ─── Budget Group Section (legacy "by group" view, kept for Income section) ───

function BudgetGroupSection({
  group,
  year,
  month,
  allCategories,
  onNavigateToTransactions,
}: {
  group: ExpenseGroup;
  year: number;
  month: number;
  allCategories: CategoryOption[];
  onNavigateToTransactions?: (categoryId: string) => void;
}) {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const totalBudget = group.budgeted;
  const totalActual = group.actual;
  const totalRemaining = totalBudget - totalActual;
  const existingIds = group.categories.map((c) => c.id);

  return (
    <div className="mb-6">
      {/* Section header */}
      <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_120px_100px_90px] gap-2 items-center px-2 mb-1">
        <div className="flex items-center gap-2">
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
            {group.name}
          </span>
          <button
            className="bg-transparent border-none cursor-pointer text-[var(--color-text-muted)] p-0 flex items-center"
            title={`${group.name} settings`}
          >
            <Settings size={12} />
          </button>
        </div>
        <div className="text-right text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">Budget</div>
        <div className="hidden sm:block text-right text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">Actual</div>
        <div className="hidden sm:block text-right text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">Remaining</div>
      </div>

      {/* Divider */}
      <div className="h-px bg-[var(--color-border)] mb-1" />

      {/* Rows */}
      {group.categories.length === 0 ? (
        <div className="py-3 px-2 text-[0.8125rem] text-[var(--color-text-muted)]">
          No categories yet.
        </div>
      ) : (
        group.categories.map((item) => (
          <BudgetRow
            key={item.id}
            item={item}
            year={year}
            month={month}
            onNavigateToTransactions={onNavigateToTransactions}
          />
        ))
      )}

      {/* Totals row */}
      <div className="h-px bg-[var(--color-border)] my-1" />
      <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_120px_100px_90px] gap-2 items-center px-2 py-1.5">
        <span className="text-[0.8125rem] font-semibold text-[var(--color-text-secondary)]">
          Total {group.name}:
        </span>
        <span className="text-right text-sm font-semibold text-[var(--color-text)]">
          {fmtCurrency(totalBudget)}
        </span>
        <span className="hidden sm:block text-right text-sm font-semibold text-[var(--color-text)]">
          {fmtCurrency(totalActual)}
        </span>
        <span className="hidden sm:block text-right text-sm font-semibold" style={{ color: remainingColor(totalRemaining) }}>
          {fmtCurrency(totalRemaining)}
        </span>
      </div>

      {/* Add category button */}
      <div className="pt-1 px-2">
        <button
          onClick={() => setAddModalOpen(true)}
          className="inline-flex items-center gap-1 bg-transparent border-none cursor-pointer text-[0.8125rem] text-[var(--color-accent)] font-medium py-1"
        >
          <Plus size={14} />
          Add category
        </button>
      </div>

      <AddCategoryModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        groupName={group.name}
        existingCategoryIds={existingIds}
        allCategories={allCategories}
        year={year}
        month={month}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['budgets', year, month] })}
      />
    </div>
  );
}

// ─── Unbudgeted Alert Banner ──────────────────────────────────────────────────

function UnbudgetedAlert({
  categories,
  allCategories,
  year,
  month,
}: {
  categories: CategoryRow[];
  allCategories: CategoryOption[];
  year: number;
  month: number;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryRow | null>(null);

  if (dismissed || categories.length === 0) return null;

  return (
    <div className="mb-4 border border-[var(--color-warning)] rounded-[var(--radius-md)] bg-[var(--color-warning-light,rgba(245,158,11,0.08))] overflow-hidden">
      {/* Banner row */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <AlertTriangle size={15} className="text-[var(--color-warning)] shrink-0" />
        <span className="flex-1 text-sm text-[var(--color-text)] font-medium">
          {categories.length} {categories.length === 1 ? 'category has' : 'categories have'} spending but no budget set.
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 bg-transparent border-none cursor-pointer text-[0.8125rem] text-[var(--color-warning)] font-medium"
        >
          {expanded ? 'Hide' : 'View unbudgeted categories'}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="bg-transparent border-none cursor-pointer text-[var(--color-text-muted)] p-px flex items-center"
        >
          <X size={14} />
        </button>
      </div>

      {/* Expanded list */}
      {expanded && (
        <div className="border-t border-[var(--color-warning)] bg-[var(--color-surface)]">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center gap-3 px-3.5 py-2 border-b border-[var(--color-border)]"
            >
              {cat.icon && <span className="text-base">{cat.icon}</span>}
              <span className="flex-1 text-sm font-medium text-[var(--color-text)]">
                {cat.name}
              </span>
              <span className="text-sm text-[var(--color-text-secondary)]">
                {fmtCurrency(cat.actual)} spent
              </span>
              <button
                onClick={() => {
                  setSelectedCategory(cat);
                  setAddModalOpen(true);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 border border-[var(--color-accent)] rounded-[var(--radius-sm)] bg-transparent text-[var(--color-accent)] cursor-pointer text-[0.8125rem] font-medium"
              >
                <Plus size={12} />
                Add Budget
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedCategory && (
        <AddBudgetModal
          open={addModalOpen}
          onClose={() => { setAddModalOpen(false); setSelectedCategory(null); }}
          preselectedCategoryId={selectedCategory.id}
          preselectedCategoryName={selectedCategory.name}
          allCategories={allCategories}
          year={year}
          month={month}
        />
      )}
    </div>
  );
}

// ─── Left to Budget Banner ────────────────────────────────────────────────────

function LeftToBudgetBanner({
  data,
}: {
  data: BudgetData;
}) {
  const leftToBudget = data.leftToBudget;
  const positive = leftToBudget >= 0;
  const srStyle = savingsRateStyle(data.savingsRate);

  return (
    <div
      className="mb-4 py-3.5 px-5 rounded-[var(--radius-md)] flex items-center gap-4 flex-wrap"
      style={{
        border: `1px solid ${positive ? 'var(--color-success)' : 'var(--color-danger)'}`,
        backgroundColor: positive
          ? 'var(--color-success-light, rgba(16,185,129,0.08))'
          : 'var(--color-danger-light, rgba(239,68,68,0.08))',
      }}
    >
      {/* Main amount */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className="text-2xl font-bold"
            style={{ color: positive ? 'var(--color-success)' : 'var(--color-danger)' }}
          >
            {fmtCurrency(Math.abs(leftToBudget))}
          </span>
          <span className="text-sm font-medium text-[var(--color-text-secondary)]">
            {positive ? 'left to budget' : 'over budget'}
          </span>
        </div>
        <div className="text-[0.8125rem] text-[var(--color-text-muted)] mt-1">
          {fmtCurrency(data.income.actual)} income
          {' '}&minus;{' '}
          {fmtCurrency(data.expenses.actual)} expenses
          {' '}={' '}
          <span className="font-medium" style={{ color: positive ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {fmtCurrency(leftToBudget)}
          </span>
        </div>
      </div>

      {/* Savings rate badge */}
      <div className="flex flex-col items-center gap-1">
        <span
          className="text-xl font-bold py-1 px-3 rounded-full"
          style={{ backgroundColor: srStyle.bg, color: srStyle.color }}
        >
          {Math.round(data.savingsRate)}%
        </span>
        <span className="text-[0.6875rem] text-[var(--color-text-muted)] uppercase tracking-[0.06em]">
          Savings Rate
        </span>
      </div>
    </div>
  );
}

// ─── Summary Panel (right sidebar) ───────────────────────────────────────────

function SummaryPanel({ data }: { data?: BudgetData }) {
  if (!data) {
    return (
      <Card padding="lg">
        <div className="flex flex-col gap-3">
          <Skeleton height={48} width="60%" />
          <Skeleton height={16} width="40%" />
          <div className="h-px bg-[var(--color-border)] my-2" />
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={20} width="100%" />)}
        </div>
      </Card>
    );
  }

  const leftToBudget = data.leftToBudget;
  const positive = leftToBudget >= 0;
  const srStyle = savingsRateStyle(data.savingsRate);

  // Determine expense breakdown: prefer byType, fall back to groups
  const hasByType = !!data.expenses.byType;

  const fixedTotal = hasByType
    ? data.expenses.byType!.fixed.reduce((s, c) => s + c.actual, 0)
    : 0;
  const flexTotal = hasByType
    ? data.expenses.byType!.flexible.reduce((s, c) => s + c.actual, 0)
    : 0;
  const nonMonthlyTotal = hasByType
    ? data.expenses.byType!.nonMonthly.reduce((s, c) => s + c.actual, 0)
    : 0;

  return (
    <Card padding="lg">
      {/* Left to budget */}
      <div className="mb-5 text-center">
        <div
          className="font-bold leading-tight"
          style={{
            fontSize: '1.875rem',
            color: positive ? 'var(--color-success)' : 'var(--color-danger)',
          }}
        >
          {fmtCurrency(Math.abs(leftToBudget))}
        </div>
        <div className="text-[0.8125rem] text-[var(--color-text-secondary)] mt-1">
          {positive ? 'Left to budget' : 'Over budget'}
        </div>
      </div>

      <div className="h-px bg-[var(--color-border)] mb-4" />

      {/* Summary table */}
      <div className="mb-4">
        {/* Header */}
        <div className="grid gap-1 mb-1.5" style={{ gridTemplateColumns: '1fr 70px 70px' }}>
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]"></span>
          {(['Budget', 'Actual'] as const).map((h) => (
            <span key={h} className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)] text-right">
              {h}
            </span>
          ))}
        </div>

        {/* Income row */}
        <SummaryRow label="Income" budget={data.income.budgeted} actual={data.income.actual} />

        {/* Expense breakdown */}
        {hasByType ? (
          <>
            <SummaryRow label="Fixed" budget={data.expenses.byType!.fixed.reduce((s, c) => s + c.budgeted, 0)} actual={fixedTotal} />
            <SummaryRow label="Flexible" budget={data.expenses.byType!.flexible.reduce((s, c) => s + c.budgeted, 0)} actual={flexTotal} />
            <SummaryRow label="Non-Monthly" budget={data.expenses.byType!.nonMonthly.reduce((s, c) => s + c.budgeted, 0)} actual={nonMonthlyTotal} />
          </>
        ) : (
          data.expenses.groups.map((g) => (
            <SummaryRow key={g.name} label={g.name} budget={g.budgeted} actual={g.actual} />
          ))
        )}

        {/* Divider */}
        <div className="h-px bg-[var(--color-border)] my-1.5" />

        {/* Total expenses row */}
        <SummaryRow label="Total Expenses" budget={data.expenses.budgeted} actual={data.expenses.actual} bold />
      </div>

      <div className="h-px bg-[var(--color-border)] mb-3.5" />

      {/* Savings rate */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-[var(--color-text-secondary)] font-medium">
          Savings Rate
        </span>
        <span
          className="text-[0.8125rem] font-bold py-px px-2.5 rounded-full"
          style={{ backgroundColor: srStyle.bg, color: srStyle.color }}
        >
          {Math.round(data.savingsRate)}%
        </span>
      </div>
    </Card>
  );
}

function SummaryRow({
  label,
  budget,
  actual,
  bold = false,
}: {
  label: string;
  budget: number;
  actual: number;
  bold?: boolean;
}) {
  return (
    <div className="grid gap-1 py-1 items-center" style={{ gridTemplateColumns: '1fr 70px 70px' }}>
      <span className={`text-[0.8125rem] ${bold ? 'font-semibold text-[var(--color-text)]' : 'font-normal text-[var(--color-text-secondary)]'}`}>
        {label}
      </span>
      <span className={`text-[0.8125rem] text-right text-[var(--color-text)] ${bold ? 'font-semibold' : 'font-normal'}`}>{fmtCurrency(budget)}</span>
      <span className={`text-[0.8125rem] text-right text-[var(--color-text)] ${bold ? 'font-semibold' : 'font-normal'}`}>{fmtCurrency(actual)}</span>
    </div>
  );
}

// ─── Expense View Tab ─────────────────────────────────────────────────────────

type ExpenseViewTab = 'byType' | 'byGroup';

// ─── Period Tabs ──────────────────────────────────────────────────────────────

type PeriodTab = 'Month' | 'Year' | 'Decade';
const PERIOD_TABS: PeriodTab[] = ['Month', 'Year', 'Decade'];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BudgetPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [periodTab, setPeriodTab] = useState<PeriodTab>('Month');
  const [expenseViewTab, setExpenseViewTab] = useState<ExpenseViewTab>('byType');

  const { data: budgetData, isLoading: budgetLoading } = useQuery<BudgetData>({
    queryKey: ['budgets', year, month],
    queryFn: () => api.get(`/budgets?year=${year}&month=${month}`).then((r) => r.data),
  });

  const { data: categoriesData } = useQuery<CategoryGroup[]>({
    queryKey: ['budget-categories'],
    queryFn: () => api.get('/budgets/categories').then((r) => r.data),
  });

  // Flatten all category groups into a single list for dropdowns
  const allCategories: CategoryOption[] = (categoriesData ?? []).flatMap((g) =>
    g.categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon ?? undefined, group: g.groupName }))
  );

  function goToPrev() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else { setMonth((m) => m - 1); }
  }

  function goToNext() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else { setMonth((m) => m + 1); }
  }

  function goToToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
  }

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;

  // Income synthesized as a group for the income section
  const incomeGroup: ExpenseGroup | null = budgetData?.income.categories.length
    ? {
        name: 'Income',
        budgeted: budgetData.income.budgeted,
        actual: budgetData.income.actual,
        categories: budgetData.income.categories,
      }
    : null;

  const expenseGroups: ExpenseGroup[] = budgetData?.expenses.groups ?? [];
  const unbudgeted: CategoryRow[] = budgetData?.unbudgeted ?? [];

  // Derive byType sections — use server data if available, else fall back to grouping
  // by budgetType field on individual rows from expense groups
  const byType = budgetData?.expenses.byType ?? deriveByType(expenseGroups);

  return (
    <div className="py-4">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        {/* Month navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrev}
            aria-label="Previous month"
            className="flex items-center justify-center w-8 h-8 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>

          <span className="text-base font-semibold text-[var(--color-text)] min-w-40 text-center">
            {MONTH_NAMES[month - 1]} {year}
          </span>

          <button
            onClick={goToNext}
            aria-label="Next month"
            className="flex items-center justify-center w-8 h-8 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] cursor-pointer"
          >
            <ChevronRight size={16} />
          </button>

          {!isCurrentMonth && (
            <button
              onClick={goToToday}
              className="px-3 py-1 text-[0.8125rem] font-medium border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] cursor-pointer"
            >
              Today
            </button>
          )}
        </div>

        {/* Right side: period tabs + settings */}
        <div className="flex items-center gap-3">
          {/* Period tabs */}
          <div className="flex border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden">
            {PERIOD_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setPeriodTab(tab)}
                className="px-3 py-1 text-[0.8125rem] font-medium border-none cursor-pointer transition-[background,color] duration-150"
                style={{
                  borderRight: tab !== 'Decade' ? '1px solid var(--color-border)' : 'none',
                  backgroundColor: periodTab === tab ? 'var(--color-accent)' : 'var(--color-surface)',
                  color: periodTab === tab ? '#fff' : 'var(--color-text-secondary)',
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Settings icon */}
          <button
            aria-label="Budget settings"
            className="flex items-center justify-center w-8 h-8 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] cursor-pointer"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Left to Budget Banner (shown only when data is loaded) */}
      {budgetData && (
        <LeftToBudgetBanner data={budgetData} />
      )}

      {/* Unbudgeted alert */}
      {unbudgeted.length > 0 && budgetData && (
        <UnbudgetedAlert
          categories={unbudgeted}
          allCategories={allCategories}
          year={year}
          month={month}
        />
      )}

      {/* Two-column layout — single column on mobile, 65/35 on md+ */}
      <div className="grid grid-cols-1 md:grid-cols-[65fr_35fr] gap-5 items-start">
        {/* Left column — Budget table */}
        <Card padding="lg">
          {budgetLoading ? (
            <div className="flex flex-col gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex flex-col gap-2">
                  <Skeleton height={16} width="30%" />
                  <div className="h-px bg-[var(--color-border)]" />
                  {[1, 2, 3].map((j) => (
                    <Skeleton key={j} height={44} width="100%" />
                  ))}
                </div>
              ))}
            </div>
          ) : !budgetData ? (
            <div className="text-[var(--color-text-muted)] text-sm py-4">
              No budget data for this period.
            </div>
          ) : (
            <>
              {/* Income section */}
              {incomeGroup && (
                <BudgetGroupSection
                  group={incomeGroup}
                  year={year}
                  month={month}
                  allCategories={allCategories}
                />
              )}

              {/* Expense view tabs */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[0.8125rem] text-[var(--color-text-secondary)] font-medium">
                  Expenses:
                </span>
                <div className="flex border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden">
                  {([
                    { value: 'byType' as ExpenseViewTab, label: 'By Type' },
                    { value: 'byGroup' as ExpenseViewTab, label: 'By Group' },
                  ]).map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setExpenseViewTab(t.value)}
                      className="text-[0.8125rem] font-medium border-none cursor-pointer transition-[background,color] duration-150 px-2.5 py-px"
                      style={{
                        borderRight: t.value === 'byType' ? '1px solid var(--color-border)' : 'none',
                        backgroundColor: expenseViewTab === t.value ? 'var(--color-accent)' : 'var(--color-surface)',
                        color: expenseViewTab === t.value ? '#fff' : 'var(--color-text-secondary)',
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Expense content */}
              {expenseViewTab === 'byType' ? (
                <>
                  <BudgetTypeSection
                    title="Fixed"
                    categories={byType.fixed}
                    year={year}
                    month={month}
                    allCategories={allCategories}
                    defaultExpanded={true}
                  />
                  <BudgetTypeSection
                    title="Flexible"
                    categories={byType.flexible}
                    year={year}
                    month={month}
                    allCategories={allCategories}
                    defaultExpanded={true}
                  />
                  <BudgetTypeSection
                    title="Non-Monthly"
                    categories={byType.nonMonthly}
                    year={year}
                    month={month}
                    allCategories={allCategories}
                    defaultExpanded={false}
                  />
                </>
              ) : (
                expenseGroups.length === 0 ? (
                  <div className="p-8 text-center text-[var(--color-text-muted)] text-sm">
                    No expense categories set up yet. Use &quot;+ Add category&quot; to get started.
                  </div>
                ) : (
                  expenseGroups.map((group) => (
                    <BudgetGroupSection
                      key={group.name}
                      group={group}
                      year={year}
                      month={month}
                      allCategories={allCategories}
                    />
                  ))
                )
              )}

              {!incomeGroup && expenseGroups.length === 0 && (
                <div className="p-8 text-center text-[var(--color-text-muted)] text-sm">
                  No budget categories set up yet. Use &quot;+ Add category&quot; to get started.
                </div>
              )}
            </>
          )}
        </Card>

        {/* Right column — Summary panel + AI Coach */}
        <div className="sticky top-4 flex flex-col gap-4">
          <SummaryPanel data={budgetData} />
          <BudgetCoach month={`${year}-${String(month).padStart(2, '0')}`} />
        </div>
      </div>
    </div>
  );
}

// ─── Budget AI Coach ──────────────────────────────────────────────────────────

function BudgetCoach({ month }: { month: string }) {
  const { streaming, content, error, ask, reset } = useAiStream({ endpoint: '/advisor/budget-coach/stream' });
  const [asked, setAsked] = useState(false);

  function handleAsk() {
    setAsked(true);
    ask({ month });
  }

  return (
    <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[color:var(--color-border)]">
        <Sparkles size={16} className="text-[color:var(--color-primary)]" />
        <span className="font-medium text-sm">AI Budget Coach</span>
        {asked && (
          <button
            onClick={() => { reset(); setAsked(false); }}
            className="ml-auto text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text)]"
          >
            <RefreshCw size={14} />
          </button>
        )}
      </div>

      <div className="p-4">
        {!asked && !content && (
          <div className="text-center">
            <p className="text-sm text-[color:var(--color-text-secondary)] mb-3">
              Get personalized tips for this month's budget.
            </p>
            <Button variant="primary" onClick={handleAsk} className="w-full text-sm">
              <Sparkles size={14} className="mr-1.5" />
              Analyse my budget
            </Button>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {(streaming || content) && (
          <div className="text-sm leading-relaxed whitespace-pre-wrap text-[color:var(--color-text)]">
            {content}
            {streaming && (
              <span className="inline-block w-1.5 h-4 bg-[color:var(--color-primary)] ml-0.5 animate-pulse rounded-sm" />
            )}
          </div>
        )}

        {streaming && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-[color:var(--color-text-secondary)]">
            <Loader2 size={12} className="animate-spin" />
            Thinking…
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helper: derive byType from groups when server doesn't send byType ────────

function deriveByType(groups: ExpenseGroup[]): { fixed: CategoryRow[]; flexible: CategoryRow[]; nonMonthly: CategoryRow[] } {
  const fixed: CategoryRow[] = [];
  const flexible: CategoryRow[] = [];
  const nonMonthly: CategoryRow[] = [];

  for (const group of groups) {
    for (const cat of group.categories) {
      const type = (cat as CategoryRow).budgetType;
      if (type === 'FIXED') fixed.push(cat);
      else if (type === 'NON_MONTHLY') nonMonthly.push(cat);
      else flexible.push(cat); // default — FLEXIBLE or unset
    }
  }

  return { fixed, flexible, nonMonthly };
}
