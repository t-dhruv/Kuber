import { forwardRef, InputHTMLAttributes } from 'react';
import { Check } from 'lucide-react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, error, className = '', id, ...props }, ref) => {
    const checkboxId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className={`flex items-start gap-3 ${className}`}>
        <div className="relative mt-0.5 flex-shrink-0">
          <input
            ref={ref}
            type="checkbox"
            id={checkboxId}
            className="sr-only peer"
            {...props}
          />
          <label
            htmlFor={checkboxId}
            className="flex h-4 w-4 cursor-pointer items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors peer-checked:bg-[var(--color-accent)] peer-checked:border-[var(--color-accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-accent)] peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
            aria-hidden="true"
          >
            <Check size={10} className="text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
          </label>
        </div>
        {(label || description) && (
          <div className="flex flex-col gap-0.5">
            {label && (
              <label htmlFor={checkboxId} className="text-sm font-medium text-[var(--color-text)] cursor-pointer">
                {label}
              </label>
            )}
            {description && (
              <p className="text-xs text-[var(--color-text-muted)]">{description}</p>
            )}
            {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
          </div>
        )}
      </div>
    );
  }
);
Checkbox.displayName = 'Checkbox';
