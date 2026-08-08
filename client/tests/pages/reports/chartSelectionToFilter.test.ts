import { describe, expect, it } from "vitest";
import { chartSelectionToFilter, periodKeyToRange } from "@/pages/reports/chartSelectionToFilter";
import { DEFAULT_STANDARD_FILTERS, type StandardReportFilters } from "@/pages/reports/standardReportClient";

function baseFilters(overrides: Partial<StandardReportFilters> = {}): StandardReportFilters {
  return {
    ...DEFAULT_STANDARD_FILTERS,
    tab: "overview",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    ...overrides,
  };
}

describe("chartSelectionToFilter", () => {
  it("adds a clicked category id to categoryIds", () => {
    const next = chartSelectionToFilter(baseFilters(), {
      chartKey: "spendingByCategory",
      id: "cat-1",
      label: "Groceries",
    });

    expect(next?.categoryIds).toEqual(["cat-1"]);
  });

  it("removes the id when the same slice is clicked twice", () => {
    const selection = { chartKey: "spendingByCategory", id: "cat-1", label: "Groceries" };
    const once = chartSelectionToFilter(baseFilters(), selection);
    const twice = chartSelectionToFilter(once!, selection);

    expect(twice?.categoryIds).toEqual([]);
  });

  it("returns null for a synthetic id", () => {
    const next = chartSelectionToFilter(baseFilters(), {
      chartKey: "spendingByCategory",
      id: "__uncategorized__",
      label: "Uncategorized",
    });

    expect(next).toBeNull();
  });

  it("returns null for an unknown chart key", () => {
    const next = chartSelectionToFilter(baseFilters(), { chartKey: "netWorthTrend", id: "x", label: "Net worth" });

    expect(next).toBeNull();
  });

  it("narrows the date range and flips the preset when a period is clicked", () => {
    const next = chartSelectionToFilter(baseFilters({ groupBy: "month", datePreset: "thisYear" }), {
      chartKey: "incomeExpenseTrend",
      label: "Income",
      x: "2026-03",
    });

    expect(next).toMatchObject({ startDate: "2026-03-01", endDate: "2026-03-31", datePreset: "custom" });
  });

  it("does not mutate the filters it was given", () => {
    const filters = baseFilters();
    const next = chartSelectionToFilter(filters, { chartKey: "topMerchants", id: "m-1", label: "Store" });

    expect(next).not.toBe(filters);
    expect(filters.merchantIds).toEqual([]);
    expect(next?.merchantIds).toEqual(["m-1"]);
  });
});

describe("periodKeyToRange", () => {
  it("expands a quarter key", () => {
    expect(periodKeyToRange("2026-Q1", "quarter")).toEqual({ startDate: "2026-01-01", endDate: "2026-03-31" });
  });

  it("expands a year key", () => {
    expect(periodKeyToRange("2026", "year")).toEqual({ startDate: "2026-01-01", endDate: "2026-12-31" });
  });

  it("returns null for an unparseable key", () => {
    expect(periodKeyToRange("garbage", "month")).toBeNull();
  });

  it("mirrors the server's non-ISO week numbering", () => {
    // The server counts whole 7-day blocks from January 1, so week 1 is Jan 1-7.
    expect(periodKeyToRange("2026-W01", "week")).toEqual({ startDate: "2026-01-01", endDate: "2026-01-07" });
    expect(periodKeyToRange("2026-W11", "week")).toEqual({ startDate: "2026-03-12", endDate: "2026-03-18" });
  });

  it("clamps the final week to the end of the year", () => {
    expect(periodKeyToRange("2026-W53", "week")?.endDate).toBe("2026-12-31");
  });

  it("expands a day key to itself", () => {
    expect(periodKeyToRange("2026-03-14", "day")).toEqual({ startDate: "2026-03-14", endDate: "2026-03-14" });
  });
});
