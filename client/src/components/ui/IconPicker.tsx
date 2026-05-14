import { EmojiPicker } from './EmojiPicker';

interface IconPickerProps {
  value: string | null;
  onChange: (icon: string | null) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  return (
    <div className="space-y-2">
      <EmojiPicker value={value ?? ''} onChange={(em) => onChange(em || null)} />
      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function IconDisplay({ iconId }: { iconId: string; size?: number; className?: string }) {
  return <span className="text-xl leading-none">{iconId}</span>;
}

IconPicker.IconDisplay = IconDisplay;
