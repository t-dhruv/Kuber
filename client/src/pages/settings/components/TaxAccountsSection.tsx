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
      <div className="flex justify-between items-center mb-5">
        <div>
          <div className="text-base font-semibold">Tax-Advantaged Accounts</div>
          <div className="text-[0.8125rem] text-[var(--color-text-muted)] mt-0.5">
            Track TFSA, RRSP, FHSA, RESP contribution room and avoid over-contributions.
          </div>
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => { setEditId(null); setForm(EMPTY_FORM); setShowForm(true); }}>
            <Plus size={14} className="mr-1" /> Add Account
          </Button>
        )}
      </div>

      {/* Inline form */}
      {showForm && (
        <Card className="p-5 mb-5">
          <div className="font-semibold mb-4">
            {editId ? 'Edit Tax Account' : 'Add Tax Account'}
          </div>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[0.8125rem] font-medium block mb-1">
                  Account Name *
                </label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. My TFSA"
                />
              </div>
              <div>
                <label className="text-[0.8125rem] font-medium block mb-1">
                  Account Type *
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-sm"
                >
                  {TAX_ACCOUNT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[0.8125rem] font-medium block mb-1">
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
                  <label className="text-[0.8125rem] font-medium block mb-1">
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
                <label className="text-[0.8125rem] font-medium block mb-1">
                  Linked Account (optional)
                </label>
                <select
                  value={form.linkedAccountId}
                  onChange={(e) => setForm((f) => ({ ...f, linkedAccountId: e.target.value }))}
                  className="w-full px-3 py-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-sm"
                >
                  <option value="">None</option>
                  {linkedAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[0.8125rem] font-medium block mb-1">
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
                <label className="text-[0.8125rem] font-medium block mb-1">
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
                <label className="text-[0.8125rem] font-medium block mb-1">
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
              <div className="col-span-2">
                <label className="text-[0.8125rem] font-medium block mb-1">
                  Notes
                </label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
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
        <div className="text-[var(--color-text-muted)] text-sm">Loading…</div>
      ) : accounts.length === 0 ? (
        <div className="p-8 text-center text-[var(--color-text-muted)] text-sm border border-dashed border-[var(--color-border)] rounded-lg">
          No tax accounts yet. Add one to start tracking contribution room.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
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
                className="flex items-center gap-4 px-4 py-3.5 rounded-lg border border-[var(--color-border)]"
                style={{ background: bg }}
              >
                {/* Type badge */}
                <span
                  className="text-xs font-bold text-white min-w-[48px] text-center shrink-0 px-2 py-0.5 rounded"
                  style={{ background: color }}
                >
                  {acc.type}
                </span>

                {/* Name + member */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[0.9375rem]">{acc.name}</div>
                  {acc.memberName && (
                    <div className="text-[0.8125rem] text-[var(--color-text-muted)]">{acc.memberName}</div>
                  )}
                </div>

                {/* Stats */}
                <div className="flex gap-8 text-[0.8125rem] text-right shrink-0">
                  <div>
                    <div className="text-[var(--color-text-muted)]">Contributed YTD</div>
                    <div className="font-semibold">{fmtCad(acc.contributionsYtd)}</div>
                  </div>
                  <div>
                    <div className="text-[var(--color-text-muted)]">Room Remaining</div>
                    <div className="font-semibold" style={{ color }}>{fmtCad(roomRemaining)}</div>
                  </div>
                  <div>
                    <div className="text-[var(--color-text-muted)]">Used</div>
                    <div className="font-semibold" style={{ color }}>{pctUsed}%</div>
                  </div>
                  {overContrib > 0 && (
                    <div>
                      <div className="text-[var(--color-text-muted)]">Over by</div>
                      <div className="font-bold text-[#ef4444]">{fmtCad(overContrib)}</div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(acc)}
                    className="bg-transparent border-none cursor-pointer p-1 text-[var(--color-text-muted)]"
                    title="Edit"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(acc.id)}
                    className="bg-transparent border-none cursor-pointer p-1 text-[var(--color-text-muted)]"
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
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-[var(--color-surface)] rounded-[10px] p-6 max-w-[360px] w-full">
            <div className="font-semibold mb-2">Delete Tax Account?</div>
            <div className="text-sm text-[var(--color-text-muted)] mb-5">
              This will permanently remove this tax account record.
            </div>
            <div className="flex gap-2 justify-end">
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
