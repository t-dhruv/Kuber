const fmtNodeCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.abs(amount))

interface SankeyNodeProps {
  x: number
  y: number
  width: number
  height: number
  label: string
  amount: number
  color: string
  labelSide: 'left' | 'right'
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

/**
 * Renders a single Sankey node: a colored rect with a label and amount
 * positioned outside the node on the specified side.
 */
export function SankeyNode({
  x,
  y,
  width,
  height,
  label,
  amount,
  color,
  labelSide,
  onMouseEnter,
  onMouseLeave,
}: SankeyNodeProps) {
  const safeHeight = Math.max(height, 4)
  const midY = y + safeHeight / 2
  const labelX = labelSide === 'left' ? x - 8 : x + width + 8
  const anchor = labelSide === 'left' ? 'end' : 'start'

  return (
    <g onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} style={{ cursor: 'default' }}>
      <rect
        x={x}
        y={y}
        width={width}
        height={safeHeight}
        fill={color}
        fillOpacity={0.9}
        rx={3}
        ry={3}
      />
      <text
        x={labelX}
        y={midY - 7}
        textAnchor={anchor}
        dominantBaseline="middle"
        style={{
          fontSize: '0.6875rem',
          fill: 'var(--color-text-secondary)',
          fontFamily: 'inherit',
          fontWeight: 600,
          pointerEvents: 'none',
        }}
      >
        {label}
      </text>
      <text
        x={labelX}
        y={midY + 7}
        textAnchor={anchor}
        dominantBaseline="middle"
        style={{
          fontSize: '0.625rem',
          fill: color,
          fontFamily: 'inherit',
          fontWeight: 500,
          pointerEvents: 'none',
        }}
      >
        {fmtNodeCurrency(amount)}
      </text>
    </g>
  )
}
