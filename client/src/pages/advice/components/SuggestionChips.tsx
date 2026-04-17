interface Props {
  onSelect: (text: string) => void;
  disabled?: boolean;
}

const SUGGESTIONS = [
  "What's my net worth?",
  "How am I tracking against my budget this month?",
  "Which categories am I overspending on?",
  "How are my investments performing?",
  "Give me 3 ways to save more money",
  "What were my biggest expenses this month?",
];

export function SuggestionChips({ onSelect, disabled }: Props) {
  return (
    <div className="flex flex-wrap gap-2 justify-center max-w-lg">
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          onClick={() => onSelect(s)}
          disabled={disabled}
          className={`px-3.5 py-2 text-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-light)] transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
