import { describe, expect, it } from "vitest";
import { DATE_PRESETS, computeDateRange } from "../../../src/pages/reports/dateRange";

describe("computeDateRange", () => {
  const now = new Date("2026-05-07T12:00:00.000Z");

  it("lists every supported report date preset", () => {
    expect(DATE_PRESETS.map((preset) => preset.value)).toEqual([
      "thisMonth",
      "lastMonth",
      "last3months",
      "last6months",
      "thisYear",
      "lastYear",
      "custom",
    ]);
  });

  it("computes month and rolling month preset ranges", () => {
    expect(computeDateRange("thisMonth", undefined, now)).toEqual({
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    expect(computeDateRange("lastMonth", undefined, now)).toEqual({
      startDate: "2026-04-01",
      endDate: "2026-04-30",
    });
    expect(computeDateRange("last3months", undefined, now)).toEqual({
      startDate: "2026-03-01",
      endDate: "2026-05-31",
    });
    expect(computeDateRange("last6months", undefined, now)).toEqual({
      startDate: "2025-12-01",
      endDate: "2026-05-31",
    });
  });

  it("computes calendar year preset ranges", () => {
    expect(computeDateRange("thisYear", undefined, now)).toEqual({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    expect(computeDateRange("lastYear", undefined, now)).toEqual({
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    });
  });

  it("uses explicit dates for a custom report range", () => {
    expect(
      computeDateRange(
        "custom",
        { startDate: "2026-02-10", endDate: "2026-04-20" },
        now,
      ),
    ).toEqual({ startDate: "2026-02-10", endDate: "2026-04-20" });
  });

  it("fills missing custom dates from the default rolling range", () => {
    expect(computeDateRange("custom", { startDate: "2026-04-05" }, now)).toEqual({
      startDate: "2026-04-05",
      endDate: "2026-05-31",
    });
    expect(computeDateRange("custom", { endDate: "2026-04-05" }, now)).toEqual({
      startDate: "2026-03-01",
      endDate: "2026-04-05",
    });
  });

  it("keeps preset ranges independent from custom dates", () => {
    expect(
      computeDateRange(
        "thisMonth",
        { startDate: "2026-02-10", endDate: "2026-04-20" },
        now,
      ),
    ).toEqual({ startDate: "2026-05-01", endDate: "2026-05-31" });
  });
});
