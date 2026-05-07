export const DATE_PRESETS = [
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "last3months", label: "Last 3 months" },
  { value: "last6months", label: "Last 6 months" },
  { value: "thisYear", label: "This year" },
  { value: "lastYear", label: "Last year" },
  { value: "custom", label: "Custom range" },
] as const;

export type DatePreset = (typeof DATE_PRESETS)[number]["value"];

export interface DateRange {
  startDate: string;
  endDate: string;
}

function fmtDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function computeDateRange(
  preset: DatePreset,
  customRange?: Partial<DateRange>,
  now = new Date(),
): DateRange {
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (preset) {
    case "thisMonth":
      return {
        startDate: fmtDate(new Date(y, m, 1)),
        endDate: fmtDate(new Date(y, m + 1, 0)),
      };
    case "lastMonth":
      return {
        startDate: fmtDate(new Date(y, m - 1, 1)),
        endDate: fmtDate(new Date(y, m, 0)),
      };
    case "last3months": {
      const start = new Date(y, m - 2, 1);
      return {
        startDate: fmtDate(start),
        endDate: fmtDate(new Date(y, m + 1, 0)),
      };
    }
    case "last6months": {
      const start = new Date(y, m - 5, 1);
      return {
        startDate: fmtDate(start),
        endDate: fmtDate(new Date(y, m + 1, 0)),
      };
    }
    case "thisYear":
      return {
        startDate: fmtDate(new Date(y, 0, 1)),
        endDate: fmtDate(new Date(y, 11, 31)),
      };
    case "lastYear":
      return {
        startDate: fmtDate(new Date(y - 1, 0, 1)),
        endDate: fmtDate(new Date(y - 1, 11, 31)),
      };
    case "custom":
      return {
        startDate: customRange?.startDate || fmtDate(new Date(y, m - 2, 1)),
        endDate: customRange?.endDate || fmtDate(new Date(y, m + 1, 0)),
      };
  }
}
