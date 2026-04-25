import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { notify } from '@/components/ui';
import { SectionCard } from './components/SectionCard';
import { TriggerButton } from './components/TriggerButton';

interface AiConfig {
  proactiveAiEnabled: boolean;
  proactiveAiFrequency: 'daily' | 'weekly' | 'on_login';
  investmentIntelEnabled: boolean;
  wealthAnalysisEnabled: boolean;
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

export default function AiPage() {
  const qc = useQueryClient();

  const { data: config, isLoading } = useQuery<AiConfig>({
    queryKey: ['system', 'ai'],
    queryFn: () => api.get('/api/v1/system/ai').then(r => r.data),
  });

  const mutation = useMutation({
    mutationFn: (data: AiConfig) => api.put('/api/v1/system/ai', data).then(r => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['system', 'ai'], data);
      notify.success('AI settings saved');
    },
    onError: (err: any) => notify.error(err.response?.data?.error ?? 'Save failed'),
  });

  function update(patch: Partial<AiConfig>) {
    if (!config) return;
    mutation.mutate({ ...config, ...patch });
  }

  if (isLoading || !config) return <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-[var(--color-text)]">AI Features</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Control AI-powered analysis and insight features.</p>
      </div>

      <SectionCard
        title="Proactive AI"
        description="Analyzes your finances and surfaces insights, anomalies, and recommendations."
        status={config.proactiveAiEnabled ? 'ok' : 'disabled'}
        actions={<TriggerButton endpoint="/api/v1/system/ai/proactive/trigger" label="Run Now" />}
      >
        <div className="space-y-3">
          <Toggle
            checked={config.proactiveAiEnabled}
            onChange={v => update({ proactiveAiEnabled: v })}
            label="Enable proactive AI"
          />
          <div className="flex items-center gap-3">
            <label className="text-xs text-[var(--color-text-muted)]">Check frequency</label>
            <select
              value={config.proactiveAiFrequency}
              onChange={e => update({ proactiveAiFrequency: e.target.value as AiConfig['proactiveAiFrequency'] })}
              className="px-2 py-1 text-sm border border-[var(--color-border)] rounded-[var(--radius-sm)] bg-[var(--color-surface)]"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="on_login">On login</option>
            </select>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Investment Intel"
        description="Fetches market data and analyzes your investment portfolio."
        status={config.investmentIntelEnabled ? 'ok' : 'disabled'}
      >
        <Toggle
          checked={config.investmentIntelEnabled}
          onChange={v => update({ investmentIntelEnabled: v })}
          label="Enable investment intel"
        />
      </SectionCard>

      <SectionCard
        title="Wealth Analysis"
        description="Calculates comprehensive wealth metrics across all accounts and assets."
        status={config.wealthAnalysisEnabled ? 'ok' : 'disabled'}
      >
        <Toggle
          checked={config.wealthAnalysisEnabled}
          onChange={v => update({ wealthAnalysisEnabled: v })}
          label="Enable wealth analysis"
        />
      </SectionCard>
    </div>
  );
}
