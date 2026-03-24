import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

const STORAGE_KEY = 'kuber-sidebar-collapsed';

export function AppShell() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // Mobile drawer state — hidden by default on small screens
  const [mobileOpen, setMobileOpen] = useState(false);

  // Keep in sync when sidebar toggles itself (via its own button)
  useEffect(() => {
    const handler = () => {
      try {
        setCollapsed(localStorage.getItem(STORAGE_KEY) === 'true');
      } catch {
        // ignore
      }
    };
    window.addEventListener('storage', handler);
    // Poll localStorage since same-tab writes don't trigger storage event
    const interval = setInterval(handler, 150);
    return () => {
      window.removeEventListener('storage', handler);
      clearInterval(interval);
    };
  }, []);

  // Close mobile drawer on resize to desktop
  useEffect(() => {
    const handler = () => {
      if (window.innerWidth >= 768) setMobileOpen(false);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // On desktop, sidebar is always visible and offset is applied via padding
  // On mobile, sidebar is hidden by default and shown as a drawer
  const sidebarWidth = collapsed ? 'md:pl-16' : 'md:pl-64';

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — always visible on desktop, drawer on mobile */}
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className={`flex flex-col min-h-screen transition-all duration-200 ${sidebarWidth}`}>
        <Header
          onToggleSidebar={() => {
            // On mobile: toggle drawer; on desktop: toggle collapse
            if (window.innerWidth < 768) {
              setMobileOpen((v) => !v);
            } else {
              const next = !collapsed;
              setCollapsed(next);
              try {
                localStorage.setItem(STORAGE_KEY, String(next));
              } catch {
                // ignore
              }
            }
          }}
        />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
