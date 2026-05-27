import { describe, expect, it } from "vitest";
import {
  buildStandardReportParams,
  mapReportTabToType,
  normalizeSavedReportFilters,
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

  it("builds stable standard report query params from filters", () => {
    const filters: StandardReportFilters = {
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
      tab: "merchant",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      groupBy: "month",
      accountIds: [],
      categoryIds: [],
      tagIds: [],
      merchantIds: [],
      budgetIds: [],
      includePending: false,
      includeTransfers: false,
    };

    expect(standardExportPath("csv", filters, "merchantTotals")).toBe(
      "/reports/standard/export/csv?reportType=merchant&startDate=2026-01-01&endDate=2026-01-31&groupBy=month&includePending=false&includeTransfers=false&tableKey=merchantTotals",
    );
    expect(standardExportPath("json", filters)).toBe(
      "/reports/standard/export/json?reportType=merchant&startDate=2026-01-01&endDate=2026-01-31&groupBy=month&includePending=false&includeTransfers=false",
    );
  });
});
