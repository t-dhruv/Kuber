import { Button, Card, notify } from '@/components/ui';
import { SectionHeader } from './SectionHeader';

export function BillingSection() {
  return (
    <div>
      <SectionHeader title="Billing" description="Manage your subscription." />

      <Card padding="lg" style={{ maxWidth: 400 }}>
        <div className="mb-1.5 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.06em]">
          Current Plan
        </div>
        <div className="text-xl font-bold text-[var(--color-text)] mb-2">
          Kuber Free
        </div>
        <p className="text-sm text-[var(--color-text-secondary)] mb-5">
          Upgrade to Pro for unlimited accounts, advanced reports, and priority support.
        </p>
        <Button
          variant="outline"
          className="border-[var(--color-accent)] text-[var(--color-accent)]"
          onClick={() => notify.info('Billing portal not yet available')}
        >
          Upgrade to Pro - $9.99/mo
        </Button>
      </Card>
    </div>
  );
}
