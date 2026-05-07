interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export function SegmentControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className = '',
}: SegmentControlProps<T>) {
  const padding = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm';
  const activeIndex = Math.max(0, options.findIndex((opt) => opt.value === value));

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();

    let nextIndex = index;
    if (event.key === 'ArrowLeft') nextIndex = index === 0 ? options.length - 1 : index - 1;
    if (event.key === 'ArrowRight') nextIndex = index === options.length - 1 ? 0 : index + 1;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = options.length - 1;

    onChange(options[nextIndex].value);
  }

  return (
    <div
      className={`inline-flex rounded-[var(--radius-md)] bg-[var(--color-surface-hover)] p-0.5 ${className}`}
      role="tablist"
    >
      {options.map((opt, index) => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={value === opt.value}
          tabIndex={index === activeIndex ? 0 : -1}
          onClick={() => onChange(opt.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          className={`${padding} rounded-[var(--radius-sm)] font-medium transition-all ${
            value === opt.value
              ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-[var(--shadow-sm)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
