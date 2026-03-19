import { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hoverable?: boolean;
  elevated?: boolean;
}

const paddingStyles = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export function Card({ padding = 'md', hoverable, elevated, children, className = '', ...props }: CardProps) {
  return (
    <div
      className={`rounded-[var(--radius-lg)] border border-[var(--color-border)] ${elevated ? 'bg-[var(--color-surface-elevated)]' : 'bg-[var(--color-surface)]'} shadow-[var(--shadow-sm)] ${paddingStyles[padding]} ${hoverable ? 'transition-shadow duration-150 hover:shadow-[var(--shadow-md)] cursor-pointer' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

export function CardHeader({ title, description, action, children, className = '', ...props }: CardHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`} {...props}>
      {(title || description) ? (
        <div className="flex flex-col gap-0.5 min-w-0">
          {title && <h3 className="text-sm font-semibold text-[var(--color-text)] truncate">{title}</h3>}
          {description && <p className="text-xs text-[var(--color-text-muted)]">{description}</p>}
        </div>
      ) : children}
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

export function CardDivider({ className = '' }: { className?: string }) {
  return <hr className={`border-[var(--color-border)] my-4 ${className}`} />;
}
