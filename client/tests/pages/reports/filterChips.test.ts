import { describe, expect, it } from "vitest";
import { activeFilterChips, clearAllFilters, clearFilter } from "../../../src/pages/reports/filterChips";
import {
  DEFAULT_STANDARD_FILTERS,
  type StandardReportFilters,
  type StandardReportOptions,
} from "../../../src/pages/reports/standardReportClient";

const baseFilters: StandardReportFilters = {
  ...DEFAULT_STANDARD_FILTERS,
  tab: "category",
  startDate: "2026-01-01",
  endDate: "2026-01-31",
};

const options = {
  reportTypes: [],
  groupBy: [],
  comparisonModes: [],
  accounts: [
    { id: "acct-1", name: "Chequing", type: "checking", currency: "CAD" },
    { id: "acct-2", name: "Savings", type: "savings", currency: "CAD" },
  ],
  categories: [],
  categoryGroups: [],
  budgets: [],
  tags: [],
  merchants: [],
} as unknown as StandardReportOptions;

describe("report filter chips", () => {
  it("produces no chips for default filters", () => {
    expect(activeFilterChips(baseFilters, options)).toEqual([]);
  });

  it("summarises identity filters by count and resolves a single selection by name", () => {
    const two = activeFilterChips({ ...baseFilters, accountIds: ["acct-1", "acct-2"] }, options);

    expect(two).toHaveLength(1);
    expect(two[0]).toMatchObject({ id: "accountIds", label: "Accounts", value: "2 selected" });

    const one = activeFilterChips({ ...baseFilters, accountIds: ["acct-1"] }, options);

    expect(one[0]).toMatchObject({ id: "accountIds", value: "Chequing" });

    // Options not loaded yet: fall back to the count rather than showing a raw id.
    const unresolved = activeFilterChips({ ...baseFilters, accountIds: ["acct-1"] }, undefined);

    expect(unresolved[0]).toMatchObject({ id: "accountIds", value: "1 selected" });
  });

  it("collapses both amount bounds into one chip that clears together", () => {
    const filters = { ...baseFilters, minAmount: 100, maxAmount: 500 };
    const chips = activeFilterChips(filters, options);

    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ id: "amount", label: "Amount", value: "$100 – $500" });

    const cleared = clearFilter(filters, "amount");

    expect(cleared.minAmount).toBeUndefined();
    expect(cleared.maxAmount).toBeUndefined();
    expect(activeFilterChips(cleared, options)).toEqual([]);

    expect(activeFilterChips({ ...baseFilters, minAmount: 100 }, options)[0].value).toBe("≥ $100");
    expect(activeFilterChips({ ...baseFilters, maxAmount: 500 }, options)[0].value).toBe("≤ $500");
  });

  it("clears everything except tab, date range and groupBy", () => {
    const filters: StandardReportFilters = {
      ...baseFilters,
      groupBy: "quarter",
      accountIds: ["acct-1"],
      categoryIds: ["cat-1"],
      includeSplits: false,
      onlyUncategorized: true,
      reconciledState: "reconciled",
      comparisonMode: "previous_year",
      limit: 100,
      minAmount: 100,
      maxAmount: 500,
      searchText: "insurance",
      sortBy: "amount",
      currencyCode: "CAD",
    };

    const cleared = clearAllFilters(filters);

    expect(cleared).toMatchObject({
      tab: "category",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      groupBy: "quarter",
    });
    expect(activeFilterChips(cleared, options)).toEqual([]);
  });

  it("chips a boolean only when it differs from its default", () => {
    const chips = activeFilterChips({ ...baseFilters, includeSplits: false }, options);

    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ id: "includeSplits", label: "Splits", value: "Excluded" });

    expect(activeFilterChips({ ...baseFilters, includeSplits: true }, options)).toEqual([]);

    // The others default to false, so they chip when switched on.
    expect(activeFilterChips({ ...baseFilters, includeHidden: true }, options)[0]).toMatchObject({
      id: "includeHidden",
      value: "Included",
    });
  });

  it("resets a single filter to its default by chip id", () => {
    const filters = { ...baseFilters, categoryIds: ["cat-1", "cat-2"], searchText: "insurance" };

    expect(clearFilter(filters, "categoryIds").categoryIds).toEqual([]);
    expect(clearFilter(filters, "searchText").searchText).toBeUndefined();
    // Unknown ids are inert rather than destructive.
    expect(clearFilter(filters, "nope")).toEqual(filters);
  });
});
