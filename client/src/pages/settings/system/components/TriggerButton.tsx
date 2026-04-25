import { useState } from 'react';
import { api } from '@/lib/api';
import { notify } from '@/components/ui';
import { Play, Loader2 } from 'lucide-react';

interface TriggerButtonProps {
  endpoint: string;
  label?: string;
  onSuccess?: () => void;
}

export function TriggerButton({ endpoint, label = 'Run Now', onSuccess }: TriggerButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleTrigger() {
    setLoading(true);
    try {
      const res = await api.post(endpoint);
      notify.success(res.data.message ?? 'Triggered successfully');
      onSuccess?.();
    } catch (err: any) {
      notify.error(err.response?.data?.error ?? 'Trigger failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleTrigger}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
      {loading ? 'Running…' : label}
    </button>
  );
}
