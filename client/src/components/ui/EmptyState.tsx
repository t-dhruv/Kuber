import { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]">
        {icon ?? <Inbox size={24} />}
      </div>
      <h3 className="text-sm font-semibold text-[var(--color-text)]">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-[var(--color-text-muted)] max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
