import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";
import type {
  CartesianChartSpec,
  ChartRow,
  ChartSpec,
  HeatmapChartSpec,
  PartitionChartSpec,
  SankeyChartSpec,
} from "../standardReportClient";
import { formatTick, formatValue, seriesColor, sliceColor } from "./chartTheme";
import { sankeySpecToData } from "./sankeySpecAdapter";
import { ReportsSankeyChart } from "./ReportsSankeyChart";
import { chartKeyIsFilterable } from "../chartSelectionToFilter";

export interface ChartSelection {
  chartKey: string;
  /** The `id` field of the clicked row when the server supplied one. */
  id?: string;
  /** The display label of the clicked datum. */
  label: string;
  /** The x-axis value for cartesian charts (e.g. a period key). */
  x?: string;
}

function EmptyChart() {
  return <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>No chart data for this range.</p>;
}

/** Recharts' click payload types are loosely typed (often `any`) upstream; extract defensively. */
function rowFromClickPayload(data: unknown): ChartRow | undefined {
  if (data && typeof data === "object" && "payload" in data) {
    const payload = (data as { payload?: unknown }).payload;
    if (payload && typeof payload === "object") return payload as ChartRow;
  }
  return undefined;
}

function emitSelection(
  onSelect: ((selection: ChartSelection) => void) | undefined,
  chartKey: string,
  label: string,
  row: ChartRow | undefined,
  xKey?: string,
) {
  if (!onSelect || !row) return;
  const id = typeof row.id === "string" ? row.id : undefined;
  const x = xKey && typeof row[xKey] === "string" ? (row[xKey] as string) : undefined;
  onSelect({ chartKey: chartKey, id, label, x });
}

function renderCartesian(spec: CartesianChartSpec, onSelect?: (selection: ChartSelection) => void) {
  if (spec.data.length === 0) return <EmptyChart />;

  const showLegend = spec.series.length > 1;
  const axisFormat = spec.series[0].format;

  const axesAndDecorations = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
      <XAxis dataKey={spec.x.key} />
      <YAxis tickFormatter={(value) => formatTick(value, axisFormat)} />
      <Tooltip
        formatter={(value, _name, item) => {
          const series = spec.series.find((candidate) => candidate.key === item?.dataKey) ?? spec.series[0];
          const numericOrString = typeof value === "number" || typeof value === "string" ? value : null;
          return formatValue(numericOrString, series.format);
        }}
      />
      {showLegend && <Legend />}
      {spec.reference && (
        <ReferenceLine y={spec.reference.value} label={spec.reference.label} stroke="var(--color-border-strong)" />
      )}
    </>
  );

  switch (spec.kind) {
    case "line":
      return (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={spec.data}>
            {axesAndDecorations}
            {spec.series.map((series, index) => (
              <Line
                key={series.key}
                type="monotone"
                dataKey={series.key}
                name={series.label}
                stroke={seriesColor(series.role, index)}
                dot={false}
                onClick={(data) => emitSelection(onSelect, spec.key, series.label, rowFromClickPayload(data), spec.x.key)}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );
    case "area":
      return (
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={spec.data}>
            {axesAndDecorations}
            {spec.series.map((series, index) => (
              <Area
                key={series.key}
                type="monotone"
                dataKey={series.key}
                name={series.label}
                stroke={seriesColor(series.role, index)}
                fill={seriesColor(series.role, index)}
                fillOpacity={0.15}
                onClick={(data) => emitSelection(onSelect, spec.key, series.label, rowFromClickPayload(data), spec.x.key)}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      );
    case "bar":
    case "groupedBar":
      return (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={spec.data}>
            {axesAndDecorations}
            {spec.series.map((series, index) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                name={series.label}
                fill={seriesColor(series.role, index)}
                onClick={(data) => emitSelection(onSelect, spec.key, series.label, rowFromClickPayload(data), spec.x.key)}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    case "stackedBar":
      return (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={spec.data}>
            {axesAndDecorations}
            {spec.series.map((series, index) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                name={series.label}
                stackId={series.stack}
                fill={seriesColor(series.role, index)}
                onClick={(data) => emitSelection(onSelect, spec.key, series.label, rowFromClickPayload(data), spec.x.key)}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    case "waterfall": {
      const series = spec.series[0];
      return (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={spec.data}>
            {axesAndDecorations}
            <Bar
              dataKey={series.key}
              name={series.label}
              onClick={(data) => emitSelection(onSelect, spec.key, series.label, rowFromClickPayload(data), spec.x.key)}
            >
              {spec.data.map((row, index) => {
                const value = Number(row[series.key]);
                return <Cell key={index} fill={value >= 0 ? "var(--color-success)" : "var(--color-danger)"} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }
  }
}

function renderPartition(spec: PartitionChartSpec, onSelect?: (selection: ChartSelection) => void) {
  if (spec.data.length === 0) return <EmptyChart />;

  const data = spec.data.map((row) => ({ ...row, [spec.valueKey]: Number(row[spec.valueKey]) }));

  if (spec.kind === "treemap") {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <Treemap data={data} dataKey={spec.valueKey} nameKey={spec.nameKey} stroke="var(--color-surface)" />
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Tooltip formatter={(value) => formatValue(typeof value === "number" || typeof value === "string" ? value : null, spec.format)} />
        <Pie
          data={data}
          dataKey={spec.valueKey}
          nameKey={spec.nameKey}
          innerRadius={spec.kind === "donut" ? "55%" : 0}
          outerRadius="80%"
          onClick={(entry: unknown, index: number) => {
            const row = data[index];
            const label = row ? String(row[spec.nameKey] ?? "") : "";
            emitSelection(onSelect, spec.key, label, row);
          }}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={sliceColor(index)} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

function renderHeatmap(spec: HeatmapChartSpec) {
  if (spec.data.length === 0) return <EmptyChart />;

  const values = spec.data.map((row) => Number(row[spec.valueKey]));
  const max = Math.max(...values, 0) || 1;
  const columnCount = new Set(spec.data.map((row) => String(row[spec.xKey]))).size || 1;

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columnCount}, 1fr)`, gap: 2 }}>
      {spec.data.map((row, index) => {
        const value = Number(row[spec.valueKey]);
        const opacity = max > 0 ? Math.max(value, 0) / max : 0;
        const label = formatValue(row[spec.valueKey], spec.format);
        return (
          <div
            key={index}
            title={label}
            style={{
              backgroundColor: "var(--color-accent)",
              opacity,
              padding: "0.5rem",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.75rem",
              textAlign: "center",
              color: "var(--color-text)",
            }}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
}

function renderSankey(spec: SankeyChartSpec) {
  if (spec.links.length === 0) return <EmptyChart />;
  return <ReportsSankeyChart data={sankeySpecToData(spec)} />;
}

/** Kinds whose renderers wire a Recharts click handler. Treemap, heatmap and sankey do not. */
const SELECTABLE_KINDS = new Set(["line", "area", "bar", "stackedBar", "groupedBar", "waterfall", "pie", "donut"]);

/** What a click on this chart narrows by, or `null` when the chart is not clickable. */
function selectionAffordance(spec: ChartSpec, onSelect?: (selection: ChartSelection) => void): string | null {
  if (!onSelect || !SELECTABLE_KINDS.has(spec.kind) || !chartKeyIsFilterable(spec.key)) return null;
  return "x" in spec ? spec.x.label : spec.title;
}

export function ReportChart({ spec, onSelect }: { spec: ChartSpec; onSelect?: (selection: ChartSelection) => void }) {
  const affordance = selectionAffordance(spec, onSelect);
  const chart = renderChart(spec, onSelect);

  if (!affordance) return chart;

  return (
    <div style={{ cursor: "pointer" }} aria-label={`Click to filter by ${affordance}`}>
      {chart}
    </div>
  );
}

function renderChart(spec: ChartSpec, onSelect?: (selection: ChartSelection) => void) {
  switch (spec.kind) {
    case "line":
    case "area":
    case "bar":
    case "stackedBar":
    case "groupedBar":
    case "waterfall":
      return renderCartesian(spec, onSelect);
    case "pie":
    case "donut":
    case "treemap":
      return renderPartition(spec, onSelect);
    case "heatmap":
      return renderHeatmap(spec);
    case "sankey":
      return renderSankey(spec);
    default: {
      // TODO: exhaustiveness guard — a future ChartSpec kind must add a branch above (plan 002 maintenance note).
      const _exhaustive: never = spec;
      return null;
    }
  }
}
