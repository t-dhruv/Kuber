import { useState, useRef, useEffect, type KeyboardEvent } from 'react';

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder = 'Ask me anything about your finances...' }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = 24; // ~1.5rem
    const maxHeight = lineHeight * 6 + 16; // 6 rows + padding
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [value]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    // Reset height
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  return (
    <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex gap-3 items-end max-w-4xl mx-auto">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-[var(--color-background)] border border-[var(--color-border)] rounded-2xl px-4 py-3 text-[0.9375rem] text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_var(--color-accent-light)] transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-y-auto"
          style={{ minHeight: '3rem' }}
        />
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className="flex-shrink-0 h-11 w-11 rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-[#7c3aed] text-white flex items-center justify-center hover:opacity-90 hover:shadow-lg hover:shadow-[var(--color-accent)]/25 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          title="Send (Enter)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
      <p className="text-center text-[0.6875rem] text-[var(--color-text-muted)] mt-2.5">
        Press <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-surface-hover)] font-mono text-[0.625rem]">Enter</kbd> to send · <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-surface-hover)] font-mono text-[0.625rem]">Shift + Enter</kbd> for new line
      </p>
    </div>
  );
}
