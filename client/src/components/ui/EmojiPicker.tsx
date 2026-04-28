import { useState, useRef, useEffect } from 'react';
import EmojiPickerLib, { Theme, EmojiStyle, type EmojiClickData } from 'emoji-picker-react';

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
}

export function EmojiPicker({ value, onChange }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function handleSelect(data: EmojiClickData) {
    onChange(data.emoji);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 px-3.5 py-2 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg)] cursor-pointer leading-none min-w-[120px]"
      >
        <span className="text-2xl">{value || '—'}</span>
        <span className="text-xs text-[var(--color-text-muted)] ml-auto">Pick ▾</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 z-[100] mt-1">
          <EmojiPickerLib
            onEmojiClick={handleSelect}
            theme={Theme.AUTO}
            emojiStyle={EmojiStyle.NATIVE}
            searchPlaceholder="Search emoji…"
            lazyLoadEmojis
            width={320}
            height={380}
          />
        </div>
      )}
    </div>
  );
}
