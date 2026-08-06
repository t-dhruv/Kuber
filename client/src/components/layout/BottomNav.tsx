import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ArrowLeftRight, PieChart, Target, Menu } from 'lucide-react';

interface BottomNavProps {
  onOpenSidebar: () => void;
}

const navItems = [
  { to: '/', icon: <LayoutDashboard size={20} />, label: 'Dashboard', end: true },
  { to: '/transactions', icon: <ArrowLeftRight size={20} />, label: 'Transactions', end: false },
  { to: '/budget', icon: <PieChart size={20} />, label: 'Budget', end: false },
  { to: '/goals', icon: <Target size={20} />, label: 'Goals', end: false },
];

export function BottomNav({ onOpenSidebar }: BottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden bg-[var(--color-surface)] border-t border-[var(--color-border)] pb-safe"
      aria-label="Bottom navigation"
    >
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[44px] py-2 text-[0.625rem] font-medium transition-colors ${
              isActive
                ? 'text-[var(--color-accent)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`
          }
          aria-label={item.label}
        >
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}

      {/* More button — opens sidebar drawer */}
      <button
        onClick={onOpenSidebar}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[44px] py-2 text-[0.625rem] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
        aria-label="More navigation"
      >
        <Menu size={20} />
        <span>More</span>
      </button>
    </nav>
  );
}
