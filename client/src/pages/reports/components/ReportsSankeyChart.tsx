import { useState } from 'react'
import { SankeyLink } from './SankeyLink'
import { SankeyNode } from './SankeyNode'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SankeyData {
  totalIncome: number
  totalSpending: number
  net: number
  incomeSources: Array<{ id: string; name: string; icon: string; amount: number }>
  buckets: Array<{
    name: string // 'Needs' | 'Wants' | 'Savings' | 'Uncategorized'
    amount: number
    categories: Array<{ id: string; name: string; icon: string; amount: number }>
  }>
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SVG_WIDTH = 900
const SVG_HEIGHT = 500
const LEFT_OVERFLOW = 130   // space for income-source labels on the left
const V_PADDING = 20
const AVAILABLE_HEIGHT = SVG_HEIGHT - V_PADDING * 2
const NODE_WIDTH = 80
const GAP = 8

// Column left-edge X positions (all shifted right so left-side labels fit)
const COL_SOURCES_X = 0
const COL_TOTAL_X = 200
const COL_BUCKETS_X = 420
const COL_CATS_X = 640

const BUCKET_COLORS: Record<string, string> = {
  Needs: '#3b82f6',
  Wants: '#f59e0b',
  Savings: '#14b8a6',
  Uncategorized: '#94a3b8',
}

const INCOME_COLOR = '#22c55e'

const fmtCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    Math.abs(amount),
  )

const fmtPct = (amount: number, total: number) =>
  total > 0 ? `${Math.round((amount / total) * 100)}%` : '0%'

// ─── Layout helpers ───────────────────────────────────────────────────────────

interface LayoutNode {
  key: string
  label: string
  amount: number
  color: string
  x: number
  y: number
  width: number
  height: number
  labelSide: 'left' | 'right'
}

function layoutColumn(
  items: Array<{ key: string; label: string; amount: number; color: string }>,
  colX: number,
  columnTotal: number,
  labelSide: 'left' | 'right',
): LayoutNode[] {
  if (items.length === 0) return []

  const totalGap = GAP * (items.length - 1)
  const usableHeight = AVAILABLE_HEIGHT - totalGap
  const nodes: LayoutNode[] = []
  let stackHeight = 0

  for (const item of items) {
    const rawH = columnTotal > 0 ? (item.amount / columnTotal) * usableHeight : 0
    const h = Math.max(rawH, 4)
    nodes.push({
      key: item.key,
      label: item.label,
      amount: item.amount,
      color: item.color,
      x: colX,
      y: 0, // set below after centering
      width: NODE_WIDTH,
      height: h,
      labelSide,
    })
    stackHeight += h
  }
  stackHeight += totalGap

  // Center the stack vertically
  const startY = V_PADDING + (AVAILABLE_HEIGHT - stackHeight) / 2
  let cursor = startY
  for (const node of nodes) {
    node.y = cursor
    cursor += node.height + GAP
  }

  return nodes
}

// ─── Tooltip state ────────────────────────────────────────────────────────────

interface TooltipInfo {
  label: string
  amount: number
  pct: string
  x: number
  y: number
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ReportsSankeyChartProps {
  data: SankeyData
}

export function ReportsSankeyChart({ data }: ReportsSankeyChartProps) {
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null)

  // ── Responsive guard ──────────────────────────────────────────────────────
  // Rendered at small screens via CSS — SVG itself uses viewBox so it scales,
  // but for very small displays we show a message instead.

  if (data.totalIncome === 0) {
    return (
      <div className="flex items-center justify-center h-56 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        No income data for this period
      </div>
    )
  }

  const { totalIncome, incomeSources, buckets } = data

  // ── Build layout nodes ────────────────────────────────────────────────────

  // Column 1: income sources
  const sourceNodes = layoutColumn(
    incomeSources.map((s) => ({ key: s.id, label: s.name, amount: s.amount, color: INCOME_COLOR })),
    COL_SOURCES_X,
    totalIncome,
    'left',
  )

  // Column 2: single "Total Income" node
  const totalNode = layoutColumn(
    [{ key: '__total__', label: 'Total Income', amount: totalIncome, color: INCOME_COLOR }],
    COL_TOTAL_X,
    totalIncome,
    'right',
  )

  // Column 3: buckets
  const bucketTotal = buckets.reduce((s, b) => s + b.amount, 0)
  const bucketNodes = layoutColumn(
    buckets.map((b) => ({
      key: b.name,
      label: b.name,
      amount: b.amount,
      color: BUCKET_COLORS[b.name] ?? '#94a3b8',
    })),
    COL_BUCKETS_X,
    bucketTotal,
    'right',
  )

  // Column 4: categories (all buckets flattened, positioned per-bucket)
  // We need per-bucket category sub-stacks that align with their bucket node.
  interface CatNode extends LayoutNode {
    bucketName: string
  }
  const catNodes: CatNode[] = []

  for (let bi = 0; bi < buckets.length; bi++) {
    const bucket = buckets[bi]
    const bucketNode = bucketNodes[bi]
    if (!bucketNode || bucket.categories.length === 0) continue

    const color = BUCKET_COLORS[bucket.name] ?? '#94a3b8'
    const catTotal = bucket.categories.reduce((s, c) => s + c.amount, 0)
    const totalGap = GAP * (bucket.categories.length - 1)
    const usableH = bucketNode.height - totalGap

    let cursor = bucketNode.y
    for (const cat of bucket.categories) {
      const rawH = catTotal > 0 ? (cat.amount / catTotal) * usableH : 0
      const h = Math.max(rawH, 4)
      catNodes.push({
        key: cat.id,
        label: cat.name,
        amount: cat.amount,
        color,
        x: COL_CATS_X,
        y: cursor,
        width: NODE_WIDTH,
        height: h,
        labelSide: 'right',
        bucketName: bucket.name,
      })
      cursor += h + GAP
    }
  }

  // ── Build links ────────────────────────────────────────────────────────────
  // Track "fill cursor" — how far down the target node we've consumed.

  interface LinkSpec {
    key: string
    sourceX: number
    sourceY: number
    sourceHeight: number
    targetX: number
    targetY: number
    targetHeight: number
    color: string
    label: string
    amount: number
  }

  const links: LinkSpec[] = []

  // Income sources → Total Income node
  const totalNodeRef = totalNode[0]
  if (totalNodeRef) {
    let targetCursor = totalNodeRef.y
    for (const src of sourceNodes) {
      const h = src.height
      links.push({
        key: `src-${src.key}`,
        sourceX: src.x + NODE_WIDTH,
        sourceY: src.y,
        sourceHeight: h,
        targetX: totalNodeRef.x,
        targetY: targetCursor,
        targetHeight: h,
        color: INCOME_COLOR,
        label: src.label,
        amount: src.amount,
      })
      targetCursor += h + GAP
    }
  }

  // Total Income → Buckets
  if (totalNodeRef) {
    let sourceCursor = totalNodeRef.y
    for (let bi = 0; bi < buckets.length; bi++) {
      const bucket = buckets[bi]
      const bucketNode = bucketNodes[bi]
      if (!bucketNode) continue
      const color = BUCKET_COLORS[bucket.name] ?? '#94a3b8'
      const h = bucketNode.height
      links.push({
        key: `bucket-${bucket.name}`,
        sourceX: totalNodeRef.x + NODE_WIDTH,
        sourceY: sourceCursor,
        sourceHeight: h,
        targetX: bucketNode.x,
        targetY: bucketNode.y,
        targetHeight: h,
        color,
        label: bucket.name,
        amount: bucket.amount,
      })
      sourceCursor += h + GAP
    }
  }

  // Buckets → Categories
  for (let bi = 0; bi < buckets.length; bi++) {
    const bucket = buckets[bi]
    const bucketNode = bucketNodes[bi]
    if (!bucketNode) continue
    const color = BUCKET_COLORS[bucket.name] ?? '#94a3b8'
    const bucketCats = catNodes.filter((c) => c.bucketName === bucket.name)

    let sourceCursor = bucketNode.y
    for (const cat of bucketCats) {
      links.push({
        key: `cat-${cat.key}`,
        sourceX: bucketNode.x + NODE_WIDTH,
        sourceY: sourceCursor,
        sourceHeight: cat.height,
        targetX: cat.x,
        targetY: cat.y,
        targetHeight: cat.height,
        color,
        label: cat.label,
        amount: cat.amount,
      })
      sourceCursor += cat.height + GAP
    }
  }

  // ── Tooltip handlers ───────────────────────────────────────────────────────
  function showTooltip(label: string, amount: number, svgX: number, svgY: number) {
    setTooltip({
      label,
      amount,
      pct: fmtPct(amount, totalIncome),
      // We'll use SVG-relative percentages; convert roughly for overlay
      x: (svgX / SVG_WIDTH) * 100,
      y: (svgY / SVG_HEIGHT) * 100,
    })
  }

  return (
    <div className="relative w-full" style={{ overflow: 'visible' }}>
      {/* Small screen guard */}
      <div className="flex items-center justify-center h-40 text-sm md:hidden" style={{ color: 'var(--color-text-muted)' }}>
        View on a larger screen to see the money flow diagram.
      </div>

      {/* SVG chart — hidden on small screens */}
      <div className="hidden md:block relative" style={{ overflow: 'visible' }}>
        <svg
          viewBox={`-${LEFT_OVERFLOW} 0 ${SVG_WIDTH + LEFT_OVERFLOW} ${SVG_HEIGHT}`}
          width="100%"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {/* Links — rendered back to front */}
          {links.map((lk) => (
            <SankeyLink
              key={lk.key}
              sourceX={lk.sourceX}
              sourceY={lk.sourceY}
              sourceHeight={lk.sourceHeight}
              targetX={lk.targetX}
              targetY={lk.targetY}
              targetHeight={lk.targetHeight}
              color={lk.color}
              opacity={0.35}
              onMouseEnter={() => showTooltip(lk.label, lk.amount, (lk.sourceX + lk.targetX) / 2, (lk.sourceY + lk.targetY) / 2)}
              onMouseLeave={() => setTooltip(null)}
            />
          ))}

          {/* Income source nodes */}
          {sourceNodes.map((n) => (
            <SankeyNode
              key={n.key}
              x={n.x}
              y={n.y}
              width={n.width}
              height={n.height}
              label={n.label}
              amount={n.amount}
              color={n.color}
              labelSide={n.labelSide}
              onMouseEnter={() => showTooltip(n.label, n.amount, n.x + NODE_WIDTH / 2, n.y + n.height / 2)}
              onMouseLeave={() => setTooltip(null)}
            />
          ))}

          {/* Total income node */}
          {totalNode.map((n) => (
            <SankeyNode
              key={n.key}
              x={n.x}
              y={n.y}
              width={n.width}
              height={n.height}
              label={n.label}
              amount={n.amount}
              color={n.color}
              labelSide={n.labelSide}
              onMouseEnter={() => showTooltip(n.label, n.amount, n.x + NODE_WIDTH / 2, n.y + n.height / 2)}
              onMouseLeave={() => setTooltip(null)}
            />
          ))}

          {/* Bucket nodes */}
          {bucketNodes.map((n) => (
            <SankeyNode
              key={n.key}
              x={n.x}
              y={n.y}
              width={n.width}
              height={n.height}
              label={n.label}
              amount={n.amount}
              color={n.color}
              labelSide={n.labelSide}
              onMouseEnter={() => showTooltip(n.label, n.amount, n.x + NODE_WIDTH / 2, n.y + n.height / 2)}
              onMouseLeave={() => setTooltip(null)}
            />
          ))}

          {/* Category nodes */}
          {catNodes.map((n) => (
            <SankeyNode
              key={n.key}
              x={n.x}
              y={n.y}
              width={n.width}
              height={n.height}
              label={n.label}
              amount={n.amount}
              color={n.color}
              labelSide={n.labelSide}
              onMouseEnter={() => showTooltip(n.label, n.amount, n.x + NODE_WIDTH / 2, n.y + n.height / 2)}
              onMouseLeave={() => setTooltip(null)}
            />
          ))}
        </svg>

        {/* Floating tooltip */}
        {tooltip && (
          <div
            style={{
              position: 'absolute',
              left: `${tooltip.x}%`,
              top: `${tooltip.y}%`,
              transform: 'translate(-50%, -120%)',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '0.5rem 0.75rem',
              fontSize: '0.8125rem',
              color: 'var(--color-text)',
              pointerEvents: 'none',
              zIndex: 10,
              whiteSpace: 'nowrap',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <div style={{ fontWeight: 600 }}>{tooltip.label}</div>
            <div style={{ color: 'var(--color-text-secondary)' }}>{fmtCurrency(tooltip.amount)}</div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{tooltip.pct} of income</div>
          </div>
        )}
      </div>
    </div>
  )
}
