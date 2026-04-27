interface Props {
  onSelect: (text: string) => void;
  disabled?: boolean;
}

export const SUGGESTIONS = [
  "What's my net worth?",
  "How am I tracking against my budget this month?",
  "Which categories am I overspending on?",
  "How are my investments performing?",
  "Give me 3 ways to save more money",
  "What were my biggest expenses this month?",
];

export function SuggestionChips({ onSelect, disabled }: Props) {
  return (
    <div className="flex flex-wrap gap-2.5 justify-center">
      {SUGGESTIONS.map((s, i) => (
        <button
          key={s}
          onClick={() => onSelect(s)}
          disabled={disabled}
          className={`px-4 py-2.5 text-[0.8125rem] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] hover:shadow-md hover:shadow-[var(--color-accent)]/10 hover:bg-[var(--color-accent-light)]/30 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed`}
          style={{ animationDelay: `${i * 50}ms` }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
