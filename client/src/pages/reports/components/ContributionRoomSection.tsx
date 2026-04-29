import { useQuery } from "@tanstack/react-query";
import { Card, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { PiggyBank } from "lucide-react";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

type TaxRoomAccount = {
  id: string;
  name: string;
  type: "TFSA" | "RRSP" | "FHSA" | "RESP" | "401k" | "IRA";
  memberName?: string | null;
  contributionsYtd?: number;
  roomRemaining: number;
  overContribution: number;
  pctUsed: number;
  alert: "ok" | "warning" | "over";
};

type TaxRoomResponse = {
  accounts: TaxRoomAccount[];
};

export type ContributionRoomSectionData = TaxRoomResponse;

type ContributionRoomSectionProps = {
  data?: TaxRoomResponse;
};

function RoomCard({ room }: { room: TaxRoomAccount }) {
  const used = Math.max(0, room.pctUsed);
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-[var(--color-text)]">{room.type}</div>
          <div className="text-xs text-[var(--color-text-muted)]">
            Used {money(room.contributionsYtd ?? 0)}{room.memberName ? ` • ${room.memberName}` : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-[var(--color-text)]">{money(room.roomRemaining)}</div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {room.overContribution > 0 ? `Over by ${money(room.overContribution)}` : "Remaining"}
          </div>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface-hover)]">
        <div className="h-full rounded-full bg-[var(--color-success)]" style={{ width: `${Math.min(used, 100)}%` }} />
      </div>
    </div>
  );
}

export function ContributionRoomSection({ data }: ContributionRoomSectionProps = {}) {
  const query = useQuery<TaxRoomResponse>({
    queryKey: ["reports", "tax-accounts", "household-summary"],
    queryFn: () => api.get("/tax-accounts/household-summary").then((r) => r.data),
    enabled: !data,
  });

  const resolved = data ?? query.data;
  const isLoading = data ? false : query.isLoading;
  const isError = data ? false : query.isError;

  const rooms = resolved?.accounts ?? [];
  const summary = rooms.length
    ? rooms.reduce(
        (acc, room) => {
          acc.remaining += Math.max(0, room.roomRemaining);
          acc.over += Math.max(0, room.overContribution);
          return acc;
        },
        { remaining: 0, over: 0 },
      )
    : { remaining: 0, over: 0 };

  return (
    <Card style={{ padding: "1.25rem" }}>
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
        <PiggyBank size={16} className="text-[var(--color-accent)]" />
        Contribution Room
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <Skeleton className="h-4 w-32 mb-2" />
              <Skeleton className="h-3 w-52" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="mt-4 text-sm text-[var(--color-danger)]">Failed to load contribution room.</div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Remaining room</div>
              <div className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{money(summary.remaining)}</div>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <div className="text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Over-contribution</div>
              <div className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{money(summary.over)}</div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {rooms.map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
            {rooms.length === 0 && (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text-muted)]">
                No tax-advantaged accounts have been configured yet.
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
