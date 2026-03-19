import { HTMLAttributes } from 'react';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: AvatarSize;
}

const sizeStyles: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-xs',
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function getColorFromName(name: string): string {
  const colors = [
    'bg-[var(--color-chart-1)]',
    'bg-[var(--color-chart-2)]',
    'bg-[var(--color-chart-3)]',
    'bg-[var(--color-chart-4)]',
    'bg-[var(--color-chart-5)]',
    'bg-[var(--color-chart-6)]',
  ];
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
}

export function Avatar({ src, alt, name, size = 'md', className = '', ...props }: AvatarProps) {
  const sizeClass = sizeStyles[size];

  if (src) {
    return (
      <div className={`relative flex-shrink-0 rounded-full overflow-hidden ${sizeClass} ${className}`} {...props}>
        <img src={src} alt={alt ?? name ?? 'Avatar'} className="h-full w-full object-cover" />
      </div>
    );
  }

  if (name) {
    return (
      <div
        className={`flex-shrink-0 flex items-center justify-center rounded-full font-semibold text-white ${sizeClass} ${getColorFromName(name)} ${className}`}
        aria-label={alt ?? name}
        role="img"
        {...props}
      >
        {getInitials(name)}
      </div>
    );
  }

  return (
    <div
      className={`flex-shrink-0 flex items-center justify-center rounded-full bg-[var(--color-border)] ${sizeClass} ${className}`}
      aria-label={alt ?? 'Avatar'}
      role="img"
      {...props}
    >
      <span className="text-[var(--color-text-muted)]">?</span>
    </div>
  );
}
