import type { SankeyChartSpec } from "../standardReportClient";
import type { SankeyData } from "./ReportsSankeyChart";

export function sankeySpecToData(spec: SankeyChartSpec): SankeyData {
  const nodeById = new Map(spec.nodes.map((node) => [node.id, node]));
  const inflow = new Map<string, number>();
  for (const link of spec.links) {
    inflow.set(link.target, (inflow.get(link.target) ?? 0) + link.value);
  }
  const amountFor = (id: string) =>
    inflow.get(id) ??
    spec.links.filter((link) => link.source === id).reduce((sum, link) => sum + link.value, 0);

  const incomeSources = spec.nodes
    .filter((node) => node.role === "income")
    .map((node) => ({ id: node.id, name: node.label, icon: "", amount: amountFor(node.id) }));

  const buckets = spec.nodes
    .filter((node) => node.role === "bucket")
    .map((bucket) => ({
      name: bucket.label,
      amount: amountFor(bucket.id),
      categories: spec.links
        .filter((link) => link.source === bucket.id)
        .map((link) => ({
          id: link.target,
          name: nodeById.get(link.target)?.label ?? link.target,
          icon: "",
          amount: link.value,
        })),
    }));

  const totalIncome = incomeSources.reduce((sum, item) => sum + item.amount, 0);
  const totalSpending = buckets.reduce((sum, item) => sum + item.amount, 0);

  return { totalIncome, totalSpending, net: totalIncome - totalSpending, incomeSources, buckets };
}
