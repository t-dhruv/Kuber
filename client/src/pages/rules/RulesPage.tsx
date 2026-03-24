import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Play, PlayCircle, ChevronUp, ChevronDown } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card, Input, Select, Modal, ModalFooter, notify } from '@/components/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

type ConditionField = 'merchantName' | 'description' | 'amount';
type ConditionOperator = 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'gte' | 'lte';
type ActionType = 'setCategory' | 'addTag' | 'hide' | 'markReviewed';

interface RuleCondition {
  field: ConditionField;
  operator: ConditionOperator;
  value: string;
}

interface RuleAction {
  type: ActionType;
  value?: string;
}

interface Rule {
  id: string;
  name: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  isActive: boolean;
  sortOrder: number;
}

interface Category {
  id: string;
  name: string;
  emoji: string | null;
}

// ─── Options ──────────────────────────────────────────────────────────────────

const FIELD_OPTIONS = [
  { value: 'merchantName', label: 'Merchant name' },
  { value: 'description', label: 'Description' },
  { value: 'amount', label: 'Amount' },
];

const STRING_OPERATORS = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: 'equals' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'endsWith', label: 'ends with' },
];

const NUMBER_OPERATORS = [
  { value: 'gt', label: 'is greater than' },
  { value: 'lt', label: 'is less than' },
  { value: 'gte', label: 'is ≥' },
  { value: 'lte', label: 'is ≤' },
  { value: 'equals', label: 'equals' },
];

const ACTION_TYPE_OPTIONS = [
  { value: 'setCategory', label: 'Set category' },
  { value: 'addTag', label: 'Add tag' },
  { value: 'hide', label: 'Hide transaction' },
  { value: 'markReviewed', label: 'Mark as reviewed' },
];

function getOperatorOptions(field: ConditionField) {
  return field === 'amount' ? NUMBER_OPERATORS : STRING_OPERATORS;
}

// ─── Rule Builder ─────────────────────────────────────────────────────────────

interface RuleFormState {
  name: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

const EMPTY_CONDITION: RuleCondition = { field: 'merchantName', operator: 'contains', value: '' };
const EMPTY_ACTION: RuleAction = { type: 'setCategory', value: '' };

function defaultForm(): RuleFormState {
  return { name: '', conditions: [{ ...EMPTY_CONDITION }], actions: [{ ...EMPTY_ACTION }] };
}

function RuleBuilderModal({
  open,
  onClose,
  initial,
  categories,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  initial: RuleFormState;
  categories: Category[];
  onSave: (form: RuleFormState) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<RuleFormState>(initial);
  const [error, setError] = useState('');

  // Sync initial on open
  useState(() => { setForm(initial); setError(''); });

  function updateCondition(i: number, patch: Partial<RuleCondition>) {
    setForm(f => {
      const conditions = f.conditions.map((c, idx) => idx === i ? { ...c, ...patch } : c);
      // Reset operator if field type changes
      if (patch.field) {
        const ops = getOperatorOptions(patch.field);
        if (!ops.find(o => o.value === conditions[i].operator)) {
          conditions[i].operator = ops[0].value as ConditionOperator;
        }
      }
      return { ...f, conditions };
    });
  }

  function updateAction(i: number, patch: Partial<RuleAction>) {
    setForm(f => ({
      ...f,
      actions: f.actions.map((a, idx) => idx === i ? { ...a, ...patch } : a),
    }));
  }

  function handleSave() {
    setError('');
    if (!form.name.trim()) { setError('Rule name is required.'); return; }
    if (form.conditions.some(c => !c.value.trim())) { setError('All condition values must be filled in.'); return; }
    if (form.actions.some(a => (a.type === 'setCategory' || a.type === 'addTag') && !a.value?.trim())) {
      setError('All action values must be filled in.'); return;
    }
    onSave(form);
  }

  const categoryOptions = categories.map(c => ({ value: c.id, label: `${c.emoji ?? ''} ${c.name}`.trim() }));

  return (
    <Modal open={open} onClose={onClose} title={initial.name ? 'Edit Rule' : 'New Rule'} size="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <Input
          label="Rule name"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Tag Amazon orders"
        />

        {/* Conditions */}
        <div>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: '0.5rem' }}>
            When…
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {form.conditions.map((cond, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                <div style={{ flex: '0 0 150px' }}>
                  <Select
                    label={i === 0 ? 'Field' : undefined}
                    value={cond.field}
                    options={FIELD_OPTIONS}
                    onChange={e => updateCondition(i, { field: e.target.value as ConditionField })}
                  />
                </div>
                <div style={{ flex: '0 0 140px' }}>
                  <Select
                    label={i === 0 ? 'Operator' : undefined}
                    value={cond.operator}
                    options={getOperatorOptions(cond.field)}
                    onChange={e => updateCondition(i, { operator: e.target.value as ConditionOperator })}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <Input
                    label={i === 0 ? 'Value' : undefined}
                    value={cond.value}
                    onChange={e => updateCondition(i, { value: e.target.value })}
                    placeholder={cond.field === 'amount' ? '100' : 'Amazon'}
                    type={cond.field === 'amount' ? 'number' : 'text'}
                  />
                </div>
                {form.conditions.length > 1 && (
                  <button
                    onClick={() => setForm(f => ({ ...f, conditions: f.conditions.filter((_, idx) => idx !== i) }))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', padding: '0 0.25rem', marginBottom: 2 }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setForm(f => ({ ...f, conditions: [...f.conditions, { ...EMPTY_CONDITION }] }))}
              style={{ alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-accent)', fontSize: '0.8125rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.25rem', padding: 0 }}
            >
              <Plus size={13} /> Add condition
            </button>
          </div>
        </div>

        {/* Actions */}
        <div>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)', marginBottom: '0.5rem' }}>
            Then…
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {form.actions.map((action, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                <div style={{ flex: '0 0 180px' }}>
                  <Select
                    label={i === 0 ? 'Action' : undefined}
                    value={action.type}
                    options={ACTION_TYPE_OPTIONS}
                    onChange={e => updateAction(i, { type: e.target.value as ActionType, value: '' })}
                  />
                </div>
                {(action.type === 'setCategory') && (
                  <div style={{ flex: 1 }}>
                    <Select
                      label={i === 0 ? 'Category' : undefined}
                      value={action.value ?? ''}
                      options={[{ value: '', label: 'Select…' }, ...categoryOptions]}
                      onChange={e => updateAction(i, { value: e.target.value })}
                    />
                  </div>
                )}
                {action.type === 'addTag' && (
                  <div style={{ flex: 1 }}>
                    <Input
                      label={i === 0 ? 'Tag' : undefined}
                      value={action.value ?? ''}
                      onChange={e => updateAction(i, { value: e.target.value })}
                      placeholder="e.g. work-expense"
                    />
                  </div>
                )}
                {(action.type === 'hide' || action.type === 'markReviewed') && (
                  <div style={{ flex: 1, fontSize: '0.8125rem', color: 'var(--color-text-muted)', paddingBottom: 6 }}>
                    (no additional value needed)
                  </div>
                )}
                {form.actions.length > 1 && (
                  <button
                    onClick={() => setForm(f => ({ ...f, actions: f.actions.filter((_, idx) => idx !== i) }))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', padding: '0 0.25rem', marginBottom: 2 }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setForm(f => ({ ...f, actions: [...f.actions, { ...EMPTY_ACTION }] }))}
              style={{ alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-accent)', fontSize: '0.8125rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.25rem', padding: 0 }}
            >
              <Plus size={13} /> Add action
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding: '0.625rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-danger-light)', color: 'var(--color-danger)', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>Save rule</Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

// ─── Rule Row ─────────────────────────────────────────────────────────────────

function conditionLabel(c: RuleCondition): string {
  const field = FIELD_OPTIONS.find(f => f.value === c.field)?.label ?? c.field;
  const ops = [...STRING_OPERATORS, ...NUMBER_OPERATORS];
  const op = ops.find(o => o.value === c.operator)?.label ?? c.operator;
  return `${field} ${op} "${c.value}"`;
}

function actionLabel(a: RuleAction): string {
  switch (a.type) {
    case 'setCategory': return `Set category → ${a.value}`;
    case 'addTag': return `Add tag "${a.value}"`;
    case 'hide': return 'Hide transaction';
    case 'markReviewed': return 'Mark as reviewed';
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RulesPage() {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; rule?: Rule } | null>(null);
  const [applyTarget, setApplyTarget] = useState<Rule | null>(null);
  const [applyAllConfirm, setApplyAllConfirm] = useState(false);

  const { data: rules = [], isLoading } = useQuery<Rule[]>({
    queryKey: ['rules'],
    queryFn: () => api.get('/rules').then(r => r.data),
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: Omit<Rule, 'id' | 'isActive' | 'sortOrder'>) => api.post('/rules', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['rules'] }); setModal(null); notify.success('Rule created'); },
    onError: () => notify.error('Failed to create rule'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Rule> }) => api.put(`/rules/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['rules'] }); setModal(null); notify.success('Rule saved'); },
    onError: () => notify.error('Failed to save rule'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/rules/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['rules'] }); notify.success('Rule deleted'); },
    onError: () => notify.error('Failed to delete rule'),
  });

  const applyMutation = useMutation({
    mutationFn: (id: string) => api.post<{ matched: number }>(`/rules/${id}/apply`).then(r => r.data),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setApplyTarget(null);
      notify.success(`Rule applied`, `Updated ${data.matched} transaction${data.matched !== 1 ? 's' : ''}`);
    },
    onError: () => notify.error('Failed to apply rule'),
  });

  const applyAllMutation = useMutation({
    mutationFn: () => api.post<{ totalMatched: number }>('/rules/apply-all').then(r => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setApplyAllConfirm(false);
      notify.success('All rules applied', `Updated ${data.totalMatched} transaction${data.totalMatched !== 1 ? 's' : ''}`);
    },
    onError: () => notify.error('Failed to apply rules'),
  });

  function handleSave(form: RuleFormState) {
    if (modal?.mode === 'edit' && modal.rule) {
      updateMutation.mutate({ id: modal.rule.id, data: { name: form.name, conditions: form.conditions, actions: form.actions } });
    } else {
      createMutation.mutate({ name: form.name, conditions: form.conditions, actions: form.actions });
    }
  }

  function handleReorder(id: string, direction: 'up' | 'down') {
    const sorted = [...rules].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex(r => r.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const newOrder = sorted.map((r, i) => {
      if (i === idx) return { id: r.id, sortOrder: sorted[swapIdx].sortOrder };
      if (i === swapIdx) return { id: r.id, sortOrder: sorted[idx].sortOrder };
      return { id: r.id, sortOrder: r.sortOrder };
    });
    api.put('/rules/reorder', { order: newOrder })
      .then(() => queryClient.invalidateQueries({ queryKey: ['rules'] }))
      .catch(() => notify.error('Failed to reorder rules'));
  }

  const sortedRules = [...rules].sort((a, b) => a.sortOrder - b.sortOrder);

  const initialForm: RuleFormState = modal?.mode === 'edit' && modal.rule
    ? { name: modal.rule.name, conditions: modal.rule.conditions, actions: modal.rule.actions }
    : defaultForm();

  return (
    <div style={{ maxWidth: 760 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>Rules</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
            Automatically categorize, tag, or hide transactions based on conditions.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button
            variant="secondary"
            size="sm"
            icon={<PlayCircle size={15} />}
            disabled={rules.length === 0}
            onClick={() => setApplyAllConfirm(true)}
          >
            Apply all
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={15} />}
            onClick={() => setModal({ mode: 'add' })}
          >
            New rule
          </Button>
        </div>
      </div>

      {/* Rule list */}
      {isLoading ? (
        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Loading…</div>
      ) : sortedRules.length === 0 ? (
        <Card padding="lg" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <p style={{ marginBottom: '1rem' }}>No rules yet. Create your first rule to automate transaction categorization.</p>
          <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => setModal({ mode: 'add' })}>
            New rule
          </Button>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {sortedRules.map((rule, idx) => (
            <Card key={rule.id} padding="md">
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                {/* Reorder buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem', flexShrink: 0, marginTop: 2 }}>
                  <button
                    onClick={() => handleReorder(rule.id, 'up')}
                    disabled={idx === 0}
                    style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'not-allowed' : 'pointer', color: idx === 0 ? 'var(--color-border)' : 'var(--color-text-muted)', padding: '0 0.125rem' }}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    onClick={() => handleReorder(rule.id, 'down')}
                    disabled={idx === sortedRules.length - 1}
                    style={{ background: 'none', border: 'none', cursor: idx === sortedRules.length - 1 ? 'not-allowed' : 'pointer', color: idx === sortedRules.length - 1 ? 'var(--color-border)' : 'var(--color-text-muted)', padding: '0 0.125rem' }}
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--color-text)' }}>{rule.name}</span>
                    <span style={{
                      fontSize: '0.6875rem', fontWeight: 600, padding: '0.125rem 0.4rem',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: rule.isActive ? 'var(--color-success-light, #dcfce7)' : 'var(--color-surface-hover)',
                      color: rule.isActive ? 'var(--color-success, #16a34a)' : 'var(--color-text-muted)',
                    }}>
                      {rule.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                    <span style={{ fontWeight: 500 }}>When: </span>
                    {rule.conditions.map((c, i) => (
                      <span key={i}>{i > 0 ? ' AND ' : ''}{conditionLabel(c)}</span>
                    ))}
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginTop: '0.125rem' }}>
                    <span style={{ fontWeight: 500 }}>Then: </span>
                    {rule.actions.map((a, i) => (
                      <span key={i}>{i > 0 ? ', ' : ''}{actionLabel(a)}</span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Play size={13} />}
                    onClick={() => setApplyTarget(rule)}
                    title="Apply to existing transactions"
                  >
                    Apply
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Pencil size={13} />}
                    onClick={() => setModal({ mode: 'edit', rule })}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 size={13} />}
                    style={{ color: 'var(--color-danger)' }}
                    onClick={() => deleteMutation.mutate(rule.id)}
                    loading={deleteMutation.isPending && deleteMutation.variables === rule.id}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* New/Edit Rule Modal */}
      {modal && (
        <RuleBuilderModal
          open={!!modal}
          onClose={() => setModal(null)}
          initial={initialForm}
          categories={categories}
          onSave={handleSave}
          saving={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {/* Apply single rule confirm */}
      <Modal
        open={!!applyTarget}
        onClose={() => setApplyTarget(null)}
        title="Apply Rule"
        size="sm"
      >
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text)', marginBottom: '0.5rem' }}>
          Apply <strong>{applyTarget?.name}</strong> to all existing transactions?
        </p>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
          Matching transactions will be updated immediately.
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setApplyTarget(null)}>Cancel</Button>
          <Button
            variant="primary"
            loading={applyMutation.isPending}
            onClick={() => applyTarget && applyMutation.mutate(applyTarget.id)}
          >
            Apply rule
          </Button>
        </ModalFooter>
      </Modal>

      {/* Apply all confirm */}
      <Modal
        open={applyAllConfirm}
        onClose={() => setApplyAllConfirm(false)}
        title="Apply All Rules"
        size="sm"
      >
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text)', marginBottom: '0.5rem' }}>
          Apply all {rules.length} active rule{rules.length !== 1 ? 's' : ''} to all existing transactions?
        </p>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
          Rules are applied in order. This may update many transactions.
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setApplyAllConfirm(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={applyAllMutation.isPending}
            onClick={() => applyAllMutation.mutate()}
          >
            Apply all rules
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
