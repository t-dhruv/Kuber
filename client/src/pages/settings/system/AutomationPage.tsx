import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { notify } from '@/components/ui';
import { SectionCard } from './components/SectionCard';
import { TriggerButton } from './components/TriggerButton';

interface AutomationConfig {
  ruleEngineEnabled: boolean;
  billMatcherEnabled: boolean;
  billMatcherConfidence: number;
  autoCategorizeEnabled: boolean;
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

export default function AutomationPage() {
  const qc = useQueryClient();
  const [confidence, setConfidence] = useState(0);

  const { data: config, isLoading } = useQuery<AutomationConfig>({
    queryKey: ['system', 'automation'],
    queryFn: () => api.get('/api/v1/system/automation').then(r => r.data),
  });

  useEffect(() => {
    if (config) setConfidence(config.billMatcherConfidence);
  }, [config]);

  const mutation = useMutation({
    mutationFn: (data: AutomationConfig) => api.put('/api/v1/system/automation', data).then(r => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['system', 'automation'], data);
      notify.success('Automation settings saved');
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error && 'response' in err
        ? (err as any).response?.data?.error
        : undefined;
      notify.error(msg ?? 'Save failed');
    },
  });

  function update(patch: Partial<AutomationConfig>) {
    if (!config) return;
    mutation.mutate({ ...config, ...patch });
  }

  if (isLoading || !config) return <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-[var(--color-text)]">Automation</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Configure rule-based automation and transaction processing.</p>
      </div>

      <SectionCard
        title="Rule Engine"
        description="Automatically applies transaction rules on import and on schedule."
        status={config.ruleEngineEnabled ? 'ok' : 'disabled'}
        actions={<TriggerButton endpoint="/api/v1/cron/jobs/rule-execution/trigger" label="Run Now" />}
      >
        <Toggle
          checked={config.ruleEngineEnabled}
          onChange={v => update({ ruleEngineEnabled: v })}
          label="Enable rule engine"
        />
      </SectionCard>

      <SectionCard
        title="Bill Matcher"
        description="Matches recurring transactions to known bills automatically."
        status={config.billMatcherEnabled ? 'ok' : 'disabled'}
      >
        <div className="space-y-3">
          <Toggle
            checked={config.billMatcherEnabled}
            onChange={v => update({ billMatcherEnabled: v })}
            label="Enable bill matcher"
          />
          <div className="flex items-center gap-3">
            <label className="text-xs text-[var(--color-text-muted)] w-36 shrink-0">Confidence threshold</label>
            <input
              type="range"
              min={0}
              max={100}
              value={confidence}
              onChange={e => setConfidence(Number(e.target.value))}
              onMouseUp={() => update({ billMatcherConfidence: confidence })}
              className="flex-1"
            />
            <span className="text-xs font-mono w-8 text-right">{confidence}%</span>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Auto-Categorize"
        description="Uses AI to automatically categorize uncategorized transactions."
        status={config.autoCategorizeEnabled ? 'ok' : 'disabled'}
        actions={<TriggerButton endpoint="/api/v1/system/automation/auto-categorize/trigger" label="Run Now" />}
      >
        <Toggle
          checked={config.autoCategorizeEnabled}
          onChange={v => update({ autoCategorizeEnabled: v })}
          label="Enable auto-categorize"
        />
      </SectionCard>
    </div>
  );
}
