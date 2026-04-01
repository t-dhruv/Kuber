import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Settings, Pencil, Plus, ChevronDown, ChevronUp, AlertTriangle, X, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Input, Select, Modal, ModalFooter, Skeleton, Card } from '@/components/ui';
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', alignItems: 'flex-end' }}>
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            width: '90px',
            padding: '2px 6px',
            fontSize: '0.875rem',
            border: '1px solid var(--color-accent)',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text)',
            outline: 'none',
            textAlign: 'right',
          }}
        />
        <select
          value={draftType}
          onChange={(e) => setDraftType(e.target.value as BudgetType)}
          onBlur={commit}
          style={{
            fontSize: '0.6875rem',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text-secondary)',
            padding: '1px 4px',
            cursor: 'pointer',
            maxWidth: '120px',
          }}
        >
          {BUDGET_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{BUDGET_TYPE_LABELS[o.value as BudgetType]}</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            onClick={commit}
            style={{
              fontSize: '0.6875rem', padding: '1px 8px',
              border: '1px solid var(--color-accent)',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--color-accent)',
              color: '#fff', cursor: 'pointer',
            }}
          >
            Save
          </button>
          <button
            onClick={() => setEditing(false)}
            style={{
              fontSize: '0.6875rem', padding: '1px 8px',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'transparent',
              color: 'var(--color-text-muted)', cursor: 'pointer',
            }}
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
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '0.125rem',
        cursor: 'pointer',
        padding: '2px 4px',
        borderRadius: 'var(--radius-sm)',
        borderBottom: hovered ? '1px dashed var(--color-border-strong)' : '1px dashed transparent',
        transition: 'border-color 0.15s',
      }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', color: 'var(--color-text)' }}>
        {hovered && (
          <Pencil size={11} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
        )}
        {fmtCurrency(value)}
      </div>
      {budgetType && (
        <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{
        flex: 1,
        height: 5,
        backgroundColor: 'var(--color-border)',
        borderRadius: 'var(--radius-full)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct * 100}%`,
          backgroundColor: color,
          borderRadius: 'var(--radius-full)',
          transition: 'width 0.3s ease',
        }} />
      </div>
      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', minWidth: '2.5rem', textAlign: 'right' }}>
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
      onClose();
    },
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {!preselectedCategoryId && (
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
              Category
            </label>
            <Select
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              placeholder="Select a category..."
              options={allCategories.map((c) => ({
                value: c.id,
                label: c.icon ? `${c.icon} ${c.name}` : c.name,
              }))}
            />
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
            Budget amount
          </label>
          <Input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            step="0.01"
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
            Budget type
          </label>
          <Select
            value={budgetType}
            onChange={(e) => setBudgetType(e.target.value as BudgetType)}
            options={BUDGET_TYPE_OPTIONS}
          />
        </div>
      </div>

      <ModalFooter>
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          loading={mutation.isPending}
          disabled={!selectedCategoryId || !amount}
        >
          Add Budget
        </Button>
      </ModalFooter>
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
      onSaved();
      onClose();
      setSelectedCategoryId('');
      setAmount('');
      setBudgetType('FLEXIBLE');
    },
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
            Category
          </label>
          <Select
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            placeholder="Select a category..."
            options={availableCategories.map((c) => ({
              value: c.id,
              label: c.icon ? `${c.icon} ${c.name}` : c.name,
            }))}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
            Budget amount
          </label>
          <Input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            step="0.01"
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
            Budget type
          </label>
          <Select
            value={budgetType}
            onChange={(e) => setBudgetType(e.target.value as BudgetType)}
            options={BUDGET_TYPE_OPTIONS}
          />
        </div>
      </div>

      <ModalFooter>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          loading={mutation.isPending}
          disabled={!selectedCategoryId || !amount}
        >
          Add to Budget
        </Button>
      </ModalFooter>
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
    },
  });

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: hovered ? 'var(--color-surface-hover)' : 'transparent',
        borderRadius: 'var(--radius-sm)',
        transition: 'background-color 0.1s',
        padding: '0 0.5rem',
      }}
    >
      {/* Main row — responsive: name+amount on mobile, full 4-col on sm+ */}
      <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_120px_100px_90px] items-center gap-2 min-h-[44px]">
        {/* Name */}
        <div
          onClick={() => onNavigateToTransactions?.(item.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
            overflow: 'hidden',
          }}
        >
          {item.icon && (
            <span style={{ fontSize: '1rem', flexShrink: 0 }}>{item.icon}</span>
          )}
          <span style={{
            fontSize: '0.875rem',
            fontWeight: 500,
            color: 'var(--color-text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {item.name}
          </span>
        </div>

        {/* Budget (editable with type selector) */}
        <div style={{ textAlign: 'right' }}>
          <EditableBudgetCell
            value={item.budgeted}
            budgetType={item.budgetType}
            onSave={(amount, budgetType) => saveMutation.mutate({ amount, budgetType })}
          />
        </div>

        {/* Actual — hidden on mobile */}
        <div className="hidden sm:block" style={{ textAlign: 'right', fontSize: '0.875rem', color: 'var(--color-text)' }}>
          {fmtCurrency(item.actual)}
        </div>

        {/* Remaining — hidden on mobile */}
        <div className="hidden sm:block" style={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 500, color: remainingColor(item.remaining) }}>
          {fmtCurrency(item.remaining)}
        </div>
      </div>

      {/* Progress bar row */}
      <div style={{ paddingBottom: '4px' }}>
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
    <div style={{ marginBottom: '1.5rem' }}>
      {/* Section header — clickable to collapse */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0.5rem',
          borderRadius: 'var(--radius-md)',
          display: 'grid',
          gridTemplateColumns: '1fr auto auto auto auto',
          gap: '0.75rem',
          alignItems: 'center',
          backgroundColor: 'var(--color-surface-subtle, var(--color-border))',
          marginBottom: expanded ? '0.25rem' : 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          {expanded ? (
            <ChevronUp size={14} style={{ color: 'var(--color-text-muted)' }} />
          ) : (
            <ChevronDown size={14} style={{ color: 'var(--color-text-muted)' }} />
          )}
          <span style={{
            fontSize: '0.6875rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-secondary)',
          }}>
            {title}
          </span>
          <span style={{
            fontSize: '0.6875rem',
            color: 'var(--color-text-muted)',
            fontWeight: 400,
          }}>
            ({categories.length})
          </span>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'right' }}>
          Budgeted
        </span>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', textAlign: 'right', minWidth: '80px' }}>
          {fmtCurrency(totalBudgeted)}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'right' }}>
          Spent
        </span>
        <span style={{
          fontSize: '0.8125rem', fontWeight: 600,
          color: remainingColor(totalRemaining),
          textAlign: 'right', minWidth: '80px',
        }}>
          {fmtCurrency(totalActual)}
        </span>
      </button>

      {expanded && (
        <>
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_120px_100px_90px] gap-2 px-2 mb-0.5">
            <div />
            <div style={{ textAlign: 'right', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)' }}>Budget</div>
            <div className="hidden sm:block" style={{ textAlign: 'right', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)' }}>Actual</div>
            <div className="hidden sm:block" style={{ textAlign: 'right', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)' }}>Remaining</div>
          </div>

          <div style={{ height: 1, backgroundColor: 'var(--color-border)', marginBottom: '0.25rem' }} />

          {categories.length === 0 ? (
            <div style={{ padding: '0.75rem 0.5rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
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
          <div style={{ height: 1, backgroundColor: 'var(--color-border)', margin: '0.25rem 0' }} />
          <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_120px_100px_90px] gap-2 items-center px-2 py-1.5">
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              Total {title}:
            </span>
            <span style={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
              {fmtCurrency(totalBudgeted)}
            </span>
            <span className="hidden sm:block" style={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
              {fmtCurrency(totalActual)}
            </span>
            <span className="hidden sm:block" style={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 600, color: remainingColor(totalRemaining) }}>
              {fmtCurrency(totalRemaining)}
            </span>
          </div>

          {/* Add category button */}
          <div style={{ padding: '0.25rem 0.5rem 0' }}>
            <button
              onClick={() => setAddModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.8125rem',
                color: 'var(--color-accent)',
                fontWeight: 500,
                padding: '0.25rem 0',
              }}
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
    <div style={{ marginBottom: '1.5rem' }}>
      {/* Section header */}
      <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_120px_100px_90px] gap-2 items-center px-2 mb-1">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{
            fontSize: '0.6875rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-secondary)',
          }}>
            {group.name}
          </span>
          <button
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-muted)',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
            }}
            title={`${group.name} settings`}
          >
            <Settings size={12} />
          </button>
        </div>
        <div style={{ textAlign: 'right', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-secondary)' }}>Budget</div>
        <div className="hidden sm:block" style={{ textAlign: 'right', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-secondary)' }}>Actual</div>
        <div className="hidden sm:block" style={{ textAlign: 'right', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-secondary)' }}>Remaining</div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, backgroundColor: 'var(--color-border)', marginBottom: '0.25rem' }} />

      {/* Rows */}
      {group.categories.length === 0 ? (
        <div style={{ padding: '0.75rem 0.5rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
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
      <div style={{ height: 1, backgroundColor: 'var(--color-border)', margin: '0.25rem 0' }} />
      <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_120px_100px_90px] gap-2 items-center px-2 py-1.5">
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          Total {group.name}:
        </span>
        <span style={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
          {fmtCurrency(totalBudget)}
        </span>
        <span className="hidden sm:block" style={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
          {fmtCurrency(totalActual)}
        </span>
        <span className="hidden sm:block" style={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 600, color: remainingColor(totalRemaining) }}>
          {fmtCurrency(totalRemaining)}
        </span>
      </div>

      {/* Add category button */}
      <div style={{ padding: '0.25rem 0.5rem 0' }}>
        <button
          onClick={() => setAddModalOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.8125rem',
            color: 'var(--color-accent)',
            fontWeight: 500,
            padding: '0.25rem 0',
          }}
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
    <div style={{
      marginBottom: '1rem',
      border: '1px solid var(--color-warning)',
      borderRadius: 'var(--radius-md)',
      backgroundColor: 'var(--color-warning-light, rgba(245,158,11,0.08))',
      overflow: 'hidden',
    }}>
      {/* Banner row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.625rem',
        padding: '0.625rem 0.875rem',
      }}>
        <AlertTriangle size={15} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--color-text)', fontWeight: 500 }}>
          {categories.length} {categories.length === 1 ? 'category has' : 'categories have'} spending but no budget set.
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '0.8125rem', color: 'var(--color-warning)', fontWeight: 500,
          }}
        >
          {expanded ? 'Hide' : 'View unbudgeted categories'}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-muted)', padding: '0.125rem',
            display: 'flex', alignItems: 'center',
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Expanded list */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--color-warning)', backgroundColor: 'var(--color-surface)' }}>
          {categories.map((cat) => (
            <div
              key={cat.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.5rem 0.875rem',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              {cat.icon && <span style={{ fontSize: '1rem' }}>{cat.icon}</span>}
              <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)' }}>
                {cat.name}
              </span>
              <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                {fmtCurrency(cat.actual)} spent
              </span>
              <button
                onClick={() => {
                  setSelectedCategory(cat);
                  setAddModalOpen(true);
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                  padding: '0.25rem 0.625rem',
                  border: '1px solid var(--color-accent)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'transparent',
                  color: 'var(--color-accent)',
                  cursor: 'pointer',
                  fontSize: '0.8125rem', fontWeight: 500,
                }}
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
    <div style={{
      marginBottom: '1rem',
      padding: '0.875rem 1.25rem',
      border: `1px solid ${positive ? 'var(--color-success)' : 'var(--color-danger)'}`,
      borderRadius: 'var(--radius-md)',
      backgroundColor: positive
        ? 'var(--color-success-light, rgba(16,185,129,0.08))'
        : 'var(--color-danger-light, rgba(239,68,68,0.08))',
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      flexWrap: 'wrap',
    }}>
      {/* Main amount */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: positive ? 'var(--color-success)' : 'var(--color-danger)',
          }}>
            {fmtCurrency(Math.abs(leftToBudget))}
          </span>
          <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
            {positive ? 'left to budget' : 'over budget'}
          </span>
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
          {fmtCurrency(data.income.actual)} income
          {' '}&minus;{' '}
          {fmtCurrency(data.expenses.actual)} expenses
          {' '}={' '}
          <span style={{ color: positive ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 500 }}>
            {fmtCurrency(leftToBudget)}
          </span>
        </div>
      </div>

      {/* Savings rate badge */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
        <span style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          padding: '0.25rem 0.75rem',
          borderRadius: 'var(--radius-full)',
          backgroundColor: srStyle.bg,
          color: srStyle.color,
        }}>
          {Math.round(data.savingsRate)}%
        </span>
        <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <Skeleton height={48} width="60%" />
          <Skeleton height={16} width="40%" />
          <div style={{ height: 1, backgroundColor: 'var(--color-border)', margin: '0.5rem 0' }} />
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
      <div style={{ marginBottom: '1.25rem', textAlign: 'center' }}>
        <div style={{
          fontSize: '1.875rem',
          fontWeight: 700,
          color: positive ? 'var(--color-success)' : 'var(--color-danger)',
          lineHeight: 1.1,
        }}>
          {fmtCurrency(Math.abs(leftToBudget))}
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
          {positive ? 'Left to budget' : 'Over budget'}
        </div>
      </div>

      <div style={{ height: 1, backgroundColor: 'var(--color-border)', marginBottom: '1rem' }} />

      {/* Summary table */}
      <div style={{ marginBottom: '1rem' }}>
        {/* Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 70px 70px',
          gap: '0.25rem',
          marginBottom: '0.375rem',
        }}>
          <span style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)' }}></span>
          {(['Budget', 'Actual'] as const).map((h) => (
            <span key={h} style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', textAlign: 'right' }}>
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
        <div style={{ height: 1, backgroundColor: 'var(--color-border)', margin: '0.375rem 0' }} />

        {/* Total expenses row */}
        <SummaryRow label="Total Expenses" budget={data.expenses.budgeted} actual={data.expenses.actual} bold />
      </div>

      <div style={{ height: 1, backgroundColor: 'var(--color-border)', marginBottom: '0.875rem' }} />

      {/* Savings rate */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
          Savings Rate
        </span>
        <span style={{
          fontSize: '0.8125rem',
          fontWeight: 700,
          padding: '0.1875rem 0.625rem',
          borderRadius: 'var(--radius-full)',
          backgroundColor: srStyle.bg,
          color: srStyle.color,
        }}>
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
  const textStyle: React.CSSProperties = {
    fontSize: '0.8125rem',
    fontWeight: bold ? 600 : 400,
    color: 'var(--color-text)',
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 70px 70px',
      gap: '0.25rem',
      padding: '0.25rem 0',
      alignItems: 'center',
    }}>
      <span style={{ ...textStyle, color: bold ? 'var(--color-text)' : 'var(--color-text-secondary)' }}>
        {label}
      </span>
      <span style={{ ...textStyle, textAlign: 'right' }}>{fmtCurrency(budget)}</span>
      <span style={{ ...textStyle, textAlign: 'right' }}>{fmtCurrency(actual)}</span>
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
    <div style={{ padding: '1rem 0' }}>
      {/* Page header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1.25rem',
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}>
        {/* Month navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={goToPrev}
            aria-label="Previous month"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32,
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
          >
            <ChevronLeft size={16} />
          </button>

          <span style={{
            fontSize: '1rem',
            fontWeight: 600,
            color: 'var(--color-text)',
            minWidth: '10rem',
            textAlign: 'center',
          }}>
            {MONTH_NAMES[month - 1]} {year}
          </span>

          <button
            onClick={goToNext}
            aria-label="Next month"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32,
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
          >
            <ChevronRight size={16} />
          </button>

          {!isCurrentMonth && (
            <button
              onClick={goToToday}
              style={{
                padding: '0.25rem 0.75rem',
                fontSize: '0.8125rem',
                fontWeight: 500,
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
              }}
            >
              Today
            </button>
          )}
        </div>

        {/* Right side: period tabs + settings */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Period tabs */}
          <div style={{
            display: 'flex',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}>
            {PERIOD_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setPeriodTab(tab)}
                style={{
                  padding: '0.25rem 0.75rem',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  border: 'none',
                  borderRight: tab !== 'Decade' ? '1px solid var(--color-border)' : 'none',
                  cursor: 'pointer',
                  backgroundColor: periodTab === tab ? 'var(--color-accent)' : 'var(--color-surface)',
                  color: periodTab === tab ? '#fff' : 'var(--color-text-secondary)',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Settings icon */}
          <button
            aria-label="Budget settings"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32,
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <Skeleton height={16} width="30%" />
                  <div style={{ height: 1, backgroundColor: 'var(--color-border)' }} />
                  {[1, 2, 3].map((j) => (
                    <Skeleton key={j} height={44} width="100%" />
                  ))}
                </div>
              ))}
            </div>
          ) : !budgetData ? (
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', padding: '1rem 0' }}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                  Expenses:
                </span>
                <div style={{
                  display: 'flex',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                }}>
                  {([
                    { value: 'byType' as ExpenseViewTab, label: 'By Type' },
                    { value: 'byGroup' as ExpenseViewTab, label: 'By Group' },
                  ]).map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setExpenseViewTab(t.value)}
                      style={{
                        padding: '0.1875rem 0.625rem',
                        fontSize: '0.8125rem',
                        fontWeight: 500,
                        border: 'none',
                        borderRight: t.value === 'byType' ? '1px solid var(--color-border)' : 'none',
                        cursor: 'pointer',
                        backgroundColor: expenseViewTab === t.value ? 'var(--color-accent)' : 'var(--color-surface)',
                        color: expenseViewTab === t.value ? '#fff' : 'var(--color-text-secondary)',
                        transition: 'background 0.15s, color 0.15s',
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
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
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
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  No budget categories set up yet. Use &quot;+ Add category&quot; to get started.
                </div>
              )}
            </>
          )}
        </Card>

        {/* Right column — Summary panel + AI Coach */}
        <div style={{ position: 'sticky', top: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
              Get personalised tips for this month's budget.
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
