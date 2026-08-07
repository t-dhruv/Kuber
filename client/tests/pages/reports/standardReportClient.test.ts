import { describe, expect, it } from "vitest";
import {
  DEFAULT_STANDARD_FILTERS,
  buildStandardReportParams,
  mapReportTabToType,
  normalizeSavedReportFilters,
  serializeReportFilters,
  standardExportPath,
  type StandardReportFilters,
} from "../../../src/pages/reports/standardReportClient";

describe("standard report client helpers", () => {
  it("maps the existing report tabs to standardized report types", () => {
    expect(mapReportTabToType("overview")).toBe("overview");
    expect(mapReportTabToType("cashflow")).toBe("cash_flow");
    expect(mapReportTabToType("spending")).toBe("category");
    expect(mapReportTabToType("income")).toBe("income_vs_expense");
    expect(mapReportTabToType("variance")).toBe("budget");
    expect(mapReportTabToType("networth")).toBe("net_worth");
    expect(mapReportTabToType("investmentperformance")).toBe("investment");
  });

  it("maps the absorbed wealth tabs to their standardized report types", () => {
    expect(mapReportTabToType("assetsliabilities")).toBe("net_worth");
    expect(mapReportTabToType("allocationdrift")).toBe("allocation");
    expect(mapReportTabToType("contributionroom")).toBe("contribution_room");
    expect(mapReportTabToType("dividendforecast")).toBe("dividend_forecast");
    expect(mapReportTabToType("retirementsimulation")).toBe("retirement");
  });

  it("maps the absorbed wealth report types back to their tabs", () => {
    const roundTrip = (reportType: string) =>
      normalizeSavedReportFilters({ reportType, startDate: "2026-01-01", endDate: "2026-01-31" }).tab;

    expect(roundTrip("allocation")).toBe("allocationdrift");
    expect(roundTrip("contribution_room")).toBe("contributionroom");
    expect(roundTrip("dividend_forecast")).toBe("dividendforecast");
    expect(roundTrip("retirement")).toBe("retirementsimulation");
    // assetsliabilities folds into net_worth, so net_worth maps back to networth.
    expect(roundTrip("net_worth")).toBe("networth");
  });

  it("builds stable standard report query params from filters", () => {
    const filters: StandardReportFilters = {
      ...DEFAULT_STANDARD_FILTERS,
      tab: "spending",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      groupBy: "month",
      accountIds: ["acct-1", "acct-2"],
      categoryIds: ["cat-food"],
      tagIds: [],
      merchantIds: ["merchant-market"],
      budgetIds: [],
      includePending: true,
      includeTransfers: false,
      currencyCode: "cad",
    };

    expect(Object.fromEntries(buildStandardReportParams(filters))).toEqual({
      reportType: "category",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      groupBy: "month",
      accountIds: "acct-1,acct-2",
      categoryIds: "cat-food",
      merchantIds: "merchant-market",
      includePending: "true",
      includeTransfers: "false",
      includeHidden: "false",
      includeSplits: "true",
      includeExcludedFromReports: "false",
      comparisonMode: "none",
      sortDirection: "desc",
      limit: "25",
      onlyUncategorized: "false",
      reconciledState: "any",
      currencyCode: "CAD",
    });
  });

  it("normalizes legacy and standard saved report filters for the UI", () => {
    expect(
      normalizeSavedReportFilters({
        tab: "cashflow",
        datePreset: "lastMonth",
        startDate: "2026-04-01",
        endDate: "2026-04-30",
        excludeAccountIds: ["legacy-excluded-account"],
      }),
    ).toMatchObject({
      tab: "cashflow",
      datePreset: "lastMonth",
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      accountIds: [],
    });

    expect(
      normalizeSavedReportFilters({
        reportType: "merchant",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        merchantIds: ["merchant-market"],
      }),
    ).toMatchObject({
      tab: "merchant",
      merchantIds: ["merchant-market"],
    });
  });

  it("uses standardized export paths", () => {
    const filters: StandardReportFilters = {
      ...DEFAULT_STANDARD_FILTERS,
      tab: "merchant",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    };

    expect(standardExportPath("csv", filters, "merchantTotals")).toBe(
      "/reports/standard/export/csv?reportType=merchant&startDate=2026-01-01&endDate=2026-01-31&groupBy=month&includePending=false&includeTransfers=false&includeHidden=false&includeSplits=true&includeExcludedFromReports=false&comparisonMode=none&sortDirection=desc&limit=25&onlyUncategorized=false&reconciledState=any&tableKey=merchantTotals",
    );
    expect(standardExportPath("json", filters)).toBe(
      "/reports/standard/export/json?reportType=merchant&startDate=2026-01-01&endDate=2026-01-31&groupBy=month&includePending=false&includeTransfers=false&includeHidden=false&includeSplits=true&includeExcludedFromReports=false&comparisonMode=none&sortDirection=desc&limit=25&onlyUncategorized=false&reconciledState=any",
    );
  });

  it("loads a saved report written before the filter rebuild with inert defaults", () => {
    const normalized = normalizeSavedReportFilters({
      reportType: "category",
      tab: "spending",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      groupBy: "month",
      accountIds: ["acct-1"],
      includePending: true,
      includeTransfers: false,
    });

    expect(normalized).toMatchObject({
      tab: "spending",
      accountIds: ["acct-1"],
      includePending: true,
      includeSplits: true,
      comparisonMode: "none",
      reconciledState: "any",
      onlyUncategorized: false,
      limit: 25,
      categoryGroupIds: [],
      transactionTypes: [],
      includeHidden: false,
      includeExcludedFromReports: false,
      sortDirection: "desc",
    });
    expect(normalized.minAmount).toBeUndefined();
    expect(normalized.maxAmount).toBeUndefined();
    expect(normalized.searchText).toBeUndefined();
    expect(normalized.sortBy).toBeUndefined();
  });

  it("round-trips every new filter field through serialize and normalize", () => {
    const filters: StandardReportFilters = {
      ...DEFAULT_STANDARD_FILTERS,
      tab: "category",
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      categoryGroupIds: ["group-1", "group-2"],
      transactionTypes: ["deposit", "withdrawal"],
      includeHidden: true,
      includeSplits: false,
      includeExcludedFromReports: true,
      comparisonMode: "previous_year",
      sortBy: "amount",
      sortDirection: "asc",
      limit: 100,
      minAmount: 100,
      maxAmount: 500,
      searchText: "insurance",
      onlyUncategorized: true,
      reconciledState: "unreconciled",
    };

    expect(normalizeSavedReportFilters(serializeReportFilters(filters))).toMatchObject({
      categoryGroupIds: ["group-1", "group-2"],
      transactionTypes: ["deposit", "withdrawal"],
      includeHidden: true,
      includeSplits: false,
      includeExcludedFromReports: true,
      comparisonMode: "previous_year",
      sortBy: "amount",
      sortDirection: "asc",
      limit: 100,
      minAmount: 100,
      maxAmount: 500,
      searchText: "insurance",
      onlyUncategorized: true,
      reconciledState: "unreconciled",
    });
  });

  it("omits the optional bounds and search params when unset and sends them when set", () => {
    const base: StandardReportFilters = {
      ...DEFAULT_STANDARD_FILTERS,
      tab: "category",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    };

    const unset = Object.fromEntries(buildStandardReportParams(base));

    expect(unset).not.toHaveProperty("minAmount");
    expect(unset).not.toHaveProperty("maxAmount");
    expect(unset).not.toHaveProperty("searchText");
    expect(unset).not.toHaveProperty("sortBy");

    const set = Object.fromEntries(
      buildStandardReportParams({
        ...base,
        minAmount: 0,
        maxAmount: 500,
        searchText: "insurance",
        sortBy: "amount",
      }),
    );

    // A bound of zero is a real filter and must survive, unlike an absent bound.
    expect(set.minAmount).toBe("0");
    expect(set.maxAmount).toBe("500");
    expect(set.searchText).toBe("insurance");
    expect(set.sortBy).toBe("amount");
  });

  it("falls back to a safe comparison mode when the stored payload is unrecognised", () => {
    expect(
      normalizeSavedReportFilters({ tab: "category", comparisonMode: "report_v2_mode" }),
    ).toMatchObject({ comparisonMode: "none" });

    expect(
      normalizeSavedReportFilters({ tab: "category", reconciledState: "maybe" }),
    ).toMatchObject({ reconciledState: "any" });
  });

  it("maps the absorbed benchmarks tab onto its standard report type", () => {
    expect(mapReportTabToType("benchmarks")).toBe("benchmarks");
  });

  it("still resolves the retired Legacy tab values", () => {
    expect(mapReportTabToType("savings")).toBe("cash_flow");
    expect(mapReportTabToType("spending")).toBe("category");
    expect(mapReportTabToType("variance")).toBe("budget");
  });
});
