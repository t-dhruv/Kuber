import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, MoreHorizontal, Pencil, Trash2, MessageSquare, Wallet, CreditCard } from 'lucide-react';
import { api } from '@/lib/api';
import {
  Card, Button, Input, Modal, ModalFooter, Skeleton, Select,
} from '@/components/ui';
import { notify } from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

type GoalStatus = 'on_track' | 'at_risk' | 'completed';
type GoalType = 'savings' | 'vacation' | 'home' | 'wedding' | 'education' | 'car' | 'other' | 'debt';
type SubTab = 'save_up' | 'pay_down';

interface LinkedAccount {
  id: string;
  name: string;
  balance: number;
  type: string;
  institution?: string | null;
}

interface Goal {
  id: string;
  name: string;
  type: GoalType;
  currentAmount: number;
  targetAmount: number;
  targetDate?: string;
  monthlyContribution?: number;
  status: GoalStatus;
  imageUrl?: string;
  accountId?: string | null;
  linkedAccount?: LinkedAccount | null;
}

interface DebtAccount {
  id: string;
  name: string;
  type: string;
  balance: number;
  institution?: string | null;
}

interface GoalFormValues {
  name: string;
  type: GoalType;
  targetAmount: string;
  targetDate: string;
  currentAmount: string;
  monthlyContribution: string;
}

interface DebtGoalFormValues {
  name: string;
  targetAmount: string;
  accountId: string;
  monthlyContribution: string;
  targetDate: string;
}

const EMPTY_GOAL_FORM: GoalFormValues = {
  name: '',
  type: 'savings',
  targetAmount: '',
  targetDate: '',
  currentAmount: '0',
  monthlyContribution: '',
};

const EMPTY_DEBT_FORM: DebtGoalFormValues = {
  name: '',
  targetAmount: '',
  accountId: '',
  monthlyContribution: '',
  targetDate: '',
};

interface ContributeFormValues {
  amount: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GOAL_TYPES: { value: GoalType; label: string; emoji: string }[] = [
  { value: 'savings', label: 'Savings', emoji: '💰' },
  { value: 'vacation', label: 'Vacation', emoji: '🏖' },
  { value: 'home', label: 'Home Down Payment', emoji: '🏠' },
  { value: 'wedding', label: 'Wedding', emoji: '💍' },
  { value: 'education', label: 'Education', emoji: '📚' },
  { value: 'car', label: 'Car', emoji: '🚗' },
  { value: 'other', label: 'Other', emoji: '🎯' },
];

const GOAL_GRADIENTS: Record<GoalType, string> = {
  savings: 'linear-gradient(135deg, #2f9e44 0%, #0c8599 100%)',
  vacation: 'linear-gradient(135deg, #1971c2 0%, #0c8599 100%)',
  home: 'linear-gradient(135deg, #E5622A 0%, #e67700 100%)',
  wedding: 'linear-gradient(135deg, #9c36b5 0%, #E5622A 100%)',
  education: 'linear-gradient(135deg, #1971c2 0%, #9c36b5 100%)',
  car: 'linear-gradient(135deg, #0c8599 0%, #2f9e44 100%)',
  other: 'linear-gradient(135deg, #e67700 0%, #E5622A 100%)',
  debt: 'linear-gradient(135deg, #c92a2a 0%, #e67700 100%)',
};

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const fmtDate = (date: string) =>
  new Date(date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

function goalStatusStyle(status: GoalStatus): { bg: string; color: string; label: string } {
  switch (status) {
    case 'on_track':
      return { bg: 'var(--color-success-light)', color: 'var(--color-success)', label: 'On Track' };
    case 'at_risk':
      return { bg: 'var(--color-warning-light)', color: 'var(--color-warning)', label: 'At Risk' };
    case 'completed':
      return { bg: 'var(--color-border)', color: 'var(--color-text-secondary)', label: 'Completed ✓' };
  }
}

// ─── Goal Card Overflow Menu ──────────────────────────────────────────────────

function GoalOverflowMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: 'rgba(0,0,0,0.35)', border: 'none', cursor: 'pointer',
          padding: '0.25rem 0.375rem', borderRadius: 'var(--radius-sm)',
          color: '#fff', display: 'flex', alignItems: 'center',
        }}
        aria-label="Goal options"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: '0.25rem',
          backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
          minWidth: 120, zIndex: 50,
        }}>
          {[
            { label: 'Edit', icon: <Pencil size={13} />, action: onEdit, danger: false },
            { label: 'Delete', icon: <Trash2 size={13} />, action: onDelete, danger: true },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => { item.action(); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                width: '100%', padding: '0.5rem 0.75rem', background: 'none', border: 'none',
                cursor: 'pointer', fontSize: '0.8125rem',
                color: item.danger ? 'var(--color-danger)' : 'var(--color-text)',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Goal Card ────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  onEdit,
  onDelete,
  onContribute,
}: {
  goal: Goal;
  onEdit: () => void;
  onDelete: () => void;
  onContribute: () => void;
}) {
  const pct = goal.targetAmount > 0 ? Math.min(goal.currentAmount / goal.targetAmount, 1) : 0;
  const statusStyle = goalStatusStyle(goal.status);
  const gradient = GOAL_GRADIENTS[goal.type] ?? GOAL_GRADIENTS.other;
  const typeInfo = GOAL_TYPES.find((t) => t.value === goal.type) ?? GOAL_TYPES[6];

  return (
    <div style={{
      backgroundColor: 'var(--color-surface)',
      borderRadius: 'var(--radius-xl)',
      border: '1px solid var(--color-border)',
      boxShadow: 'var(--shadow-sm)',
      overflow: 'hidden',
    }}>
      {/* Card image / gradient header */}
      <div style={{
        height: 80,
        background: goal.imageUrl ? `url(${goal.imageUrl}) center/cover` : gradient,
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-end',
        padding: '0.5rem',
      }}>
        <GoalOverflowMenu onEdit={onEdit} onDelete={onDelete} />
      </div>

      {/* Card body */}
      <div style={{ padding: '1rem' }}>
        {/* Name + status */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span style={{ fontSize: '1rem' }}>{typeInfo.emoji}</span>
              <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-text)' }}>{goal.name}</span>
            </div>
          </div>
          <span style={{
            flexShrink: 0,
            fontSize: '0.6875rem', fontWeight: 600,
            padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-full)',
            backgroundColor: statusStyle.bg, color: statusStyle.color,
          }}>
            {statusStyle.label}
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
            <span>{Math.round(pct * 100)}%</span>
          </div>
          <div style={{ height: 8, backgroundColor: 'var(--color-border)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${pct * 100}%`,
              backgroundColor: 'var(--color-accent)',
              borderRadius: 'var(--radius-full)',
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>

        {/* Amounts */}
        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '0.375rem' }}>
          <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{fmtCurrency(goal.currentAmount)}</span>
          {' / '}
          {fmtCurrency(goal.targetAmount)}
        </div>

        {/* Target date + monthly */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', marginBottom: '0.875rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          {goal.targetDate && (
            <span>Target: {fmtDate(goal.targetDate)}</span>
          )}
          {goal.monthlyContribution != null && goal.monthlyContribution > 0 && (
            <span>Monthly: {fmtCurrency(goal.monthlyContribution)}/mo</span>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {goal.status !== 'completed' && (
            <Button size="sm" variant="outline" icon={<Plus size={12} />} onClick={onContribute} style={{ flex: 1 }}>
              Add funds
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Debt Goal Card ───────────────────────────────────────────────────────────

function DebtGoalCard({
  goal,
  onEdit,
  onDelete,
  onPayment,
}: {
  goal: Goal;
  onEdit: () => void;
  onDelete: () => void;
  onPayment: () => void;
}) {
  const pct = goal.targetAmount > 0 ? Math.min(goal.currentAmount / goal.targetAmount, 1) : 0;
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  const statusStyle = goalStatusStyle(goal.status);

  return (
    <div style={{
      backgroundColor: 'var(--color-surface)',
      borderRadius: 'var(--radius-xl)',
      border: '1px solid var(--color-border)',
      boxShadow: 'var(--shadow-sm)',
      overflow: 'hidden',
    }}>
      {/* Gradient header */}
      <div style={{
        height: 80,
        background: GOAL_GRADIENTS.debt,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.5rem 0.75rem',
      }}>
        <span style={{ fontSize: '1.75rem' }}>💳</span>
        <GoalOverflowMenu onEdit={onEdit} onDelete={onDelete} />
      </div>

      {/* Card body */}
      <div style={{ padding: '1rem' }}>
        {/* Name + status */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-text)' }}>{goal.name}</span>
          <span style={{
            flexShrink: 0,
            fontSize: '0.6875rem', fontWeight: 600,
            padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-full)',
            backgroundColor: statusStyle.bg, color: statusStyle.color,
          }}>
            {statusStyle.label}
          </span>
        </div>

        {/* Debt amounts row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginBottom: '0.125rem' }}>Original</div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)' }}>{fmtCurrency(goal.targetAmount)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginBottom: '0.125rem' }}>Paid Off</div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-success)' }}>{fmtCurrency(goal.currentAmount)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginBottom: '0.125rem' }}>Remaining</div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-danger)' }}>{fmtCurrency(remaining)}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: '0.625rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
            <span>{Math.round(pct * 100)}% paid off</span>
          </div>
          <div style={{ height: 8, backgroundColor: 'var(--color-border)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${pct * 100}%`,
              background: 'linear-gradient(90deg, #c92a2a, #e67700)',
              borderRadius: 'var(--radius-full)',
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>

        {/* Linked account */}
        {goal.linkedAccount && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.375rem',
            fontSize: '0.75rem', color: 'var(--color-text-secondary)',
            backgroundColor: 'var(--color-surface-hover)',
            borderRadius: 'var(--radius-sm)', padding: '0.25rem 0.5rem',
            marginBottom: '0.625rem',
          }}>
            <CreditCard size={11} />
            <span>{goal.linkedAccount.name}</span>
            <span style={{ marginLeft: 'auto', color: 'var(--color-danger)', fontWeight: 500 }}>
              {fmtCurrency(goal.linkedAccount.balance)}
            </span>
          </div>
        )}

        {/* Meta */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', marginBottom: '0.875rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          {goal.targetDate && <span>Target payoff: {fmtDate(goal.targetDate)}</span>}
          {goal.monthlyContribution != null && goal.monthlyContribution > 0 && (
            <span>Monthly payment: {fmtCurrency(goal.monthlyContribution)}/mo</span>
          )}
        </div>

        {/* Actions */}
        {goal.status !== 'completed' && (
          <Button size="sm" variant="outline" icon={<CreditCard size={12} />} onClick={onPayment} style={{ width: '100%' }}>
            Make Payment
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Pay Down Summary Strip ───────────────────────────────────────────────────

function PayDownSummary({ goals }: { goals: Goal[] }) {
  const totalDebt = goals.reduce((s, g) => s + Math.max(0, g.targetAmount - g.currentAmount), 0);
  const totalMonthly = goals.reduce((s, g) => s + (g.monthlyContribution ?? 0), 0);

  let debtFreeLabel = '—';
  if (totalMonthly > 0 && totalDebt > 0) {
    const monthsToFree = Math.ceil(totalDebt / totalMonthly);
    const freeDate = new Date();
    freeDate.setMonth(freeDate.getMonth() + monthsToFree);
    debtFreeLabel = freeDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } else if (totalDebt === 0) {
    debtFreeLabel = 'Debt free!';
  }

  return (
    <div style={{
      display: 'flex', gap: '0', marginBottom: '1.25rem',
      backgroundColor: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
    }}>
      {[
        { label: 'Total Debt', value: fmtCurrency(totalDebt), color: 'var(--color-danger)' },
        { label: 'Monthly Payments', value: totalMonthly > 0 ? `${fmtCurrency(totalMonthly)}/mo` : '—', color: 'var(--color-text)' },
        { label: 'Debt-Free Date', value: `~${debtFreeLabel}`, color: 'var(--color-success)' },
      ].map((item, i) => (
        <div
          key={item.label}
          style={{
            flex: 1, padding: '0.875rem 1rem', textAlign: 'center',
            borderLeft: i > 0 ? '1px solid var(--color-border)' : 'none',
          }}
        >
          <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {item.label}
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: item.color }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function GoalsEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 1rem', textAlign: 'center' }}>
      <svg width="96" height="96" viewBox="0 0 96 96" fill="none" style={{ marginBottom: '1.5rem' }}>
        <circle cx="48" cy="48" r="44" fill="var(--color-accent-light)" />
        <circle cx="48" cy="48" r="28" fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeDasharray="6 4" />
        <circle cx="48" cy="48" r="16" fill="var(--color-accent)" opacity="0.2" />
        <circle cx="48" cy="48" r="8" fill="var(--color-accent)" />
        <path d="M48 8 L52 16 L60 16 L54 22 L56 30 L48 26 L40 30 L42 22 L36 16 L44 16 Z" fill="var(--color-accent)" opacity="0.6" />
      </svg>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: '0.5rem' }}>
        Plan for your future
      </h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', maxWidth: 320, marginBottom: '1.5rem' }}>
        Set financial goals and track your progress toward what matters most.
      </p>
      <Button icon={<Plus size={14} />} onClick={onAdd}>
        Add goal
      </Button>
    </div>
  );
}

function DebtEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 1rem', textAlign: 'center' }}>
      <div style={{
        width: 72, height: 72, borderRadius: 'var(--radius-full)',
        background: GOAL_GRADIENTS.debt,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '2rem', marginBottom: '1.25rem',
      }}>
        💳
      </div>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: '0.5rem' }}>
        No debt goals yet
      </h2>
      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', maxWidth: 340, marginBottom: '1.5rem' }}>
        Link a loan or credit card and track your payoff journey.
      </p>
      <Button icon={<Plus size={14} />} onClick={onAdd}>
        Add debt goal
      </Button>
    </div>
  );
}

// ─── Add Goal Modal (Save Up) ─────────────────────────────────────────────────

function AddGoalModal({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: Goal | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<GoalFormValues>(EMPTY_GOAL_FORM);

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        type: editing.type as GoalType,
        targetAmount: String(editing.targetAmount),
        targetDate: editing.targetDate ? editing.targetDate.slice(0, 10) : '',
        currentAmount: String(editing.currentAmount),
        monthlyContribution: editing.monthlyContribution != null ? String(editing.monthlyContribution) : '',
      });
    } else {
      setForm(EMPTY_GOAL_FORM);
    }
  }, [editing, open]);

  function set(field: keyof GoalFormValues, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const createMut = useMutation({
    mutationFn: (body: object) => api.post('/goals', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      notify.success('Goal created');
      onClose();
    },
    onError: () => notify.error('Failed to create goal'),
  });

  const updateMut = useMutation({
    mutationFn: (body: object) => api.put(`/goals/${editing!.id}`, body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      notify.success('Goal updated');
      onClose();
    },
    onError: () => notify.error('Failed to update goal'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      name: form.name.trim(),
      type: form.type,
      targetAmount: parseFloat(form.targetAmount),
      targetDate: form.targetDate || undefined,
      currentAmount: parseFloat(form.currentAmount) || 0,
      monthlyContribution: form.monthlyContribution ? parseFloat(form.monthlyContribution) : undefined,
    };
    if (editing) {
      updateMut.mutate(body);
    } else {
      createMut.mutate(body);
    }
  }

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Goal' : 'New Goal'}
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        {/* Goal type selector */}
        {!editing && (
          <div style={{ marginBottom: '1.25rem' }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)', marginBottom: '0.625rem' }}>
              Goal type
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
              {GOAL_TYPES.map((gt) => (
                <button
                  key={gt.value}
                  type="button"
                  onClick={() => set('type', gt.value)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    padding: '0.625rem 0.375rem', borderRadius: 'var(--radius-md)',
                    border: form.type === gt.value
                      ? '2px solid var(--color-accent)'
                      : '1px solid var(--color-border)',
                    backgroundColor: form.type === gt.value ? 'var(--color-accent-light)' : 'var(--color-surface)',
                    cursor: 'pointer', gap: '0.25rem', transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: '1.25rem' }}>{gt.emoji}</span>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 500, color: form.type === gt.value ? 'var(--color-accent)' : 'var(--color-text-secondary)', textAlign: 'center', lineHeight: 1.3 }}>
                    {gt.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Input
            label="Goal name"
            placeholder="e.g. Emergency Fund, Bali Trip..."
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Input
              label="Target amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="10000"
              value={form.targetAmount}
              onChange={(e) => set('targetAmount', e.target.value)}
              required
            />
            <Input
              label="Target date"
              type="date"
              value={form.targetDate}
              onChange={(e) => set('targetDate', e.target.value)}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Input
              label="Starting amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={form.currentAmount}
              onChange={(e) => set('currentAmount', e.target.value)}
            />
            <Input
              label="Monthly contribution"
              type="number"
              step="0.01"
              min="0"
              placeholder="150"
              value={form.monthlyContribution}
              onChange={(e) => set('monthlyContribution', e.target.value)}
            />
          </div>
        </div>

        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isPending}>{editing ? 'Save' : 'Create goal'}</Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// ─── Add Debt Goal Modal ──────────────────────────────────────────────────────

function AddDebtGoalModal({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: Goal | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<DebtGoalFormValues>(EMPTY_DEBT_FORM);

  const { data: debtAccounts } = useQuery<DebtAccount[]>({
    queryKey: ['goals', 'accounts-for-debt'],
    queryFn: () => api.get('/goals/accounts-for-debt').then((r) => r.data),
    enabled: open,
  });

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        targetAmount: String(editing.targetAmount),
        accountId: editing.accountId ?? '',
        monthlyContribution: editing.monthlyContribution != null ? String(editing.monthlyContribution) : '',
        targetDate: editing.targetDate ? editing.targetDate.slice(0, 10) : '',
      });
    } else {
      setForm(EMPTY_DEBT_FORM);
    }
  }, [editing, open]);

  function set(field: keyof DebtGoalFormValues, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // When account is selected, auto-fill targetAmount from abs(balance) if not editing
  function handleAccountChange(accountId: string) {
    set('accountId', accountId);
    if (!editing && accountId && debtAccounts) {
      const acct = debtAccounts.find((a) => a.id === accountId);
      if (acct && !form.targetAmount) {
        set('targetAmount', String(Math.abs(acct.balance)));
      }
    }
  }

  const createMut = useMutation({
    mutationFn: (body: object) => api.post('/goals', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      notify.success('Debt goal created');
      onClose();
    },
    onError: () => notify.error('Failed to create debt goal'),
  });

  const updateMut = useMutation({
    mutationFn: (body: object) => api.put(`/goals/${editing!.id}`, body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      notify.success('Debt goal updated');
      onClose();
    },
    onError: () => notify.error('Failed to update debt goal'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      name: form.name.trim(),
      type: 'debt',
      targetAmount: parseFloat(form.targetAmount),
      accountId: form.accountId || undefined,
      monthlyContribution: form.monthlyContribution ? parseFloat(form.monthlyContribution) : undefined,
      targetDate: form.targetDate || undefined,
    };
    if (editing) {
      updateMut.mutate(body);
    } else {
      createMut.mutate(body);
    }
  }

  const isPending = createMut.isPending || updateMut.isPending;

  const accountOptions = debtAccounts?.map((a) => ({
    value: a.id,
    label: `${a.name}${a.institution ? ` (${a.institution})` : ''} — ${fmtCurrency(a.balance)}`,
  })) ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Debt Goal' : 'New Debt Goal'}
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Input
            label="Goal name"
            placeholder="e.g. Pay off Visa, Student Loan..."
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Input
              label="Total debt amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="5000"
              value={form.targetAmount}
              onChange={(e) => set('targetAmount', e.target.value)}
              required
            />
            <Input
              label="Monthly payment"
              type="number"
              step="0.01"
              min="0"
              placeholder="200"
              value={form.monthlyContribution}
              onChange={(e) => set('monthlyContribution', e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)', display: 'block', marginBottom: '0.375rem' }}>
              Link account <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(optional)</span>
            </label>
            {debtAccounts && debtAccounts.length > 0 ? (
              <Select
                value={form.accountId}
                onChange={(e) => handleAccountChange(e.target.value)}
                options={[
                  { value: '', label: 'No linked account' },
                  ...accountOptions,
                ]}
              />
            ) : (
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', padding: '0.5rem 0' }}>
                No credit card or loan accounts found. Add one in Accounts first.
              </p>
            )}
          </div>

          <Input
            label="Target payoff date"
            type="date"
            value={form.targetDate}
            onChange={(e) => set('targetDate', e.target.value)}
          />
        </div>

        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isPending}>{editing ? 'Save' : 'Create debt goal'}</Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// ─── Contribute Modal ─────────────────────────────────────────────────────────

function ContributeModal({
  open,
  onClose,
  goal,
}: {
  open: boolean;
  onClose: () => void;
  goal: Goal | null;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ContributeFormValues>({ amount: '' });

  useEffect(() => {
    if (open) setForm({ amount: '' });
  }, [open]);

  const contributeMut = useMutation({
    mutationFn: (body: object) =>
      api.post(`/goals/${goal!.id}/contribute`, body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      notify.success(goal?.type === 'debt' ? 'Payment recorded' : 'Funds added');
      onClose();
    },
    onError: () => notify.error('Failed to record payment'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    contributeMut.mutate({ amount: parseFloat(form.amount) });
  }

  const isDebt = goal?.type === 'debt';
  const remaining = goal ? Math.max(goal.targetAmount - goal.currentAmount, 0) : 0;
  const pct = goal && goal.targetAmount > 0 ? Math.min(goal.currentAmount / goal.targetAmount, 1) : 0;

  return (
    <Modal open={open} onClose={onClose} title={isDebt ? 'Make Payment' : 'Add Funds'} size="sm">
      {goal && (
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: '0.5rem' }}>
            {goal.name}
          </p>
          <div style={{ height: 6, backgroundColor: 'var(--color-border)', borderRadius: 'var(--radius-full)', overflow: 'hidden', marginBottom: '0.375rem' }}>
            <div style={{
              height: '100%', width: `${pct * 100}%`,
              background: isDebt ? 'linear-gradient(90deg, #c92a2a, #e67700)' : 'var(--color-accent)',
              borderRadius: 'var(--radius-full)',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
            {isDebt ? (
              <>
                <span>{fmtCurrency(goal.currentAmount)} paid off</span>
                <span>{fmtCurrency(remaining)} remaining</span>
              </>
            ) : (
              <>
                <span>{fmtCurrency(goal.currentAmount)} saved</span>
                <span>{fmtCurrency(remaining)} to go</span>
              </>
            )}
          </div>
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <Input
          label={isDebt ? 'Payment amount' : 'Amount to add'}
          type="number"
          step="0.01"
          min="0.01"
          placeholder={goal?.monthlyContribution ? String(goal.monthlyContribution) : '150.00'}
          value={form.amount}
          onChange={(e) => setForm({ amount: e.target.value })}
          required
        />
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={contributeMut.isPending}>
            {isDebt ? 'Record payment' : 'Add funds'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteGoalModal({
  open,
  onClose,
  goal,
}: {
  open: boolean;
  onClose: () => void;
  goal: Goal | null;
}) {
  const qc = useQueryClient();
  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/goals/${goal!.id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      notify.success('Goal deleted');
      onClose();
    },
    onError: () => notify.error('Failed to delete goal'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Delete Goal" size="sm">
      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
        Delete <strong>{goal?.name}</strong>? This cannot be undone.
      </p>
      <ModalFooter>
        <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
        <Button variant="danger" loading={deleteMut.isPending} onClick={() => deleteMut.mutate()}>Delete</Button>
      </ModalFooter>
    </Modal>
  );
}

// ─── Pay Down Goals Panel ─────────────────────────────────────────────────────

function PayDownGoals({
  goals,
  isLoading,
  isError,
  onAdd,
  onEdit,
  onDelete,
  onPayment,
}: {
  goals: Goal[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onAdd: () => void;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  onPayment: (goal: Goal) => void;
}) {
  const debtGoals = goals?.filter((g) => g.type === 'debt') ?? [];

  if (isLoading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
        {[1, 2].map((i) => (
          <Card key={i} padding="none">
            <Skeleton height={80} width="100%" style={{ borderRadius: '0' }} />
            <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              <Skeleton height={16} width="60%" />
              <Skeleton height={8} width="100%" />
              <Skeleton height={13} width="80%" />
              <Skeleton height={32} width="100%" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card padding="lg">
        <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>Failed to load debt goals.</p>
      </Card>
    );
  }

  if (debtGoals.length === 0) {
    return <DebtEmptyState onAdd={onAdd} />;
  }

  return (
    <>
      <PayDownSummary goals={debtGoals} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
        {debtGoals.map((goal) => (
          <DebtGoalCard
            key={goal.id}
            goal={goal}
            onEdit={() => onEdit(goal)}
            onDelete={() => onDelete(goal)}
            onPayment={() => onPayment(goal)}
          />
        ))}
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GoalsPage() {
  const [subTab, setSubTab] = useState<SubTab>('save_up');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addDebtModalOpen, setAddDebtModalOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [editingDebt, setEditingDebt] = useState<Goal | null>(null);
  const [contributeTarget, setContributeTarget] = useState<Goal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null);

  const { data: goals, isLoading, isError } = useQuery<Goal[]>({
    queryKey: ['goals'],
    queryFn: () => api.get('/goals').then((r) => r.data),
  });

  function openAdd() {
    if (subTab === 'pay_down') {
      setEditingDebt(null);
      setAddDebtModalOpen(true);
    } else {
      setEditing(null);
      setAddModalOpen(true);
    }
  }

  function openEdit(goal: Goal) {
    if (goal.type === 'debt') {
      setEditingDebt(goal);
      setAddDebtModalOpen(true);
    } else {
      setEditing(goal);
      setAddModalOpen(true);
    }
  }

  const saveUpGoals = goals?.filter((g) => g.type !== 'debt') ?? [];

  return (
    <div style={{ padding: '1.5rem 0' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text)', margin: 0, flex: '0 0 auto' }}>
          Goals
        </h1>

        {/* Sub-tabs */}
        <div style={{
          display: 'flex', background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', overflow: 'hidden', flex: '0 0 auto',
        }}>
          {([
            { value: 'save_up', label: 'Save up' },
            { value: 'pay_down', label: 'Pay down' },
          ] as { value: SubTab; label: string }[]).map((tab) => (
            <button
              key={tab.value}
              onClick={() => setSubTab(tab.value)}
              style={{
                padding: '0.375rem 0.875rem', border: 'none', cursor: 'pointer',
                fontSize: '0.8125rem', fontWeight: 500,
                backgroundColor: subTab === tab.value ? 'var(--color-accent)' : 'transparent',
                color: subTab === tab.value ? '#fff' : 'var(--color-text-secondary)',
                transition: 'background 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <Button variant="ghost" size="sm" icon={<MessageSquare size={14} />}>
          Share feedback
        </Button>
        <Button variant="secondary" size="sm" icon={<Wallet size={14} />}>
          Goal accounts
        </Button>
        <Button size="sm" icon={<Plus size={14} />} onClick={openAdd}>
          Add goal
        </Button>
      </div>

      {/* Content */}
      {subTab === 'pay_down' ? (
        <PayDownGoals
          goals={goals}
          isLoading={isLoading}
          isError={isError}
          onAdd={openAdd}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
          onPayment={setContributeTarget}
        />
      ) : isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} padding="none">
              <Skeleton height={80} width="100%" style={{ borderRadius: '0' }} />
              <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                <Skeleton height={16} width="60%" />
                <Skeleton height={8} width="100%" />
                <Skeleton height={13} width="80%" />
                <Skeleton height={13} width="50%" />
                <Skeleton height={32} width="100%" />
              </div>
            </Card>
          ))}
        </div>
      ) : isError ? (
        <Card padding="lg">
          <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>Failed to load goals.</p>
        </Card>
      ) : !saveUpGoals.length ? (
        <GoalsEmptyState onAdd={openAdd} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
          {saveUpGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onEdit={() => openEdit(goal)}
              onDelete={() => setDeleteTarget(goal)}
              onContribute={() => setContributeTarget(goal)}
            />
          ))}
        </div>
      )}

      {/* Save Up Add/Edit modal */}
      <AddGoalModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        editing={editing}
      />

      {/* Debt Add/Edit modal */}
      <AddDebtGoalModal
        open={addDebtModalOpen}
        onClose={() => setAddDebtModalOpen(false)}
        editing={editingDebt}
      />

      {/* Contribute / Make Payment modal */}
      <ContributeModal
        open={contributeTarget !== null}
        onClose={() => setContributeTarget(null)}
        goal={contributeTarget}
      />

      {/* Delete confirm modal */}
      <DeleteGoalModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        goal={deleteTarget}
      />
    </div>
  );
}
