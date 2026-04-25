import { ReactNode } from 'react';
import { StatusBadge, Status } from './StatusBadge';

interface SectionCardProps {
  title: string;
  description: string;
  status?: Status;
  actions?: ReactNode;
  children?: ReactNode;
}

export function SectionCard({ title, description, status, actions, children }: SectionCardProps) {
  return (
    <div className="border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">{title}</h3>
            {status && <StatusBadge status={status} />}
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">{description}</p>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
