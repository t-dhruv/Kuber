import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportChart } from "../../../../src/pages/reports/components/ReportChart";
import type {
  HeatmapChartSpec,
  PartitionChartSpec,
  SankeyChartSpec,
} from "../../../../src/pages/reports/standardReportClient";
import type { CartesianChartSpec } from "../../../../src/pages/reports/standardReportClient";

describe("ReportChart", () => {
  it("renders a donut spec without throwing", () => {
    const spec: PartitionChartSpec = {
      kind: "donut",
      key: "spending-by-category",
      title: "Spending by category",
      nameKey: "name",
      valueKey: "amount",
      format: "currency",
      data: [
        { name: "Groceries", amount: "120.50" },
        { name: "Rent", amount: "1500.00" },
      ],
    };

    const html = renderToStaticMarkup(<ReportChart spec={spec} />);

    expect(html).toContain("recharts-responsive-container");
  });

  it("shows the empty-state copy for an empty cartesian spec", () => {
    const spec: CartesianChartSpec = {
      kind: "line",
      key: "net-worth-trend",
      title: "Net worth trend",
      x: { key: "period", label: "Period", format: "date" },
      series: [{ key: "value", label: "Net worth", format: "currency", role: "net" }],
      data: [],
    };

    const html = renderToStaticMarkup(<ReportChart spec={spec} />);

    expect(html).toContain("No chart data for this range.");
  });

  it("renders one heatmap cell per datum with the formatted value visible", () => {
    const spec: HeatmapChartSpec = {
      kind: "heatmap",
      key: "spending-heatmap",
      title: "Spending heatmap",
      xKey: "day",
      yKey: "week",
      valueKey: "amount",
      format: "currency",
      data: [
        { day: "Mon", week: "1", amount: 100 },
        { day: "Tue", week: "1", amount: 250 },
        { day: "Wed", week: "1", amount: 0 },
      ],
    };

    const html = renderToStaticMarkup(<ReportChart spec={spec} />);

    expect(html).toContain("$100.00");
    expect(html).toContain("$250.00");
    expect(html).toContain("$0.00");
  });

  it("renders the adapted sankey chart with an income-source label", () => {
    const spec: SankeyChartSpec = {
      kind: "sankey",
      key: "cash-flow-sankey",
      title: "Cash flow",
      format: "currency",
      nodes: [
        { id: "salary", label: "Salary", column: 0, role: "income" },
        { id: "total", label: "Total Income", column: 1, role: "total" },
        { id: "needs", label: "Needs", column: 2, role: "bucket" },
      ],
      links: [
        { source: "salary", target: "total", value: 5000 },
        { source: "total", target: "needs", value: 3000 },
      ],
    };

    const html = renderToStaticMarkup(<ReportChart spec={spec} />);

    expect(html).toContain("Salary");
  });
});
