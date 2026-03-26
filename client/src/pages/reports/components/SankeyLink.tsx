interface SankeyLinkProps {
  sourceX: number
  sourceY: number
  sourceHeight: number
  targetX: number
  targetY: number
  targetHeight: number
  color: string
  opacity?: number
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

/**
 * Renders a ribbon-style cubic bezier link between two Sankey nodes.
 * Uses two bezier curves (top edge + bottom edge) to form a filled shape.
 */
export function SankeyLink({
  sourceX,
  sourceY,
  sourceHeight,
  targetX,
  targetY,
  targetHeight,
  color,
  opacity = 0.4,
  onMouseEnter,
  onMouseLeave,
}: SankeyLinkProps) {
  const cx = (sourceX + targetX) / 2

  // Top edge: sourceY (top of source) → targetY (top of target)
  const topPath = `M ${sourceX},${sourceY} C ${cx},${sourceY} ${cx},${targetY} ${targetX},${targetY}`

  // Bottom edge: targetY+targetHeight → sourceY+sourceHeight (drawn in reverse)
  const bottomPath = `L ${targetX},${targetY + targetHeight} C ${cx},${targetY + targetHeight} ${cx},${sourceY + sourceHeight} ${sourceX},${sourceY + sourceHeight}`

  const d = `${topPath} ${bottomPath} Z`

  return (
    <path
      d={d}
      fill={color}
      fillOpacity={opacity}
      stroke="none"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: 'default', transition: 'fill-opacity 0.15s' }}
    />
  )
}
