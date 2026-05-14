import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, Skeleton } from "@/components/ui";
import { Building2, Home, ShieldAlert, Wallet, TrendingUp } from "lucide-react";
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

type AssetsLiabilitiesData = {
  bankAccountsTotal: number;
  investmentsTotal: number;
  manualAssetsTotal: number;
  manualLiabilitiesTotal: number;
  mortgageTotal: number;
  creditCardTotal: number;
  otherLiabilitiesTotal: number;
};

type AssetsLiabilitiesProps = {
  data?: AssetsLiabilitiesData;
};

function SectionCard({
  title,
  items,
  total,
  tone,
}: {
  title: string;
  items: LineItem[];
  total: number;
  tone: "positive" | "negative";
}) {
  const totalColor = tone === "positive" ? "var(--color-success)" : "var(--color-danger)";

  return (
    <Card style={{ padding: "1.25rem" }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            {title}
          </div>
          <div className="mt-1 text-2xl font-semibold text-[var(--color-text)]">
            {money(total)}
          </div>
        </div>
        <div
          className="rounded-full px-3 py-1 text-xs font-semibold"
          style={{
            backgroundColor: "var(--color-surface-hover)",
            color: totalColor,
          }}
        >
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
                <div className="text-sm font-medium text-[var(--color-text)]">
                  {item.label}
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  {item.note}
                </div>
              </div>
            </div>
            <div className="text-sm font-semibold text-[var(--color-text)]">
              {money(item.value)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AssetsLiabilitiesLoader() {
  const { data, isLoading, isError } = useQuery<AssetsLiabilitiesData>({
    queryKey: ["reports", "assets-liabilities"],
    queryFn: () =>
      api
        .get("/assets/net-worth-breakdown")
        .then((r) => {
          const d = r.data;
          return {
            bankAccountsTotal: d.bankAccountsTotal ?? 0,
            investmentsTotal: d.investmentsTotal ?? 0,
            manualAssetsTotal: d.manualAssetsTotal ?? 0,
            manualLiabilitiesTotal: d.manualLiabilitiesTotal ?? 0,
            mortgageTotal: d.mortgageTotal ?? 0,
            creditCardTotal: d.creditCardTotal ?? 0,
            otherLiabilitiesTotal: d.otherLiabilitiesTotal ?? 0,
          };
        }),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={60} />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} height={200} />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="text-sm text-[var(--color-danger)]">
        Failed to load assets/liabilities.
      </div>
    );
  }

  const assetItems: LineItem[] = [];
  if (data.bankAccountsTotal > 0) {
    assetItems.push({
      label: "Cash & bank",
      value: data.bankAccountsTotal,
      note: "Liquid balances",
      icon: <Wallet size={18} />,
    });
  }
  if (data.investmentsTotal > 0) {
    assetItems.push({
      label: "Investments",
      value: data.investmentsTotal,
      note: "Brokerage and retirement",
      icon: <Building2 size={18} />,
    });
  }
  if (data.manualAssetsTotal > 0) {
    assetItems.push({
      label: "Other assets",
      value: data.manualAssetsTotal,
      note: "Manual assets (real estate, vehicles, etc.)",
      icon: <Home size={18} />,
    });
  }

  const liabilityItems: LineItem[] = [];
  if (data.mortgageTotal > 0) {
    liabilityItems.push({
      label: "Mortgage",
      value: data.mortgageTotal,
      note: "Long-term debt",
      icon: <Home size={18} />,
    });
  }
  if (data.creditCardTotal > 0) {
    liabilityItems.push({
      label: "Credit cards",
      value: data.creditCardTotal,
      note: "Revolving balances",
      icon: <ShieldAlert size={18} />,
    });
  }
  if (data.otherLiabilitiesTotal > 0) {
    liabilityItems.push({
      label: "Other liabilities",
      value: data.otherLiabilitiesTotal,
      note: "Loans and other debts",
      icon: <ShieldAlert size={18} />,
    });
  }

  const assetsTotal =
    data.bankAccountsTotal + data.investmentsTotal + data.manualAssetsTotal;
  const liabilitiesTotal =
    data.mortgageTotal + data.creditCardTotal + data.otherLiabilitiesTotal;
  const net = assetsTotal - liabilitiesTotal;

  return (
    <AssetsLiabilitiesView
      assetItems={assetItems}
      liabilityItems={liabilityItems}
      assetsTotal={assetsTotal}
      liabilitiesTotal={liabilitiesTotal}
      net={net}
    />
  );
}

function AssetsLiabilitiesView({
  assetItems,
  liabilityItems,
  assetsTotal,
  liabilitiesTotal,
  net,
}: {
  assetItems: LineItem[];
  liabilityItems: LineItem[];
  assetsTotal: number;
  liabilitiesTotal: number;
  net: number;
}) {
  return (
    <div className="space-y-4">
      <div className="text-sm font-semibold text-[var(--color-text)]">
        Assets / Liabilities
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Card style={{ padding: "1.25rem" }}>
          <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            Total Assets
          </div>
          <div className="mt-2 text-2xl font-semibold text-[var(--color-text)]">
            {money(assetsTotal)}
          </div>
        </Card>
        <Card style={{ padding: "1.25rem" }}>
          <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            Total Liabilities
          </div>
          <div className="mt-2 text-2xl font-semibold text-[var(--color-text)]">
            {money(liabilitiesTotal)}
          </div>
        </Card>
        <Card style={{ padding: "1.25rem" }}>
          <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            Net Position
          </div>
          <div className="mt-2 text-2xl font-semibold text-[var(--color-text)]">
            {money(net)}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="Assets"
          items={assetItems}
          total={assetsTotal}
          tone="positive"
        />
        <SectionCard
          title="Liabilities"
          items={liabilityItems}
          total={liabilitiesTotal}
          tone="negative"
        />
      </div>
    </div>
  );
}

export function AssetsLiabilitiesSection({
  data,
}: AssetsLiabilitiesProps = {}) {
  if (data) {
    const assetItems: LineItem[] = [];
    if (data.bankAccountsTotal > 0) {
      assetItems.push({
        label: "Cash & bank",
        value: data.bankAccountsTotal,
        note: "Liquid balances",
        icon: <Wallet size={18} />,
      });
    }
    if (data.investmentsTotal > 0) {
      assetItems.push({
        label: "Investments",
        value: data.investmentsTotal,
        note: "Brokerage and retirement",
        icon: <Building2 size={18} />,
      });
    }
    if (data.manualAssetsTotal > 0) {
      assetItems.push({
        label: "Other assets",
        value: data.manualAssetsTotal,
        note: "Manual assets",
        icon: <Home size={18} />,
      });
    }

    const liabilityItems: LineItem[] = [];
    if (data.mortgageTotal > 0) {
      liabilityItems.push({
        label: "Mortgage",
        value: data.mortgageTotal,
        note: "Long-term debt",
        icon: <Home size={18} />,
      });
    }
    if (data.creditCardTotal > 0) {
      liabilityItems.push({
        label: "Credit cards",
        value: data.creditCardTotal,
        note: "Revolving balances",
        icon: <ShieldAlert size={18} />,
      });
    }
    if (data.otherLiabilitiesTotal > 0) {
      liabilityItems.push({
        label: "Other liabilities",
        value: data.otherLiabilitiesTotal,
        note: "Other debts",
        icon: <ShieldAlert size={18} />,
      });
    }

    const assetsTotal =
      data.bankAccountsTotal + data.investmentsTotal + data.manualAssetsTotal;
    const liabilitiesTotal =
      data.mortgageTotal +
      data.creditCardTotal +
      data.otherLiabilitiesTotal;
    const net = assetsTotal - liabilitiesTotal;

    return (
      <AssetsLiabilitiesView
        assetItems={assetItems}
        liabilityItems={liabilityItems}
        assetsTotal={assetsTotal}
        liabilitiesTotal={liabilitiesTotal}
        net={net}
      />
    );
  }

  return <AssetsLiabilitiesLoader />;
}
