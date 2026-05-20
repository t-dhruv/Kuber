import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Server } from 'lucide-react';
import { TaxAccountsSection } from './components/TaxAccountsSection';
import { AutomationSection } from './components/AutomationSection';
import {
  AuditLogSection,
  BillingSection,
  CategoriesSection,
  DataSection,
  DisplaySection,
  HouseholdSection,
  IntegrationsSection,
  MerchantsSection,
  NAV_ITEMS,
  NotificationsSection,
  ProfileSection,
  ReportDigestSection,
  SecuritySection,
  TagsSection,
  WebhooksSection,
  type NavSection,
} from './tabs/SettingsSections';

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<NavSection>('profile');
  const navigate = useNavigate();

  function renderSection() {
    switch (activeSection) {
      case 'profile': return <ProfileSection />;
      case 'display': return <DisplaySection />;
      case 'notifications': return <NotificationsSection />;
      case 'security': return <SecuritySection />;
      case 'household': return <HouseholdSection />;
      case 'categories': return <CategoriesSection />;
      case 'tags': return <TagsSection />;
      case 'merchants': return <MerchantsSection />;
      case 'integrations': return <IntegrationsSection />;
      case 'report-digest': return <ReportDigestSection />;
      case 'data': return <DataSection />;
      case 'billing': return <BillingSection />;
      case 'audit': return <AuditLogSection />;
      case 'tax-accounts': return <TaxAccountsSection />;
      case 'automation': return <AutomationSection />;
      case 'webhooks': return <WebhooksSection />;
    }
  }

  return (
    <div className="flex min-h-full">
      <nav aria-label="Settings navigation" className="w-[200px] shrink-0 pr-4 border-r border-[var(--color-border)] mr-8">
        <div className="mb-3 text-[0.6875rem] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.06em]">
          Settings
        </div>
        <div className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-[var(--radius-md)] border-none cursor-pointer text-left text-sm transition-[background-color,color] duration-[0.15s]"
                style={{
                  fontWeight: isActive ? 600 : 400,
                  backgroundColor: isActive ? 'var(--color-accent-light)' : 'transparent',
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
                    e.currentTarget.style.color = 'var(--color-text)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                  }
                }}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="shrink-0 flex items-center">{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </div>
        <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
          <div className="mb-2 text-[0.6875rem] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.06em]">
            System
          </div>
          <button
            onClick={() => navigate('/settings/system')}
            className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-[var(--radius-md)] border-none cursor-pointer text-left text-sm transition-[background-color,color] duration-[0.15s]"
            style={{ fontWeight: 400, backgroundColor: 'transparent', color: 'var(--color-text-secondary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)';
              e.currentTarget.style.color = 'var(--color-text)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--color-text-secondary)';
            }}
          >
            <span className="shrink-0 flex items-center"><Server size={16} /></span>
            System
          </button>
        </div>
      </nav>

      <main className="flex-1 min-w-0 pb-8">
        {renderSection()}
      </main>
    </div>
  );
}
