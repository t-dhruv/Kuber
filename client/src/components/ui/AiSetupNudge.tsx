/**
 * AiSetupNudge.tsx
 * Reusable banner shown when an AI feature requires provider configuration.
 * Links to Settings → Integrations.
 */
import { Sparkles, ArrowRight, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';

interface Props {
  message?: string;
  dismissable?: boolean;
  compact?: boolean;
}

export function AiSetupNudge({
  message = 'Set up an AI provider to unlock this feature — Claude, OpenAI, Gemini, or free local Ollama.',
  dismissable = false,
  compact = false,
}: Props) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs text-[color:var(--color-text-secondary)] bg-[color:var(--color-surface-hover)] rounded-lg px-3 py-2">
        <Sparkles size={13} className="text-[var(--color-accent)] shrink-0" />
        <span>{message}</span>
        <Link to="/settings?tab=integrations" className="text-[var(--color-accent)] hover:underline whitespace-nowrap flex items-center gap-0.5 font-medium">
          Set up <ArrowRight size={11} />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-accent-light)] px-4 py-3">
      <Sparkles size={18} className="text-[var(--color-accent)] shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--color-text)]">AI feature available</p>
        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 text-pretty">{message}</p>
        <Link
          to="/settings?tab=integrations"
          className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-[var(--color-accent)] hover:underline"
        >
          Go to Settings → Integrations <ArrowRight size={12} />
        </Link>
      </div>
      {dismissable && (
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors duration-150"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
