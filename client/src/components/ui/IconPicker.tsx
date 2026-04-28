import { useState } from 'react';
import {
  ShoppingCart,
  Utensils,
  Car,
  Home,
  Heart,
  Film,
  Music,
  Gamepad2,
  Plane,
  Briefcase,
  Wallet,
  CreditCard,
  PiggyBank,
  TrendingUp,
  DollarSign,
  Phone,
  Wifi,
  Smartphone,
  Laptop,
  Camera,
  BookOpen,
  GraduationCap,
  Stethoscope,
  Dumbbell,
  Coffee,
  Beer,
  Gift,
  HeartHandshake,
  Sparkles,
  Zap,
  Star,
  Tag,
  Grid,
  List,
} from 'lucide-react';

const ICONS = [
  { id: 'shopping-cart', icon: ShoppingCart, label: 'Shopping' },
  { id: 'utensils', icon: Utensils, label: 'Food' },
  { id: 'car', icon: Car, label: 'Transport' },
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'heart', icon: Heart, label: 'Health' },
  { id: 'film', icon: Film, label: 'Entertainment' },
  { id: 'music', icon: Music, label: 'Music' },
  { id: 'gamepad', icon: Gamepad2, label: 'Gaming' },
  { id: 'plane', icon: Plane, label: 'Travel' },
  { id: 'briefcase', icon: Briefcase, label: 'Work' },
  { id: 'wallet', icon: Wallet, label: 'Wallet' },
  { id: 'credit-card', icon: CreditCard, label: 'Card' },
  { id: 'piggy-bank', icon: PiggyBank, label: 'Savings' },
  { id: 'trending-up', icon: TrendingUp, label: 'Investing' },
  { id: 'dollar-sign', icon: DollarSign, label: 'Money' },
  { id: 'phone', icon: Phone, label: 'Phone' },
  { id: 'wifi', icon: Wifi, label: 'Internet' },
  { id: 'smartphone', icon: Smartphone, label: 'Mobile' },
  { id: 'laptop', icon: Laptop, label: 'Tech' },
  { id: 'camera', icon: Camera, label: 'Photo' },
  { id: 'book', icon: BookOpen, label: 'Education' },
  { id: 'graduation', icon: GraduationCap, label: 'School' },
  { id: 'stethoscope', icon: Stethoscope, label: 'Medical' },
  { id: 'dumbbell', icon: Dumbbell, label: 'Fitness' },
  { id: 'beer', icon: Beer, label: 'Drinks' },
  { id: 'gift', icon: Gift, label: 'Gift' },
  { id: 'heart-handshake', icon: HeartHandshake, label: 'Charity' },
  { id: 'sparkles', icon: Sparkles, label: 'Beauty' },
  { id: 'coffee', icon: Coffee, label: 'Coffee' },
  { id: 'zap', icon: Zap, label: 'Utilities' },
  { id: 'star', icon: Star, label: 'Favorite' },
  { id: 'tag', icon: Tag, label: 'Tag' },
  { id: 'grid', icon: Grid, label: 'Category' },
  { id: 'list', icon: List, label: 'List' },
];

interface IconPickerProps {
  value: string | null;
  onChange: (iconId: string | null) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [search, setSearch] = useState('');

  const filtered = ICONS.filter((ic) =>
    ic.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <input
        type="text"
        placeholder="Search icons..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
      />
      <div className="grid grid-cols-6 gap-2 max-h-48 overflow-y-auto">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`p-2 rounded-[var(--radius-md)] border transition-colors ${
            value === null
              ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
              : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
          }`}
          aria-label="No icon"
        >
          <span className="text-xs text-[var(--color-text-muted)]">None</span>
        </button>
        {filtered.map((ic) => {
          const Icon = ic.icon;
          return (
            <button
              key={ic.id}
              type="button"
              onClick={() => onChange(ic.id)}
              className={`p-2 rounded-[var(--radius-md)] border transition-colors flex items-center justify-center ${
                value === ic.id
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                  : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
              }`}
              aria-label={ic.label}
              title={ic.label}
            >
              <Icon size={20} className={value === ic.id ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)]'} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function getIconById(id: string | null) {
  if (!id) return null;
  return ICONS.find((ic) => ic.id === id)?.icon ?? null;
}

export function renderIcon(id: string | null, options?: { size?: number; className?: string }) {
  const Icon = getIconById(id);
  if (!Icon) return null;
  return <Icon size={options?.size ?? 20} className={options?.className ?? ''} />
}

function IconDisplay({ iconId, size = 20, className = '' }: { iconId: string; size?: number; className?: string }) {
  const Icon = getIconById(iconId);
  if (!Icon) return null;
  return <Icon size={size} className={className} />;
}

IconPicker.IconDisplay = IconDisplay;