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
      <div className="flex items-center gap-2 text-xs text-[color:var(--text-secondary)] bg-[color:var(--surface-hover)] rounded-lg px-3 py-2">
        <Sparkles size={13} className="text-indigo-400 shrink-0" />
        <span>{message}</span>
        <Link to="/settings?tab=integrations" className="text-indigo-500 hover:underline whitespace-nowrap flex items-center gap-0.5 font-medium">
          Set up <ArrowRight size={11} />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 px-4 py-3">
      <Sparkles size={18} className="text-indigo-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200">AI feature available</p>
        <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-0.5">{message}</p>
        <Link
          to="/settings?tab=integrations"
          className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Go to Settings → Integrations <ArrowRight size={12} />
        </Link>
      </div>
      {dismissable && (
        <button onClick={() => setDismissed(true)} className="p-0.5 text-indigo-400 hover:text-indigo-600">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
