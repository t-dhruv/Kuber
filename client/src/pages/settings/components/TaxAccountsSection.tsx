import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Input, Card, notify } from '@/components/ui';

interface TaxAccount {
  id: string;
  name: string;
  type: string;
  linkedAccountId: string | null;
  memberName: string | null;
  birthYear: number | null;
  annualRoomCad: number;
  totalRoomEver: number;
  contributionsYtd: number;
  withdrawalsYtd: number;
  notes: string | null;
}

interface AccountOption {
  id: string;
  name: string;
  type: string;
}

const TAX_ACCOUNT_TYPES = ['TFSA', 'RRSP', 'FHSA', 'RESP', '401k', 'IRA'];

const EMPTY_FORM = {
  name: '',
  type: 'TFSA',
  memberName: '',
  birthYear: '',
  linkedAccountId: '',
  annualRoomCad: '',
  totalRoomEver: '',
  contributionsYtd: '',
  withdrawalsYtd: '',
  notes: '',
};

function alertColor(pctUsed: number, overContribution: number): string {
  if (overContribution > 0) return 'var(--color-danger, #ef4444)';
  if (pctUsed > 90) return 'var(--color-warning, #f59e0b)';
  return 'var(--color-success, #22c55e)';
}

function alertBg(pctUsed: number, overContribution: number): string {
  if (overContribution > 0) return 'rgba(239,68,68,0.08)';
  if (pctUsed > 90) return 'rgba(245,158,11,0.08)';
  return 'rgba(34,197,94,0.08)';
}

function fmtCad(n: number): string {
  return `$${n.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function TaxAccountsSection() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: accounts = [], isLoading } = useQuery<TaxAccount[]>({
    queryKey: ['tax-accounts'],
    queryFn: () => api.get('/tax-accounts').then((r) => r.data),
  });

  const { data: linkedAccounts = [] } = useQuery<AccountOption[]>({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts').then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/tax-accounts', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tax-accounts'] });
      notify.success('Tax account added');
      resetForm();
    },
    onError: () => notify.error('Failed to add tax account'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.put(`/tax-accounts/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tax-accounts'] });
      notify.success('Tax account updated');
      resetForm();
    },
    onError: () => notify.error('Failed to update tax account'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tax-accounts/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tax-accounts'] });
      notify.success('Tax account deleted');
      setConfirmDelete(null);
    },
    onError: () => notify.error('Failed to delete tax account'),
  });

  function resetForm() {
    setForm(EMPTY_FORM);
    setShowForm(false);
    setEditId(null);
  }

  function openEdit(acc: TaxAccount) {
    setEditId(acc.id);
    setForm({
      name: acc.name,
      type: acc.type,
      memberName: acc.memberName ?? '',
      birthYear: acc.birthYear != null ? String(acc.birthYear) : '',
      linkedAccountId: acc.linkedAccountId ?? '',
      annualRoomCad: acc.annualRoomCad > 0 ? String(acc.annualRoomCad) : '',
      totalRoomEver: acc.totalRoomEver > 0 ? String(acc.totalRoomEver) : '',
      contributionsYtd: acc.contributionsYtd > 0 ? String(acc.contributionsYtd) : '',
      withdrawalsYtd: acc.withdrawalsYtd > 0 ? String(acc.withdrawalsYtd) : '',
      notes: acc.notes ?? '',
    });
    setShowForm(true);
  }

  function buildPayload() {
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      type: form.type,
    };
    if (form.memberName.trim()) payload.memberName = form.memberName.trim();
    if (form.birthYear.trim()) payload.birthYear = parseInt(form.birthYear, 10);
    if (form.linkedAccountId.trim()) payload.linkedAccountId = form.linkedAccountId.trim();
    if (form.annualRoomCad.trim()) payload.annualRoomCad = parseFloat(form.annualRoomCad);
    if (form.totalRoomEver.trim()) payload.totalRoomEver = parseFloat(form.totalRoomEver);
    if (form.contributionsYtd.trim()) payload.contributionsYtd = parseFloat(form.contributionsYtd);
    if (form.withdrawalsYtd.trim()) payload.withdrawalsYtd = parseFloat(form.withdrawalsYtd);
    if (form.notes.trim()) payload.notes = form.notes.trim();
    return payload;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return notify.error('Name is required');
    const payload = buildPayload();
    if (editId) {
      updateMutation.mutate({ id: editId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isBusy = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 600 }}>Tax-Advantaged Accounts</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
            Track TFSA, RRSP, FHSA, RESP contribution room and avoid over-contributions.
          </div>
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => { setEditId(null); setForm(EMPTY_FORM); setShowForm(true); }}>
            <Plus size={14} style={{ marginRight: 4 }} /> Add Account
          </Button>
        )}
      </div>

      {/* Inline form */}
      {showForm && (
        <Card style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
          <div style={{ fontWeight: 600, marginBottom: '1rem' }}>
            {editId ? 'Edit Tax Account' : 'Add Tax Account'}
          </div>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, display: 'block', marginBottom: 4 }}>
                  Account Name *
                </label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. My TFSA"
                />
              </div>
              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, display: 'block', marginBottom: 4 }}>
                  Account Type *
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '0.875rem' }}
                >
                  {TAX_ACCOUNT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, display: 'block', marginBottom: 4 }}>
                  Member Name
                </label>
                <Input
                  value={form.memberName}
                  onChange={(e) => setForm((f) => ({ ...f, memberName: e.target.value }))}
                  placeholder="e.g. Jane"
                />
              </div>
              {form.type === 'TFSA' && (
                <div>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 500, display: 'block', marginBottom: 4 }}>
                    Birth Year (for room calculation)
                  </label>
                  <Input
                    type="number"
                    value={form.birthYear}
                    onChange={(e) => setForm((f) => ({ ...f, birthYear: e.target.value }))}
                    placeholder="e.g. 1990"
                    min={1900}
                    max={2010}
                  />
                </div>
              )}
              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, display: 'block', marginBottom: 4 }}>
                  Linked Account (optional)
                </label>
                <select
                  value={form.linkedAccountId}
                  onChange={(e) => setForm((f) => ({ ...f, linkedAccountId: e.target.value }))}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '0.875rem' }}
                >
                  <option value="">None</option>
                  {linkedAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, display: 'block', marginBottom: 4 }}>
                  Total Room Ever (cumulative)
                </label>
                <Input
                  type="number"
                  value={form.totalRoomEver}
                  onChange={(e) => setForm((f) => ({ ...f, totalRoomEver: e.target.value }))}
                  placeholder="0"
                  min={0}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, display: 'block', marginBottom: 4 }}>
                  Contributions YTD
                </label>
                <Input
                  type="number"
                  value={form.contributionsYtd}
                  onChange={(e) => setForm((f) => ({ ...f, contributionsYtd: e.target.value }))}
                  placeholder="0"
                  min={0}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, display: 'block', marginBottom: 4 }}>
                  Withdrawals YTD
                </label>
                <Input
                  type="number"
                  value={form.withdrawalsYtd}
                  onChange={(e) => setForm((f) => ({ ...f, withdrawalsYtd: e.target.value }))}
                  placeholder="0"
                  min={0}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, display: 'block', marginBottom: 4 }}>
                  Notes
                </label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <Button type="submit" disabled={isBusy}>
                {isBusy ? 'Saving…' : editId ? 'Save Changes' : 'Add Account'}
              </Button>
              <Button variant="ghost" type="button" onClick={resetForm}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Accounts list */}
      {isLoading ? (
        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Loading…</div>
      ) : accounts.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem', border: '1px dashed var(--color-border)', borderRadius: 8 }}>
          No tax accounts yet. Add one to start tracking contribution room.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {accounts.map((acc) => {
            const pctUsed = acc.totalRoomEver > 0
              ? Math.min(100, Math.round((acc.contributionsYtd / acc.totalRoomEver) * 100))
              : 0;
            const roomRemaining = Math.max(0, acc.totalRoomEver + acc.withdrawalsYtd - acc.contributionsYtd);
            const overContrib = Math.max(0, acc.contributionsYtd - acc.totalRoomEver - acc.withdrawalsYtd);
            const color = alertColor(pctUsed, overContrib);
            const bg = alertBg(pctUsed, overContrib);

            return (
              <div
                key={acc.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '0.875rem 1rem',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: bg,
                }}
              >
                {/* Type badge */}
                <span style={{
                  padding: '0.2rem 0.5rem',
                  borderRadius: 4,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  background: color,
                  color: '#fff',
                  minWidth: 48,
                  textAlign: 'center',
                  flexShrink: 0,
                }}>
                  {acc.type}
                </span>

                {/* Name + member */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{acc.name}</div>
                  {acc.memberName && (
                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>{acc.memberName}</div>
                  )}
                </div>

                {/* Stats */}
                <div style={{ display: 'flex', gap: '2rem', fontSize: '0.8125rem', textAlign: 'right', flexShrink: 0 }}>
                  <div>
                    <div style={{ color: 'var(--color-text-muted)' }}>Contributed YTD</div>
                    <div style={{ fontWeight: 600 }}>{fmtCad(acc.contributionsYtd)}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--color-text-muted)' }}>Room Remaining</div>
                    <div style={{ fontWeight: 600, color }}>{fmtCad(roomRemaining)}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--color-text-muted)' }}>Used</div>
                    <div style={{ fontWeight: 600, color }}>{pctUsed}%</div>
                  </div>
                  {overContrib > 0 && (
                    <div>
                      <div style={{ color: 'var(--color-text-muted)' }}>Over by</div>
                      <div style={{ fontWeight: 700, color: '#ef4444' }}>{fmtCad(overContrib)}</div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                  <button
                    onClick={() => openEdit(acc)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--color-text-muted)' }}
                    title="Edit"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(acc.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--color-text-muted)' }}
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 10, padding: '1.5rem', maxWidth: 360, width: '100%' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Delete Tax Account?</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem' }}>
              This will permanently remove this tax account record.
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button
                variant="danger"
                size="sm"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(confirmDelete)}
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
