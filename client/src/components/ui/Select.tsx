import { forwardRef, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, placeholder, className = '', id, ...props }, ref) => {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    const hintId = selectId ? `${selectId}-hint` : undefined;
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-[var(--color-text)]">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          <select
            ref={ref}
            id={selectId}
            className={`w-full appearance-none rounded-[var(--radius-md)] border px-3 py-2 pr-9 text-sm bg-[var(--color-surface)] text-[var(--color-text)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent cursor-pointer ${error ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)]'} ${className}`}
            aria-describedby={hintId && (error || hint) ? hintId : undefined}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 text-[var(--color-text-muted)]">
            <ChevronDown size={14} />
          </span>
        </div>
        {error && <p id={hintId} className="text-xs text-[var(--color-danger)]">{error}</p>}
        {hint && !error && <p id={hintId} className="text-xs text-[var(--color-text-muted)]">{hint}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';
