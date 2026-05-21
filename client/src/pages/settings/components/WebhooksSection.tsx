import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import {
  Button,
  Card,
  ConfirmDialog,
  Input,
  Modal,
  ModalFooter,
  notify,
  Skeleton,
} from '@/components/ui';
import { SectionHeader } from './SectionHeader';

const WEBHOOK_EVENTS = [
  'transaction.created',
  'transaction.updated',
  'transaction.deleted',
  'goal.created',
  'goal.updated',
] as const;

type WebhookEventType = typeof WEBHOOK_EVENTS[number];

interface WebhookItem {
  id: string;
  name: string;
  url: string;
  events: WebhookEventType[];
  secretSet?: boolean;
  isActive: boolean;
  createdAt: string;
}

interface WebhookForm {
  name: string;
  url: string;
  events: WebhookEventType[];
  secret: string;
  isActive: boolean;
}

interface ApiErrorBody {
  error?: string;
}

const emptyWebhookForm: WebhookForm = {
  name: '',
  url: '',
  events: [],
  secret: '',
  isActive: true,
};

function getErrorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError<ApiErrorBody>(err)) {
    return err.response?.data?.error ?? fallback;
  }
  return fallback;
}

export function WebhooksSection() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<WebhookItem | null>(null);
  const [form, setForm] = useState<WebhookForm>(emptyWebhookForm);
  const [showSecret, setShowSecret] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WebhookItem | null>(null);

  const { data: webhooks = [], isLoading } = useQuery<WebhookItem[]>({
    queryKey: ['webhooks'],
    queryFn: () => api.get('/webhooks').then((r) => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: (data: WebhookForm) => {
      const payload: Partial<WebhookForm> = {
        ...data,
        secret: data.secret.trim() || undefined,
      };
      if (editing && !data.secret.trim()) {
        delete payload.secret;
      }
      return editing
        ? api.put(`/webhooks/${editing.id}`, payload).then((r) => r.data)
        : api.post('/webhooks', payload).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      setShowModal(false);
      setEditing(null);
      setForm(emptyWebhookForm);
      notify.success(editing ? 'Webhook updated' : 'Webhook created');
    },
    onError: (err: unknown) => notify.error(getErrorMessage(err, 'Failed to save webhook')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/webhooks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      setDeleteTarget(null);
      notify.success('Webhook deleted');
    },
  });

  async function testWebhook(id: string) {
    setTestingId(id);
    try {
      const { data } = await api.post<{ status: number }>(`/webhooks/${id}/test`);
      notify.success(`Ping sent - server responded ${data.status}`);
    } catch (err: unknown) {
      notify.error(getErrorMessage(err, 'Delivery failed'));
    } finally {
      setTestingId(null);
    }
  }

  function openAdd() {
    setEditing(null);
    setForm(emptyWebhookForm);
    setShowSecret(false);
    setShowModal(true);
  }

  function openEdit(hook: WebhookItem) {
    setEditing(hook);
    setForm({ name: hook.name, url: hook.url, events: hook.events, secret: '', isActive: hook.isActive });
    setShowSecret(false);
    setShowModal(true);
  }

  function toggleEvent(ev: WebhookEventType) {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter((e) => e !== ev) : [...f.events, ev],
    }));
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Webhooks"
        description="Send real-time HTTP POST notifications to external URLs when events occur in Kuber."
      />

      <Button variant="primary" icon={<Plus size={14} />} onClick={openAdd} style={{ alignSelf: 'flex-start' }}>
        Add Webhook
      </Button>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[1, 2].map((i) => <Skeleton key={i} height={56} />)}
        </div>
      ) : webhooks.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No webhooks configured yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {webhooks.map((hook) => (
            <Card key={hook.id} padding="md">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--color-text)]">{hook.name}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${hook.isActive ? 'bg-[var(--color-success-light,#f0fdf4)] text-[var(--color-success)]' : 'bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]'}`}>
                      {hook.isActive ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <span className="truncate text-xs text-[var(--color-text-muted)]">{hook.url}</span>
                  {hook.secretSet ? (
                    <span className="text-[0.6875rem] text-[var(--color-text-muted)]">Signing secret configured</span>
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {hook.events.map((ev) => (
                      <span key={ev} className="rounded border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-1.5 py-0.5 text-[0.6875rem] text-[var(--color-text-secondary)]">{ev}</span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => testWebhook(hook.id)} loading={testingId === hook.id}>Test</Button>
                  <Button variant="ghost" size="sm" icon={<Pencil size={13} />} onClick={() => openEdit(hook)} />
                  <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={() => setDeleteTarget(hook)} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditing(null); }} title={editing ? 'Edit Webhook' : 'Add Webhook'} size="md">
        <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }}>
          <div className="flex flex-col gap-4 p-1">
            <Input label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="My webhook" />
            <Input label="URL" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://example.com/hook" />
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--color-text)]">Events</label>
              <div className="flex flex-wrap gap-2">
                {WEBHOOK_EVENTS.map((ev) => (
                  <button
                    key={ev}
                    type="button"
                    onClick={() => toggleEvent(ev)}
                    className="rounded-full border px-2.5 py-1 text-xs transition-colors"
                    style={{
                      background: form.events.includes(ev) ? 'var(--color-accent)' : 'var(--color-surface-hover)',
                      color: form.events.includes(ev) ? '#fff' : 'var(--color-text-secondary)',
                      borderColor: form.events.includes(ev) ? 'var(--color-accent)' : 'var(--color-border)',
                    }}
                  >
                    {ev}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative">
              <Input
                label="Signing secret (optional)"
                type={showSecret ? 'text' : 'password'}
                value={form.secret}
                onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
                placeholder={editing?.secretSet ? 'Leave blank to keep current secret' : 'Leave blank to skip signature'}
              />
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                className="absolute right-2 top-8 cursor-pointer border-none bg-transparent text-[var(--color-text-muted)]"
              >
                {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="accent-[var(--color-accent)]" />
              <span className="text-[var(--color-text)]">Active</span>
            </label>
          </div>
          <ModalFooter>
            <Button variant="ghost" type="button" onClick={() => { setShowModal(false); setEditing(null); }}>Cancel</Button>
            <Button variant="primary" type="submit" loading={saveMutation.isPending} disabled={!form.name || !form.url || form.events.length === 0}>
              {editing ? 'Save Changes' : 'Create Webhook'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete Webhook"
        message={<>Delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.</>}
        confirmLabel="Delete webhook"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
