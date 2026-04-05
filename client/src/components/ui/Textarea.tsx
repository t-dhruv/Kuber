import { forwardRef, TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    const hintId = inputId ? `${inputId}-hint` : undefined;
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-[var(--color-text)]">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={`w-full rounded-[var(--radius-md)] border px-3 py-2 text-sm bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent resize-y ${error ? 'border-[var(--color-danger)]' : 'border-[var(--color-border)]'} ${className}`}
          aria-describedby={hintId && (error || hint) ? hintId : undefined}
          {...props}
        />
        {error && <p id={hintId} className="text-xs text-[var(--color-danger)]">{error}</p>}
        {hint && !error && <p id={hintId} className="text-xs text-[var(--color-text-muted)]">{hint}</p>}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
