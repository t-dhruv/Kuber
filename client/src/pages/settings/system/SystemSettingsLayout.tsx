import { NavLink, Outlet } from 'react-router-dom';
import { Briefcase, Zap, Plug, Brain } from 'lucide-react';

const navItems = [
  { to: '/settings/system/jobs',         label: 'Cron Jobs',    icon: Briefcase },
  { to: '/settings/system/automation',   label: 'Automation',   icon: Zap },
  { to: '/settings/system/integrations', label: 'Integrations', icon: Plug },
  { to: '/settings/system/ai',           label: 'AI Features',  icon: Brain },
];

export default function SystemSettingsLayout() {
  return (
    <div className="flex gap-6">
      <nav className="w-44 shrink-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3 px-2">System</p>
        <ul className="space-y-0.5">
          {navItems.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-sm)] text-sm transition-colors ${
                    isActive
                      ? 'bg-[var(--color-primary-subtle)] text-[var(--color-primary)] font-medium'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-raised)]'
                  }`
                }
              >
                <Icon size={14} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex-1 min-w-0 space-y-4">
        <Outlet />
      </div>
    </div>
  );
}
