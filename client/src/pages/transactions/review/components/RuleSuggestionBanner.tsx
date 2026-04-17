import { useState } from 'react';
import { Zap, X } from 'lucide-react';
import { Button } from '@/components/ui';

export interface RuleSuggestion {
  pattern: string;
  value: string;
  suggestedCategoryId: string | null;
  suggestedCategoryName: string;
  matchCount: number;
}

interface Props {
  suggestions: RuleSuggestion[];
  onCreateRule: (suggestion: RuleSuggestion) => void;
}

export function RuleSuggestionBanner({ suggestions, onCreateRule }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = suggestions.filter((s) => !dismissed.has(s.value));
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mb-4">
      {visible.map((s) => (
        <div
          key={s.value}
          className="flex items-center justify-between p-3 rounded-[var(--radius-md)] bg-[var(--color-accent-light)] border border-[var(--color-accent)] text-sm"
        >
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-[var(--color-accent)] flex-shrink-0" />
            <span>
              <span className="font-medium">{s.matchCount} transactions</span> match{' '}
              <code className="bg-white/30 px-1 rounded">"{s.value}*"</code> → all suggested{' '}
              <span className="font-medium">{s.suggestedCategoryName}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button size="sm" onClick={() => onCreateRule(s)}>
              Create Rule
            </Button>
            <button
              onClick={() => setDismissed((d) => new Set([...d, s.value]))}
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
