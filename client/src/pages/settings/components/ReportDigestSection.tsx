import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Checkbox, Select, notify, Skeleton } from '@/components/ui';
import { SectionHeader } from './SectionHeader';

type ReportFrequency = 'weekly' | 'monthly';

interface ReportSchedule {
  householdId: string;
  frequency: ReportFrequency;
  enabled: boolean;
  lastSentAt: string | null;
}

const frequencyOptions = [
  { value: 'weekly', label: 'Weekly (every Monday)' },
  { value: 'monthly', label: 'Monthly (1st of each month)' },
];

function lastSentLabel(lastSentAt: string | null | undefined): string | null {
  if (!lastSentAt) return null;

  const ms = Date.now() - new Date(lastSentAt).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export function ReportDigestSection() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<ReportSchedule>({
    queryKey: ['settings', 'report-schedule'],
    queryFn: () => api.get('/settings/report-schedule').then((r) => r.data),
  });

  const mutation = useMutation({
    mutationFn: (body: { frequency: ReportFrequency; enabled: boolean }) =>
      api.put('/settings/report-schedule', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'report-schedule'] });
      notify.success('Report digest settings saved');
    },
    onError: () => notify.error('Failed to save report digest settings'),
  });

  const enabled = data?.enabled ?? false;
  const frequency = data?.frequency ?? 'weekly';
  const lastSent = lastSentLabel(data?.lastSentAt);

  function handleToggle(newEnabled: boolean) {
    mutation.mutate({ frequency, enabled: newEnabled });
  }

  function handleFrequency(newFreq: ReportFrequency) {
    mutation.mutate({ frequency: newFreq, enabled });
  }

  return (
    <div>
      <SectionHeader
        title="Report Digest"
        description="Receive a periodic email summary of your finances."
      />

      <div style={{ maxWidth: 560 }}>
        <Card padding="lg">
          {isLoading ? (
            <Skeleton height={120} />
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="mb-1 font-semibold text-[var(--color-text)]">
                    Enable digest emails
                  </div>
                  <p className="m-0 text-sm text-[var(--color-text-secondary)]">
                    You'll receive a summary of your finances including net worth change,
                    top spending categories, budget status, and upcoming bills.
                  </p>
                </div>
                <Checkbox
                  checked={enabled}
                  onChange={(e) => handleToggle(e.target.checked)}
                  disabled={mutation.isPending}
                />
              </div>

              {enabled && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--color-text)]">
                    Frequency
                  </label>
                  <Select
                    value={frequency}
                    options={frequencyOptions}
                    onChange={(e) => handleFrequency(e.target.value as ReportFrequency)}
                    disabled={mutation.isPending}
                  />
                </div>
              )}

              {lastSent && (
                <div className="border-t border-[var(--color-border)] pt-3 text-[0.8125rem] text-[var(--color-text-secondary)]">
                  Last sent: {lastSent}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
