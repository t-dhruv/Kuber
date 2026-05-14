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

const SESSION_KEY = 'ruleSuggestionsDismissed';

function loadDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (_e) {
    return new Set();
  }
}

function saveDismissed(set: Set<string>) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...set]));
  } catch (_e) {
    // sessionStorage unavailable (e.g. private browsing restrictions)
  }
}

export function RuleSuggestionBanner({ suggestions, onCreateRule }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);

  function dismiss(value: string) {
    setDismissed((prev) => {
      const next = new Set([...prev, value]);
      saveDismissed(next);
      return next;
    });
  }

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
            <Button size="sm" onClick={() => { dismiss(s.value); onCreateRule(s); }}>
              Create Rule
            </Button>
            <button
              onClick={() => dismiss(s.value)}
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
