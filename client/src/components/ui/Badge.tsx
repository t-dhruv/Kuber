import { HTMLAttributes } from 'react';

type BadgeVariant = 'default' | 'success' | 'danger' | 'warning' | 'info' | 'accent';
type BadgeSize = 'sm' | 'md';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]',
  success: 'bg-[var(--color-success-light)] text-[var(--color-success)]',
  danger: 'bg-[var(--color-danger-light)] text-[var(--color-danger)]',
  warning: 'bg-[var(--color-warning-light)] text-[var(--color-warning)]',
  info: 'bg-[var(--color-info-light)] text-[var(--color-info)]',
  accent: 'bg-[var(--color-accent-light)] text-[var(--color-accent)]',
};

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-[var(--color-text-muted)]',
  success: 'bg-[var(--color-success)]',
  danger: 'bg-[var(--color-danger)]',
  warning: 'bg-[var(--color-warning)]',
  info: 'bg-[var(--color-info)]',
  accent: 'bg-[var(--color-accent)]',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-0.5 text-xs',
};

export function Badge({ variant = 'default', size = 'md', dot, children, className = '', ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-[var(--radius-full)] ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {dot && (
        <span className={`inline-block h-1.5 w-1.5 rounded-full flex-shrink-0 ${dotColors[variant]}`} aria-hidden="true" />
      )}
      {children}
    </span>
  );
}
