import { useQuery } from "@tanstack/react-query";
import { X, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { api } from "@/lib/api";

interface DrillFilter {
  groupId: string;
  groupName: string;
  groupIcon?: string | null;
  mode: "spending" | "income";
  groupBy: string;
  startDate: string;
  endDate: string;
}

interface DrillTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  isRefund: boolean;
  category: { id: string; name: string; icon: string | null } | null;
  merchant: { id: string; name: string } | null;
  account: { id: string; name: string };
  tags: { id: string; name: string; color: string | null }[];
}

interface Props {
  filter: DrillFilter;
  onClose: () => void;
}

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Math.abs(n),
  );

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export function DrillPanel({ filter, onClose }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["reports", "drill", filter],
    queryFn: () =>
      api
        .get<{ transactions: DrillTransaction[]; total: number }>(
          "/reports/drill",
          {
            params: {
              groupBy: filter.groupBy,
              groupId: filter.groupId,
              mode: filter.mode,
              startDate: filter.startDate,
              endDate: filter.endDate,
            },
          },
        )
        .then((r) => r.data),
  });

  const monetaryTotal =
    data?.transactions.reduce((s, t) => s + Math.abs(t.amount), 0) ?? 0;

  return (
    <div className="flex flex-col h-full border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {filter.groupIcon && (
            <span className="text-lg shrink-0">{filter.groupIcon}</span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{filter.groupName}</p>
            <p className="text-xs text-muted-foreground capitalize">
              {filter.mode} transactions
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-2"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      {/* Transaction list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : !data?.transactions.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No transactions found
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {data.transactions.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors"
              >
                <div
                  className={`p-1.5 rounded-full shrink-0 ${
                    t.amount < 0
                      ? "bg-red-500/10 text-red-500"
                      : "bg-emerald-500/10 text-emerald-500"
                  }`}
                >
                  {t.amount < 0 ? (
                    <ArrowUpRight size={14} />
                  ) : (
                    <ArrowDownLeft size={14} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {t.merchant?.name ?? t.description}
                    {t.isRefund && (
                      <span className="ml-1.5 text-xs text-emerald-600 font-normal">
                        refund
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(t.date)} · {t.account.name}
                  </p>
                </div>
                <span
                  className={`text-sm font-medium tabular-nums shrink-0 ${
                    t.amount < 0 ? "text-foreground" : "text-emerald-600"
                  }`}
                >
                  {t.amount < 0 ? "-" : "+"}
                  {fmtCurrency(t.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      {data && data.transactions.length > 0 && (
        <div className="px-4 py-3 border-t border-border flex justify-between items-center shrink-0">
          <span className="text-xs text-muted-foreground">
            {data.transactions.length} transaction{data.transactions.length !== 1 ? "s" : ""}
          </span>
          <span className="text-sm font-semibold">
            {fmtCurrency(monetaryTotal)}
          </span>
        </div>
      )}
    </div>
  );
}
