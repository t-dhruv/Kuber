import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Settings, Pencil, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Input, Select, Modal, ModalFooter, Skeleton, Card } from '@/components/ui';

// ─── Formatters ──────────────────────────────────────────────────────────────

const fmtCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface BudgetLineItem {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon?: string;
  budgetAmount: number;
  actualAmount: number;
}

interface BudgetGroup {
  id: string;
  name: string;
  type: 'income' | 'expense';
  items: BudgetLineItem[];
}

interface BudgetData {
  year: number;
  month: number;
  groups: BudgetGroup[];
  totalIncomeBudget: number;
  totalIncomeActual: number;
  totalExpenseBudget: number;
  totalExpenseActual: number;
}

interface CategoryOption {
  id: string;
  name: string;
  icon?: string;
  group?: string;
}

interface CategoriesData {
  categories: CategoryOption[];
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

// ─── Inline Editable Budget Cell ──────────────────────────────────────────────

function EditableBudgetCell({
  value,
  onSave,
}: {
  value: number;
  onSave: (newValue: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(value.toFixed(2));
    setEditing(true);
  }

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const parsed = parseFloat(draft);
    if (!isNaN(parsed) && parsed !== value) {
      onSave(parsed);
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
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
    );
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={startEdit}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        cursor: 'pointer',
        padding: '2px 4px',
        borderRadius: 'var(--radius-sm)',
        borderBottom: hovered ? '1px dashed var(--color-border-strong)' : '1px dashed transparent',
        transition: 'border-color 0.15s',
        fontSize: '0.875rem',
        color: 'var(--color-text)',
      }}
    >
      {hovered && (
        <Pencil size={11} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
      )}
      {fmtCurrency(value)}
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

// ─── Add Category Modal ───────────────────────────────────────────────────────

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
  const queryClient = useQueryClient();

  const availableCategories = allCategories.filter(
    (c) => !existingCategoryIds.includes(c.id)
  );

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/budgets', {
        categoryId: selectedCategoryId,
        amount: parseFloat(amount),
        month,
        year,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets', year, month] });
      onSaved();
      onClose();
      setSelectedCategoryId('');
      setAmount('');
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
          >
            <option value="">Select a category...</option>
            {availableCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon ? `${c.icon} ` : ''}{c.name}
              </option>
            ))}
          </Select>
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
  item: BudgetLineItem;
  year: number;
  month: number;
  onNavigateToTransactions?: (categoryId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [hovered, setHovered] = useState(false);
  const remaining = item.budgetAmount - item.actualAmount;

  const saveMutation = useMutation({
    mutationFn: (newAmount: number) =>
      api.post('/budgets', {
        categoryId: item.categoryId,
        amount: newAmount,
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
      {/* Main row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 110px 100px 90px',
        alignItems: 'center',
        height: '44px',
        gap: '0.5rem',
      }}>
        {/* Name */}
        <div
          onClick={() => onNavigateToTransactions?.(item.categoryId)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
            overflow: 'hidden',
          }}
        >
          {item.categoryIcon && (
            <span style={{ fontSize: '1rem', flexShrink: 0 }}>{item.categoryIcon}</span>
          )}
          <span style={{
            fontSize: '0.875rem',
            fontWeight: 500,
            color: 'var(--color-text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {item.categoryName}
          </span>
        </div>

        {/* Budget (editable) */}
        <div style={{ textAlign: 'right' }}>
          <EditableBudgetCell
            value={item.budgetAmount}
            onSave={(v) => saveMutation.mutate(v)}
          />
        </div>

        {/* Actual */}
        <div style={{ textAlign: 'right', fontSize: '0.875rem', color: 'var(--color-text)' }}>
          {fmtCurrency(item.actualAmount)}
        </div>

        {/* Remaining */}
        <div style={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 500, color: remainingColor(remaining) }}>
          {fmtCurrency(remaining)}
        </div>
      </div>

      {/* Progress bar row */}
      <div style={{ paddingBottom: '4px' }}>
        <ProgressBar actual={item.actualAmount} budget={item.budgetAmount} />
      </div>
    </div>
  );
}

// ─── Budget Group Section ─────────────────────────────────────────────────────

function BudgetGroupSection({
  group,
  year,
  month,
  allCategories,
  onNavigateToTransactions,
}: {
  group: BudgetGroup;
  year: number;
  month: number;
  allCategories: CategoryOption[];
  onNavigateToTransactions?: (categoryId: string) => void;
}) {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const totalBudget = group.items.reduce((sum, i) => sum + i.budgetAmount, 0);
  const totalActual = group.items.reduce((sum, i) => sum + i.actualAmount, 0);
  const totalRemaining = totalBudget - totalActual;
  const existingIds = group.items.map((i) => i.categoryId);

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      {/* Section header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 110px 100px 90px',
        gap: '0.5rem',
        alignItems: 'center',
        padding: '0 0.5rem',
        marginBottom: '0.25rem',
      }}>
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
        <div style={{ textAlign: 'right', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-secondary)' }}>Actual</div>
        <div style={{ textAlign: 'right', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-secondary)' }}>Remaining</div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, backgroundColor: 'var(--color-border)', marginBottom: '0.25rem' }} />

      {/* Rows */}
      {group.items.length === 0 ? (
        <div style={{ padding: '0.75rem 0.5rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
          No categories yet.
        </div>
      ) : (
        group.items.map((item) => (
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
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 110px 100px 90px',
        gap: '0.5rem',
        alignItems: 'center',
        padding: '0.375rem 0.5rem',
      }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          Total {group.name}:
        </span>
        <span style={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
          {fmtCurrency(totalBudget)}
        </span>
        <span style={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
          {fmtCurrency(totalActual)}
        </span>
        <span style={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 600, color: remainingColor(totalRemaining) }}>
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

// ─── Summary Panel ────────────────────────────────────────────────────────────

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

  const incomeGroups = data.groups.filter((g) => g.type === 'income');
  const expenseGroups = data.groups.filter((g) => g.type === 'expense');

  // Compute per-group totals for expense groups
  const expenseGroupTotals = expenseGroups.map((g) => ({
    name: g.name,
    budget: g.items.reduce((s, i) => s + i.budgetAmount, 0),
    actual: g.items.reduce((s, i) => s + i.actualAmount, 0),
  }));

  const leftToBudget = data.totalIncomeBudget - data.totalExpenseBudget;
  const leftToBudgetPositive = leftToBudget >= 0;

  const savingsRate =
    data.totalIncomeBudget > 0
      ? Math.round(((data.totalIncomeBudget - data.totalExpenseBudget) / data.totalIncomeBudget) * 100)
      : 0;

  const srStyle = savingsRateStyle(savingsRate);

  return (
    <Card padding="lg">
      {/* Left to budget */}
      <div style={{ marginBottom: '1.25rem', textAlign: 'center' }}>
        <div style={{
          fontSize: '1.875rem',
          fontWeight: 700,
          color: leftToBudgetPositive ? 'var(--color-success)' : 'var(--color-danger)',
          lineHeight: 1.1,
        }}>
          {fmtCurrency(Math.abs(leftToBudget))}
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
          {leftToBudgetPositive ? 'Left to budget' : 'Over budget'}
        </div>
      </div>

      <div style={{ height: 1, backgroundColor: 'var(--color-border)', marginBottom: '1rem' }} />

      {/* Summary table */}
      <div style={{ marginBottom: '1rem' }}>
        {/* Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 70px 70px 70px',
          gap: '0.25rem',
          marginBottom: '0.375rem',
        }}>
          <span style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)' }}></span>
          {(['Budget', 'Actual', 'Remaining'] as const).map((h) => (
            <span key={h} style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', textAlign: 'right' }}>
              {h}
            </span>
          ))}
        </div>

        {/* Income row */}
        <SummaryRow
          label="Income"
          budget={data.totalIncomeBudget}
          actual={data.totalIncomeActual}
        />

        {/* Each expense group */}
        {expenseGroupTotals.map((g) => (
          <SummaryRow
            key={g.name}
            label={g.name}
            budget={g.budget}
            actual={g.actual}
          />
        ))}

        {/* Divider */}
        <div style={{ height: 1, backgroundColor: 'var(--color-border)', margin: '0.375rem 0' }} />

        {/* Total row */}
        <SummaryRow
          label="Total"
          budget={data.totalExpenseBudget}
          actual={data.totalExpenseActual}
          bold
        />
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
          {savingsRate}%
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
  const remaining = budget - actual;
  const style: React.CSSProperties = {
    fontSize: bold ? '0.8125rem' : '0.8125rem',
    fontWeight: bold ? 600 : 400,
    color: 'var(--color-text)',
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 70px 70px 70px',
      gap: '0.25rem',
      padding: '0.25rem 0',
      alignItems: 'center',
    }}>
      <span style={{ ...style, color: bold ? 'var(--color-text)' : 'var(--color-text-secondary)' }}>
        {label}
      </span>
      <span style={{ ...style, textAlign: 'right' }}>{fmtCurrency(budget)}</span>
      <span style={{ ...style, textAlign: 'right' }}>{fmtCurrency(actual)}</span>
      <span style={{ ...style, textAlign: 'right', color: remaining < 0 ? 'var(--color-danger)' : (bold ? 'var(--color-text)' : 'var(--color-text-secondary)') }}>
        {fmtCurrency(remaining)}
      </span>
    </div>
  );
}

// ─── Period Tabs ──────────────────────────────────────────────────────────────

type PeriodTab = 'Month' | 'Year' | 'Decade';
const PERIOD_TABS: PeriodTab[] = ['Month', 'Year', 'Decade'];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BudgetPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [periodTab, setPeriodTab] = useState<PeriodTab>('Month');

  const { data: budgetData, isLoading: budgetLoading } = useQuery<BudgetData>({
    queryKey: ['budgets', year, month],
    queryFn: () => api.get(`/budgets?year=${year}&month=${month}`).then((r) => r.data),
  });

  const { data: categoriesData } = useQuery<CategoriesData>({
    queryKey: ['budget-categories'],
    queryFn: () => api.get('/budgets/categories').then((r) => r.data),
  });

  const allCategories = categoriesData?.categories ?? [];

  function goToPrev() {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function goToNext() {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  function goToToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
  }

  const isCurrentMonth =
    year === today.getFullYear() && month === today.getMonth() + 1;

  const incomeGroups = budgetData?.groups.filter((g) => g.type === 'income') ?? [];
  const expenseGroups = budgetData?.groups.filter((g) => g.type === 'expense') ?? [];

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

      {/* Two-column layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '65fr 35fr',
        gap: '1.25rem',
        alignItems: 'start',
      }}>
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
              {/* Income groups */}
              {incomeGroups.map((group) => (
                <BudgetGroupSection
                  key={group.id}
                  group={group}
                  year={year}
                  month={month}
                  allCategories={allCategories}
                />
              ))}

              {/* Expense groups */}
              {expenseGroups.map((group) => (
                <BudgetGroupSection
                  key={group.id}
                  group={group}
                  year={year}
                  month={month}
                  allCategories={allCategories}
                />
              ))}

              {incomeGroups.length === 0 && expenseGroups.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  No budget categories set up yet. Use "+ Add category" to get started.
                </div>
              )}
            </>
          )}
        </Card>

        {/* Right column — Summary panel */}
        <div style={{ position: 'sticky', top: '1rem' }}>
          <SummaryPanel data={budgetData} />
        </div>
      </div>
    </div>
  );
}
