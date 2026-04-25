import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { notify } from '@/components/ui';
import { SectionCard } from './components/SectionCard';
import { TriggerButton } from './components/TriggerButton';

interface IntegrationsConfig {
  imapEnabled: boolean;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;
  digestEnabled: boolean;
  digestSchedule: 'daily' | 'weekly';
  webhooksEnabled: boolean;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </div>
      <span className="text-sm text-[var(--color-text)]">{label}</span>
    </label>
  );
}

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const [imapTestResult, setImapTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [imapTesting, setImapTesting] = useState(false);

  const { data: config, isLoading } = useQuery<IntegrationsConfig>({
    queryKey: ['system', 'integrations'],
    queryFn: () => api.get('/api/v1/system/integrations').then(r => r.data),
  });

  const mutation = useMutation({
    mutationFn: (data: IntegrationsConfig) => api.put('/api/v1/system/integrations', data).then(r => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['system', 'integrations'], data);
      notify.success('Integration settings saved');
    },
    onError: (err: any) => notify.error(err.response?.data?.error ?? 'Save failed'),
  });

  function update(patch: Partial<IntegrationsConfig>) {
    if (!config) return;
    mutation.mutate({ ...config, ...patch });
  }

  async function testImap() {
    if (!config) return;
    setImapTesting(true);
    setImapTestResult(null);
    try {
      await api.post('/api/v1/system/integrations/imap/test', {
        host: config.imapHost,
        port: config.imapPort,
        user: config.imapUser,
        pass: config.imapPass,
      });
      setImapTestResult({ ok: true, message: 'Connection successful' });
    } catch (err: any) {
      setImapTestResult({ ok: false, message: err.response?.data?.error ?? 'Connection failed' });
    } finally {
      setImapTesting(false);
    }
  }

  if (isLoading || !config) return <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-[var(--color-text)]">Integrations</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Configure email ingestion, digest notifications, and webhooks.</p>
      </div>

      <SectionCard
        title="IMAP Email Watcher"
        description="Connects to an email inbox to parse transactions from bank emails."
        status={config.imapEnabled ? 'ok' : 'disabled'}
      >
        <div className="space-y-3">
          <Toggle checked={config.imapEnabled} onChange={v => update({ imapEnabled: v })} label="Enable IMAP watcher" />
          <div className="grid grid-cols-2 gap-3 mt-3">
            {[
              { field: 'imapHost' as const, label: 'Host', placeholder: 'imap.gmail.com' },
              { field: 'imapPort' as const, label: 'Port', placeholder: '993', type: 'number' },
              { field: 'imapUser' as const, label: 'Username', placeholder: 'you@gmail.com' },
              { field: 'imapPass' as const, label: 'Password', placeholder: '••••••••', type: 'password' },
            ].map(({ field, label, placeholder, type = 'text' }) => (
              <div key={field}>
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">{label}</label>
                <input
                  type={type}
                  value={String(config[field])}
                  onChange={e => update({ [field]: type === 'number' ? Number(e.target.value) : e.target.value } as Partial<IntegrationsConfig>)}
                  placeholder={placeholder}
                  className="w-full px-2.5 py-1.5 text-sm border border-[var(--color-border)] rounded-[var(--radius-sm)] bg-[var(--color-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={testImap}
              disabled={imapTesting}
              className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] disabled:opacity-50 transition-colors"
            >
              {imapTesting ? 'Testing…' : 'Test Connection'}
            </button>
            {imapTestResult && (
              <span className={`text-xs ${imapTestResult.ok ? 'text-green-600' : 'text-red-500'}`}>
                {imapTestResult.message}
              </span>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Digest Email"
        description="Sends a periodic summary of your finances to your email."
        status={config.digestEnabled ? 'ok' : 'disabled'}
        actions={<TriggerButton endpoint="/api/v1/system/integrations/digest/trigger" label="Send Now" />}
      >
        <div className="space-y-3">
          <Toggle checked={config.digestEnabled} onChange={v => update({ digestEnabled: v })} label="Enable digest email" />
          <div className="flex items-center gap-3">
            <label className="text-xs text-[var(--color-text-muted)]">Schedule</label>
            <select
              value={config.digestSchedule}
              onChange={e => update({ digestSchedule: e.target.value as 'daily' | 'weekly' })}
              className="px-2 py-1 text-sm border border-[var(--color-border)] rounded-[var(--radius-sm)] bg-[var(--color-surface)]"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Webhooks"
        description="Fire HTTP POST requests to external URLs on financial events."
        status={config.webhooksEnabled ? 'ok' : 'disabled'}
      >
        <Toggle checked={config.webhooksEnabled} onChange={v => update({ webhooksEnabled: v })} label="Enable webhooks" />
        <p className="text-xs text-[var(--color-text-muted)] mt-2">
          Manage individual webhook endpoints in <a href="/settings" className="underline">Settings → Webhooks</a>.
        </p>
      </SectionCard>
    </div>
  );
}
