import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, MoreHorizontal, Pencil, Trash2, MessageSquare, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import {
  Card, Button, Input, Modal, ModalFooter, Skeleton,
} from '@/components/ui';
import { notify } from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

type GoalStatus = 'on_track' | 'at_risk' | 'completed';
type GoalType = 'savings' | 'vacation' | 'home' | 'wedding' | 'education' | 'car' | 'other';
type SubTab = 'save_up' | 'pay_down';

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
}

interface GoalFormValues {
  name: string;
  type: GoalType;
  targetAmount: string;
  targetDate: string;
  currentAmount: string;
  monthlyContribution: string;
}

const EMPTY_GOAL_FORM: GoalFormValues = {
  name: '',
  type: 'savings',
  targetAmount: '',
  targetDate: '',
  currentAmount: '0',
  monthlyContribution: '',
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

// ─── Empty State ──────────────────────────────────────────────────────────────

function GoalsEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 1rem', textAlign: 'center' }}>
      {/* Simple SVG illustration */}
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

// ─── Add Goal Modal ───────────────────────────────────────────────────────────

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
        type: editing.type,
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
      notify.success('Funds added');
      onClose();
    },
    onError: () => notify.error('Failed to add funds'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    contributeMut.mutate({ amount: parseFloat(form.amount) });
  }

  const remaining = goal ? Math.max(goal.targetAmount - goal.currentAmount, 0) : 0;
  const pct = goal && goal.targetAmount > 0 ? Math.min(goal.currentAmount / goal.targetAmount, 1) : 0;

  return (
    <Modal open={open} onClose={onClose} title="Add Funds" size="sm">
      {goal && (
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: '0.5rem' }}>
            {goal.name}
          </p>
          <div style={{ height: 6, backgroundColor: 'var(--color-border)', borderRadius: 'var(--radius-full)', overflow: 'hidden', marginBottom: '0.375rem' }}>
            <div style={{
              height: '100%', width: `${pct * 100}%`,
              backgroundColor: 'var(--color-accent)', borderRadius: 'var(--radius-full)',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
            <span>{fmtCurrency(goal.currentAmount)} saved</span>
            <span>{fmtCurrency(remaining)} to go</span>
          </div>
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <Input
          label="Amount to add"
          type="number"
          step="0.01"
          min="0.01"
          placeholder="150.00"
          value={form.amount}
          onChange={(e) => setForm({ amount: e.target.value })}
          required
        />
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={contributeMut.isPending}>Add funds</Button>
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

// ─── Pay Down Placeholder ─────────────────────────────────────────────────────

function PayDownPlaceholder() {
  return (
    <Card padding="lg">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '3rem 1rem', gap: '0.75rem' }}>
        <div style={{ width: 56, height: 56, borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Wallet size={24} style={{ color: 'var(--color-accent)' }} />
        </div>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
          Debt payoff goals — coming soon
        </h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', maxWidth: 360, margin: 0 }}>
          Link a loan or credit card account to set up debt payoff tracking.
        </p>
      </div>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GoalsPage() {
  const [subTab, setSubTab] = useState<SubTab>('save_up');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [contributeTarget, setContributeTarget] = useState<Goal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null);

  const { data: goals, isLoading, isError } = useQuery<Goal[]>({
    queryKey: ['goals'],
    queryFn: () => api.get('/goals').then((r) => r.data),
  });

  function openAdd() {
    setEditing(null);
    setAddModalOpen(true);
  }

  function openEdit(goal: Goal) {
    setEditing(goal);
    setAddModalOpen(true);
  }

  const saveUpGoals = goals?.filter((g) => g.status !== 'completed' || true) ?? [];

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
        <PayDownPlaceholder />
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
      ) : !goals || goals.length === 0 ? (
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

      {/* Add/Edit goal modal */}
      <AddGoalModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        editing={editing}
      />

      {/* Contribute modal */}
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
