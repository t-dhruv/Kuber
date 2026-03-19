import { forwardRef, InputHTMLAttributes } from 'react';

interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
  description?: string;
  toggleSize?: 'sm' | 'md';
}

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  ({ label, description, toggleSize = 'md', className = '', id, ...props }, ref) => {
    const size = toggleSize;
    const toggleId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    const trackSize = size === 'sm' ? 'w-8 h-4' : 'w-10 h-5';
    const thumbSize = size === 'sm' ? 'h-3 w-3 left-0.5' : 'h-4 w-4 left-0.5';
    const thumbTranslate = size === 'sm' ? 'peer-checked:translate-x-4' : 'peer-checked:translate-x-5';

    return (
      <div className={`flex items-start gap-3 ${className}`}>
        <div className="relative flex-shrink-0 mt-0.5">
          <input
            ref={ref}
            type="checkbox"
            role="switch"
            id={toggleId}
            className="sr-only peer"
            {...props}
          />
          <label
            htmlFor={toggleId}
            className={`relative flex cursor-pointer items-center rounded-full transition-colors bg-[var(--color-border-strong)] peer-checked:bg-[var(--color-accent)] peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-accent)] peer-focus-visible:ring-offset-2 ${trackSize}`}
            aria-hidden="true"
          >
            <span
              className={`absolute top-0.5 inline-block rounded-full bg-white shadow transition-transform ${thumbSize} ${thumbTranslate}`}
            />
          </label>
        </div>
        {(label || description) && (
          <div className="flex flex-col gap-0.5">
            {label && (
              <label htmlFor={toggleId} className="text-sm font-medium text-[var(--color-text)] cursor-pointer">
                {label}
              </label>
            )}
            {description && (
              <p className="text-xs text-[var(--color-text-muted)]">{description}</p>
            )}
          </div>
        )}
      </div>
    );
  }
);
Toggle.displayName = 'Toggle';
