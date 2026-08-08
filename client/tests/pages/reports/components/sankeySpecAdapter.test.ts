import { describe, expect, it } from "vitest";
import { sankeySpecToData } from "../../../../src/pages/reports/components/sankeySpecAdapter";
import type { SankeyChartSpec } from "../../../../src/pages/reports/standardReportClient";

function buildSpec(): SankeyChartSpec {
  return {
    kind: "sankey",
    key: "cash-flow-sankey",
    title: "Cash flow",
    format: "currency",
    nodes: [
      { id: "salary", label: "Salary", column: 0, role: "income" },
      { id: "freelance", label: "Freelance", column: 0, role: "income" },
      { id: "total", label: "Total Income", column: 1, role: "total" },
      { id: "needs", label: "Needs", column: 2, role: "bucket" },
      { id: "wants", label: "Wants", column: 2, role: "bucket" },
      { id: "rent", label: "Rent", column: 3, role: "category" },
      { id: "groceries", label: "Groceries", column: 3, role: "category" },
      { id: "dining", label: "Dining", column: 3, role: "category" },
    ],
    links: [
      { source: "salary", target: "total", value: 4000 },
      { source: "freelance", target: "total", value: 1000 },
      { source: "total", target: "needs", value: 3000 },
      { source: "total", target: "wants", value: 1000 },
      { source: "needs", target: "rent", value: 2000 },
      { source: "needs", target: "groceries", value: 1000 },
      { source: "wants", target: "dining", value: 1000 },
    ],
  };
}

describe("sankeySpecToData", () => {
  it("produces income sources, buckets and bucket amounts from inbound links", () => {
    const data = sankeySpecToData(buildSpec());

    expect(data.incomeSources).toHaveLength(2);
    expect(data.buckets).toHaveLength(2);

    const needs = data.buckets.find((bucket) => bucket.name === "Needs");
    const wants = data.buckets.find((bucket) => bucket.name === "Wants");
    expect(needs?.amount).toBe(3000);
    expect(wants?.amount).toBe(1000);
    expect(needs?.categories.reduce((sum, category) => sum + category.amount, 0)).toBe(3000);
  });

  it("computes net as totalIncome minus totalSpending", () => {
    const data = sankeySpecToData(buildSpec());

    expect(data.totalIncome).toBe(5000);
    expect(data.totalSpending).toBe(4000);
    expect(data.net).toBe(data.totalIncome - data.totalSpending);
  });

  it("produces zeros, not NaN, for a spec with zero links", () => {
    const spec: SankeyChartSpec = {
      kind: "sankey",
      key: "empty-sankey",
      title: "Empty",
      format: "currency",
      nodes: [
        { id: "salary", label: "Salary", column: 0, role: "income" },
        { id: "needs", label: "Needs", column: 2, role: "bucket" },
      ],
      links: [],
    };

    const data = sankeySpecToData(spec);

    expect(data.totalIncome).toBe(0);
    expect(data.totalSpending).toBe(0);
    expect(data.net).toBe(0);
    expect(Number.isNaN(data.totalIncome)).toBe(false);
    expect(Number.isNaN(data.net)).toBe(false);
  });
});
