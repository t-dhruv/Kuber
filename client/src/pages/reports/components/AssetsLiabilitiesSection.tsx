import { Card } from "@/components/ui";
import { Building2, Home, ShieldAlert, Wallet } from "lucide-react";
import type { ReactNode } from "react";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

type LineItem = {
  label: string;
  value: number;
  note: string;
  icon: ReactNode;
};

const assets: LineItem[] = [
  { label: "Cash & bank", value: 48250, note: "Liquid balances", icon: <Wallet size={18} /> },
  { label: "Investments", value: 154800, note: "Brokerage and retirement", icon: <Building2 size={18} /> },
  { label: "Home equity", value: 225000, note: "Primary residence estimate", icon: <Home size={18} /> },
];

const liabilities: LineItem[] = [
  { label: "Mortgage", value: 318400, note: "Long-term debt", icon: <Home size={18} /> },
  { label: "Credit cards", value: 8200, note: "Revolving balances", icon: <ShieldAlert size={18} /> },
];

function SectionCard({ title, items, total, tone }: { title: string; items: LineItem[]; total: number; tone: "positive" | "negative" }) {
  const totalColor = tone === "positive" ? "var(--color-success)" : "var(--color-danger)";

  return (
    <Card style={{ padding: "1.25rem" }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">{title}</div>
          <div className="mt-1 text-2xl font-semibold text-[var(--color-text)]">{money(total)}</div>
        </div>
        <div className="rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: "var(--color-surface-hover)", color: totalColor }}>
          {tone === "positive" ? "Assets" : "Liabilities"}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]">
                {item.icon}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-[var(--color-text)]">{item.label}</div>
                <div className="text-xs text-[var(--color-text-muted)]">{item.note}</div>
              </div>
            </div>
            <div className="text-sm font-semibold text-[var(--color-text)]">{money(item.value)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function AssetsLiabilitiesSection() {
  const assetsTotal = assets.reduce((sum, item) => sum + item.value, 0);
  const liabilitiesTotal = liabilities.reduce((sum, item) => sum + item.value, 0);
  const net = assetsTotal - liabilitiesTotal;

  return (
    <div className="space-y-4">
      <div className="text-sm font-semibold text-[var(--color-text)]">Assets / Liabilities</div>
      <div className="grid gap-3 md:grid-cols-3">
        <Card style={{ padding: "1.25rem" }}>
          <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Total Assets</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{money(assetsTotal)}</div>
        </Card>
        <Card style={{ padding: "1.25rem" }}>
          <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Total Liabilities</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{money(liabilitiesTotal)}</div>
        </Card>
        <Card style={{ padding: "1.25rem" }}>
          <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Net Position</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{money(net)}</div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Assets" items={assets} total={assetsTotal} tone="positive" />
        <SectionCard title="Liabilities" items={liabilities} total={liabilitiesTotal} tone="negative" />
      </div>
    </div>
  );
}
