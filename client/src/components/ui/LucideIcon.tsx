import React from 'react';
import * as LucideIcons from 'lucide-react';

type LucideIconProps = {
  name: string;
  size?: number;
  className?: string;
};

const iconNameMap: Record<string, string> = {
  'shopping-cart': 'ShoppingCart',
  'trending-up': 'TrendingUp',
  'dollar-sign': 'DollarSign',
  'credit-card': 'CreditCard',
  'piggy-bank': 'PiggyBank',
  'heart-handshake': 'HeartHandshake',
  'graduation-cap': 'GraduationCap',
  'gamepad-2': 'Gamepad2',
};

type IconComponentType = React.ComponentType<{
  size?: number;
  className?: string;
}>;

export function LucideIcon({ name, size = 16, className }: LucideIconProps) {
  const pascalCase = name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

  const iconKey = iconNameMap[name] || pascalCase;
  const IconComponent = (LucideIcons as Record<string, unknown>)[iconKey] as IconComponentType | undefined;

  if (!IconComponent) {
    return <span className={className}>{name}</span>;
  }

  return <IconComponent size={size} className={className} />;
}
